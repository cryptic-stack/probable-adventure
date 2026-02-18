const $ = (id) => document.getElementById(id);

let es = null;
let currentRangeId = null;
let templateCache = [];
let currentRangeData = null;
let selectedRoomService = "";

function parseMaybeJSON(v) {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.style.color = isError ? "#b42318" : "#596573";
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
  if (es) {
    es.close();
    es = null;
  }
}

function renderTemplates(items) {
  templateCache = Array.isArray(items) ? items : [];
  const select = $("templateId");
  const list = $("templates");

  if (!templateCache.length) {
    select.innerHTML = '<option value="">No templates</option>';
    list.innerHTML = '<div class="item muted">No templates</div>';
    return;
  }

  select.innerHTML = templateCache.map((t) =>
    `<option value="${t.id}">${t.id} - ${t.display_name} (${t.name} v${t.version})</option>`
  ).join("");

  list.innerHTML = templateCache.map((t) =>
    `<div class="item"><span><strong>${t.name}</strong> v${t.version}</span><span class="muted">${t.display_name}</span></div>`
  ).join("");
}

function renderRanges(items) {
  const el = $("ranges");
  if (!Array.isArray(items) || !items.length) {
    el.innerHTML = '<div class="item muted">No ranges</div>';
    return;
  }
  el.innerHTML = items.map((r) =>
    `<div class="item">
      <span><strong>#${r.id}</strong> ${r.name} <span class="muted">(${r.status})</span></span>
      <button data-range="${r.id}">Open</button>
    </div>`
  ).join("");
  el.querySelectorAll("button[data-range]").forEach((btn) => {
    btn.onclick = async () => {
      $("rangeId").value = btn.dataset.range;
      await loadRangeDetail();
    };
  });
}

function renderHero(rangeData) {
  const range = rangeData?.range;
  if (!range) {
    $("activeRangeTitle").textContent = "No Range Selected";
    $("activeRangeMeta").textContent = "Select a range from the left panel.";
    return;
  }
  $("activeRangeTitle").textContent = `#${range.id} ${range.name}`;
  $("activeRangeMeta").textContent = `Team ${range.team_id} | Template ${range.template_id} | Status: ${range.status}`;
}

function renderAccessLinks(rangeData) {
  const links = Array.isArray(rangeData?.access) ? rangeData.access : [];
  const el = $("accessLinks");
  if (!links.length) {
    el.textContent = rangeData?.range?.status === "ready"
      ? "No room access links available."
      : "Range is not ready yet.";
    return;
  }
  el.innerHTML = links.map((l) =>
    `<div><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.service_name}: ${l.url}</a></div>`
  ).join("");
}

function roomSettingsForService(rangeData, serviceName) {
  const rooms = Array.isArray(rangeData?.rooms) ? rangeData.rooms : [];
  return rooms.find((r) => r.service_name === serviceName) || null;
}

function hydrateRoomEditor(rangeData, serviceName) {
  $("roomService").value = serviceName || "";
  if (!serviceName) {
    $("roomUserPass").value = "";
    $("roomAdminPass").value = "";
    $("roomMaxConn").value = "";
    return;
  }
  const room = roomSettingsForService(rangeData, serviceName);
  const settings = parseMaybeJSON(room?.settings_json) || {};
  $("roomUserPass").value = settings.user_pass || "";
  $("roomAdminPass").value = settings.admin_pass || "";
  $("roomMaxConn").value = Number.isInteger(settings.max_connections) ? settings.max_connections : "";
}

function getRoomAccessByService(rangeData) {
  const links = Array.isArray(rangeData?.access) ? rangeData.access : [];
  const byService = {};
  for (const l of links) {
    if (l?.service_name && l?.url) byService[l.service_name] = l.url;
  }
  return byService;
}

function openRoomModal(serviceName) {
  selectedRoomService = serviceName || "";
  hydrateRoomEditor(currentRangeData, selectedRoomService);
  $("roomModal").classList.add("show");
}

