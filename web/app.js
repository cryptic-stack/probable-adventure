const $ = (id) => document.getElementById(id);

let es = null;
let currentRangeId = null;
let currentRangeData = null;

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.style.color = isError ? "#b42318" : "#5b6974";
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data };
}

function closeEvents() {
  if (!es) return;
  es.close();
  es = null;
}

function getRoomAccessByService(rangeData) {
  const links = Array.isArray(rangeData?.access) ? rangeData.access : [];
  const out = {};
  for (const item of links) {
    if (item?.service_name && item?.url) out[item.service_name] = item.url;
  }
  return out;
}

function roomByService(rangeData, serviceName) {
  const rooms = Array.isArray(rangeData?.rooms) ? rangeData.rooms : [];
  return rooms.find((r) => r.service_name === serviceName) || null;
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

function renderRanges(items) {
  const el = $("ranges");
  if (!Array.isArray(items) || !items.length) {
    el.innerHTML = '<div class="item muted">No room groups</div>';
    return;
  }
  el.innerHTML = items.map((r) => {
    return `<div class="item">
      <span><strong>#${r.id}</strong> ${r.name} <span class="muted">(${r.status})</span></span>
      <button data-range-open="${r.id}">Open</button>
    </div>`;
  }).join("");

  el.querySelectorAll("button[data-range-open]").forEach((btn) => {
    btn.onclick = async () => {
      $("rangeId").value = btn.dataset.rangeOpen;
      await loadRangeDetail();
    };
  });
}

function renderHero(rangeData) {
  const range = rangeData?.range;
  if (!range) {
    $("activeRangeTitle").textContent = "No Group Selected";
    $("activeRangeMeta").textContent = "Load a room group to manage and open rooms.";
    return;
  }
  $("activeRangeTitle").textContent = `#${range.id} ${range.name}`;
  $("activeRangeMeta").textContent = `Team ${range.team_id} | Status: ${range.status}`;
}

function renderRooms(rangeData) {
  const grid = $("roomsGrid");
  const byService = getRoomAccessByService(rangeData);
  const rooms = Array.isArray(rangeData?.rooms) ? rangeData.rooms : [];
  const names = Array.from(new Set([
    ...Object.keys(byService),
    ...rooms.map((r) => r.service_name).filter(Boolean),
  ])).sort();

  if (!names.length) {
    grid.innerHTML = '<div class="room muted">No rooms yet</div>';
    return;
  }

  grid.innerHTML = names.map((serviceName) => {
    const room = roomByService(rangeData, serviceName);
    const link = byService[serviceName] || "";
    const status = room?.status || "pending";
    const raw = link ? `<a class="mono" href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>` : '<span class="muted">No access URL yet</span>';
    return `<article class="room">
      <h3>${serviceName}</h3>
      <div class="pill">${status}</div>
      <div style="display:grid;gap:8px;">
        <div>${raw}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button data-room-open="${serviceName}" ${link ? "" : "disabled"}>Open</button>
          <button data-room-copy="${serviceName}" ${link ? "" : "disabled"}>Copy URL</button>
          <button data-room-start="${serviceName}">Start</button>
          <button data-room-stop="${serviceName}">Stop</button>
          <button data-room-restart="${serviceName}">Restart</button>
        </div>
      </div>
    </article>`;
  }).join("");

  grid.querySelectorAll("button[data-room-open]").forEach((btn) => {
    btn.onclick = () => {
      const service = btn.dataset.roomOpen;
      const link = byService[service] || "";
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    };
  });
  grid.querySelectorAll("button[data-room-copy]").forEach((btn) => {
    btn.onclick = () => {
      const service = btn.dataset.roomCopy;
      copyText(byService[service] || "");
      setStatus(`copied room URL for ${service}`);
    };
  });
  grid.querySelectorAll("button[data-room-start]").forEach((btn) => {
    btn.onclick = () => roomAction(btn.dataset.roomStart, "start");
  });
  grid.querySelectorAll("button[data-room-stop]").forEach((btn) => {
    btn.onclick = () => roomAction(btn.dataset.roomStop, "stop");
  });
  grid.querySelectorAll("button[data-room-restart]").forEach((btn) => {
    btn.onclick = () => roomAction(btn.dataset.roomRestart, "restart");
  });
}

function renderRange(rangeData) {
  currentRangeData = rangeData;
  renderHero(rangeData);
  renderRooms(rangeData);
  $("rangeDetail").textContent = JSON.stringify(rangeData, null, 2);
}

function attachEvents(rangeId) {
  closeEvents();
  $("events").textContent = "";
  es = new EventSource(`/api/ranges/${rangeId}/events`, { withCredentials: true });
  es.addEventListener("event", (ev) => {
    let line = ev.data;
    try {
      const e = JSON.parse(ev.data);
      const ts = e?.created_at ? new Date(e.created_at).toLocaleTimeString() : new Date().toLocaleTimeString();
      line = `${ts} | ${(e?.level || "info").toUpperCase()} | ${e?.kind || "event"} | ${e?.message || ""}`;
    } catch {}
    $("events").textContent += line + "\n";
    $("events").scrollTop = $("events").scrollHeight;
  });
  es.onerror = () => setStatus("SSE disconnected/retrying", true);
}

async function loadMe() {
  const r = await api("/api/me");
  $("me").textContent = r.ok ? `${r.data.email} (${r.data.role})` : "anonymous";
}

async function loadImageCatalog() {
  const select = $("imageRef");
  const r = await api("/api/catalog/images");
  if (!r.ok || !Array.isArray(r.data)) {
    select.innerHTML = '<option value="">No images found</option>';
    return;
  }

  const score = (img) => {
    const x = String(img || "").toLowerCase();
    if (x.includes("neko") || x.includes("desktop")) return 5;
    if (x.includes("base-user")) return 4;
    if (x.includes("web")) return 3;
    return 1;
  };

  const sorted = r.data
    .slice()
    .sort((a, b) => score(b.image) - score(a.image) || a.image.localeCompare(b.image));
  select.innerHTML = sorted.map((i) => `<option value="${i.image}">${i.image}</option>`).join("");
}

async function loadRanges() {
  const r = await api("/api/ranges");
  if (!r.ok) {
    setStatus(`failed to load room groups (${r.status})`, true);
    return;
  }
  renderRanges(r.data);
}

async function loadRangeDetail() {
  const id = Number($("rangeId").value || 0);
  if (!id) {
    setStatus("range id is required", true);
    return;
  }
  const r = await api(`/api/ranges/${id}`);
  if (!r.ok) {
    setStatus(`room group ${id} not found`, true);
    return;
  }
  currentRangeId = id;
  renderRange(r.data);
  attachEvents(id);
  setStatus(`loaded room group #${id}`);
}

async function createRange() {
  const teamID = Number($("teamId").value || 0);
  if (!teamID) {
    setStatus("team_id is required", true);
    return;
  }

  const roomName = ($("roomName").value || "").trim() || "desktop";
  const image = ($("imageRef").value || "").trim();
  if (!image) {
    setStatus("choose an image", true);
    return;
  }

  const body = {
    team_id: teamID,
    name: ($("rangeName").value || "").trim(),
    rooms: [{
      name: roomName,
      image,
      network: ($("roomNetwork").value || "guest").trim(),
    }],
    room: {
      user_pass: $("roomUserPass").value.trim(),
      admin_pass: $("roomAdminPass").value.trim(),
      max_connections: Number($("roomMaxConn").value || 0),
      control_protection: true,
    },
  };

  const r = await api("/api/ranges", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`failed to create room group (${r.status}): ${detail}`, true);
    return;
  }

  const id = r?.data?.range?.id;
  setStatus(`room group queued (#${id})`);
  if (id) $("rangeId").value = String(id);
  await loadRanges();
  if (id) await loadRangeDetail();
}