function closeRoomModal() {
  $("roomModal").classList.remove("show");
}

function renderRooms(rangeData) {
  const grid = $("roomsGrid");
  const rooms = Array.isArray(rangeData?.rooms) ? rangeData.rooms : [];
  const byService = getRoomAccessByService(rangeData);
  const services = Object.keys(byService);

  if (!services.length && !rooms.length) {
    grid.innerHTML = '<div class="room-card muted">No rooms</div>';
    return;
  }

  const all = new Set([...services, ...rooms.map((r) => r.service_name).filter(Boolean)]);
  const cards = [];
  for (const serviceName of all) {
    const room = roomSettingsForService(rangeData, serviceName);
    const status = room?.status || "pending";
    const link = byService[serviceName] || "";
    cards.push(
      `<div class="room-card">
        <div class="room-head">
          <strong>${serviceName}</strong>
          <span class="pill">${status}</span>
        </div>
        <div class="toolbar">
          <button data-room-open="${serviceName}" ${link ? "" : "disabled"}>Open</button>
          <button data-room-edit="${serviceName}">Settings</button>
        </div>
      </div>`
    );
  }
  grid.innerHTML = cards.join("");
  grid.querySelectorAll("button[data-room-open]").forEach((btn) => {
    btn.onclick = () => {
      const svc = btn.dataset.roomOpen;
      const href = byService[svc];
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    };
  });
  grid.querySelectorAll("button[data-room-edit]").forEach((btn) => {
    btn.onclick = () => openRoomModal(btn.dataset.roomEdit);
  });
}

function renderRange(rangeData) {
  currentRangeData = rangeData;
  renderHero(rangeData);
  renderAccessLinks(rangeData);
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
      const level = (e?.level || "info").toUpperCase();
      line = `${ts} | ${level} | ${e?.kind || "event"} | ${e?.message || ""}`;
    } catch {}
    $("events").textContent += line + "\n";
    $("events").scrollTop = $("events").scrollHeight;
  });
  es.onerror = () => setStatus("SSE disconnected/retrying", true);
}

async function loadMe() {
  const r = await api("/api/me");
  if (!r.ok) {
    $("me").textContent = "anonymous";
    return;
  }
  $("me").textContent = `${r.data.email} (${r.data.role})`;
}

async function loadTemplates() {
  const r = await api("/api/templates");
  if (!r.ok) {
    setStatus(`templates error (${r.status})`, true);
    renderTemplates([]);
    return;
  }
  renderTemplates(r.data);
}

async function loadImageCatalog() {
  const select = $("imageRef");
  const r = await api("/api/catalog/images");
  if (!r.ok || !Array.isArray(r.data)) {
    select.innerHTML = '<option value="">No images found</option>';
    return;
  }
  select.innerHTML = r.data.map((i) => `<option value="${i.image}">${i.image}</option>`).join("");
}

async function loadRanges() {
  const r = await api("/api/ranges");
  if (!r.ok) {
    setStatus(`ranges error (${r.status})`, true);
    return;
  }
  renderRanges(r.data);
}

async function loadRangeDetail() {
  const id = Number($("rangeId").value);
  if (!id) return;
  const r = await api(`/api/ranges/${id}`);
  if (!r.ok) {
    setStatus(`range ${id} not found or forbidden`, true);
    return;
  }
  currentRangeId = id;
  renderRange(r.data);
  attachEvents(id);
  setStatus(`Loaded range #${id}`);
}

async function createRange() {
  const body = {
    team_id: Number($("teamId").value),
    template_id: Number($("templateId").value),
    name: $("rangeName").value.trim(),
  };
  if (!body.team_id || !body.template_id) {
    setStatus("team_id and template_id are required", true);
    return;
  }
  const r = await api("/api/ranges", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`create range failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Range queued (#${r.data.range.id})`);
  $("rangeId").value = r.data.range.id;
  await loadRanges();
  await loadRangeDetail();
}