async function roomAction(service, action) {
  const id = Number($("rangeId").value || currentRangeId || 0);
  if (!id || !service) {
    setStatus("room group and service are required", true);
    return;
  }
  const r = await api(`/api/ranges/${id}/rooms/${encodeURIComponent(service)}/${action}`, { method: "POST" });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`${action} failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`${service}: ${action} requested`);
  await loadRangeDetail();
}

async function destroyRange() {
  const id = Number($("rangeId").value || currentRangeId || 0);
  if (!id) return;
  const r = await api(`/api/ranges/${id}/destroy`, { method: "POST" });
  if (!r.ok) {
    setStatus(`destroy failed (${r.status})`, true);
    return;
  }
  setStatus(`destroy queued for #${id}`);
  await loadRanges();
}

async function resetRange() {
  const id = Number($("rangeId").value || currentRangeId || 0);
  if (!id) return;
  const r = await api(`/api/ranges/${id}/reset`, { method: "POST" });
  if (!r.ok) {
    setStatus(`recreate failed (${r.status})`, true);
    return;
  }
  setStatus(`recreate queued for #${id}`);
  await loadRanges();
}

async function refreshAll() {
  await loadMe();
  await loadImageCatalog();
  await loadRanges();
  if (Number($("rangeId").value || 0)) await loadRangeDetail();
}

$("login").onclick = () => { window.location = "/auth/google/login"; };
$("logout").onclick = async () => {
  await api("/auth/logout", { method: "POST" });
  closeEvents();
  setStatus("logged out");
  await refreshAll();
};
$("refreshAll").onclick = refreshAll;
$("refreshImages").onclick = loadImageCatalog;
$("createRange").onclick = createRange;
$("loadRange").onclick = loadRangeDetail;
$("destroyRange").onclick = destroyRange;
$("resetRange").onclick = resetRange;

window.addEventListener("beforeunload", closeEvents);

(async function init() {
  await refreshAll();
})();