async function createTemplate() {
  const body = {
    name: $("tplName").value.trim(),
    display_name: $("tplDisplayName").value.trim(),
    description: $("tplDescription").value.trim(),
    quota: Number($("tplQuota").value) || 1,
    definition_json: {
      name: $("tplName").value.trim(),
      room: {
        user_pass: $("tplNekoUserPass").value.trim(),
        admin_pass: $("tplNekoAdminPass").value.trim(),
        max_connections: Number($("tplNekoMaxConn").value) || 0,
        control_protection: true,
      },
      services: [{
        name: $("tplServiceName").value.trim() || "desktop",
        image: $("imageRef").value,
        network: $("tplNetwork").value || "guest",
        ports: [{ container: 8080, host: 0, protocol: "tcp" }, { container: 52000, host: 0, protocol: "udp" }],
      }],
    },
  };
  if (!body.name || !body.display_name || !body.definition_json.services[0].image) {
    setStatus("template name, display name, and image are required", true);
    return;
  }
  const r = await api("/api/templates", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`create template failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Template created (#${r.data.id})`);
  await loadTemplates();
}

async function updateRoom() {
  const id = Number($("rangeId").value || currentRangeId);
  const service = (selectedRoomService || $("roomService").value || "").trim();
  if (!id || !service) {
    setStatus("range id and service are required", true);
    return;
  }
  const room = {
    user_pass: $("roomUserPass").value.trim(),
    admin_pass: $("roomAdminPass").value.trim(),
    max_connections: Number($("roomMaxConn").value) || 0,
    control_protection: true,
  };
  const r = await api(`/api/ranges/${id}/rooms/${encodeURIComponent(service)}`, {
    method: "PUT",
    body: JSON.stringify({ room, reconcile: true }),
  });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`update room failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Room settings saved for ${service}. Reset job queued.`);
  closeRoomModal();
  await loadRangeDetail();
}

async function destroyRange() {
  const id = Number($("rangeId").value || currentRangeId);
  if (!id) return;
  const r = await api(`/api/ranges/${id}/destroy`, { method: "POST" });
  if (!r.ok) {
    setStatus(`destroy enqueue failed (${r.status})`, true);
    return;
  }
  setStatus(`Destroy queued for range #${id}`);
  await loadRanges();
}

async function resetRange() {
  const id = Number($("rangeId").value || currentRangeId);
  if (!id) return;
  const r = await api(`/api/ranges/${id}/reset`, { method: "POST" });
  if (!r.ok) {
    setStatus(`reset enqueue failed (${r.status})`, true);
    return;
  }
  setStatus(`Reset queued for range #${id}`);
  await loadRanges();
}

async function refreshAll() {
  await loadMe();
  await loadImageCatalog();
  await loadTemplates();
  await loadRanges();
  if (Number($("rangeId").value || 0)) await loadRangeDetail();
}

$("login").onclick = () => { window.location = "/auth/google/login"; };
$("logout").onclick = async () => {
  await api("/auth/logout", { method: "POST" });
  closeEvents();
  setStatus("Logged out");
  await refreshAll();
};
$("refreshAll").onclick = refreshAll;
$("createRange").onclick = createRange;
$("loadRange").onclick = loadRangeDetail;
$("updateRoom").onclick = updateRoom;
$("destroyRange").onclick = destroyRange;
$("resetRange").onclick = resetRange;
$("refreshImages").onclick = loadImageCatalog;
$("createTemplate").onclick = createTemplate;
$("closeRoomModal").onclick = closeRoomModal;
$("roomModal").onclick = (ev) => {
  if (ev.target === $("roomModal")) closeRoomModal();
};

window.addEventListener("beforeunload", closeEvents);

(async function init() {
  await refreshAll();
})();
