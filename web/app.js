const $ = (id) => document.getElementById(id);

let es = null;
let currentRangeId = null;
let currentRangeData = null;
let selectedRoomService = "";
let imageCatalog = [];
let draftRooms = [];

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

function renderDraftRooms() {
  const el = $("draftRooms");
  if (!draftRooms.length) {
    el.innerHTML = '<div class="item muted">No rooms added</div>';
    return;
  }
  el.innerHTML = draftRooms.map((r, i) =>
    `<div class="item">
      <span><strong>${r.name}</strong> <span class="muted">(${r.network})</span><br><span class="mono muted">${r.image}</span></span>
      <button data-draft-del="${i}">Remove</button>
    </div>`
  ).join("");
  el.querySelectorAll("button[data-draft-del]").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.draftDel);
      if (Number.isInteger(idx) && idx >= 0) draftRooms.splice(idx, 1);
      renderDraftRooms();
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
  $("activeRangeMeta").textContent = `Team ${range.team_id} | Status: ${range.status}`;
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

function renderRoomDrawer(rangeData) {
  const byService = getRoomAccessByService(rangeData);
  const service = selectedRoomService || Object.keys(byService)[0] || "";
  const room = roomSettingsForService(rangeData, service);
  const link = byService[service] || "";

  if (!service) {
    $("roomDrawerTitle").textContent = "No Room Selected";
    $("roomDrawerStatus").textContent = "Select a room card.";
    $("roomDrawerLink").textContent = "No link";
    $("openSelectedRoom").disabled = true;
    $("editSelectedRoom").disabled = true;
    return;
  }
  $("roomDrawerTitle").textContent = service;
  $("roomDrawerStatus").textContent = `Status: ${room?.status || "pending"}`;
  $("roomDrawerLink").innerHTML = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`
    : "No room link yet";
  $("openSelectedRoom").disabled = !link;
  $("editSelectedRoom").disabled = false;
}

function renderRooms(rangeData) {
  const grid = $("roomsGrid");
  const rooms = Array.isArray(rangeData?.rooms) ? rangeData.rooms : [];
  const byService = getRoomAccessByService(rangeData);
  const services = Object.keys(byService);

  if (!services.length && !rooms.length) {
    grid.innerHTML = '<div class="room-card muted">No rooms</div>';
    renderRoomDrawer(rangeData);
    return;
  }

  const all = new Set([...services, ...rooms.map((r) => r.service_name).filter(Boolean)]);
  const ordered = Array.from(all).sort();
  if (!selectedRoomService || !ordered.includes(selectedRoomService)) {
    selectedRoomService = ordered[0] || "";
  }
  grid.innerHTML = ordered.map((serviceName) => {
    const room = roomSettingsForService(rangeData, serviceName);
    const status = room?.status || "pending";
    const link = byService[serviceName] || "";
    return `<div class="room-card ${selectedRoomService === serviceName ? "active" : ""}" data-room-select="${serviceName}">
      <div class="room-head">
        <strong>${serviceName}</strong>
        <span class="pill">${status}</span>
      </div>
      <div class="toolbar">
        <button data-room-open="${serviceName}" ${link ? "" : "disabled"}>Open</button>
        <button data-room-edit="${serviceName}">Settings</button>
      </div>
    </div>`;
  }).join("");

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
  grid.querySelectorAll("[data-room-select]").forEach((el) => {
    el.onclick = (ev) => {
      if (ev.target && ev.target.tagName === "BUTTON") return;
      selectedRoomService = el.dataset.roomSelect || "";
      renderRooms(rangeData);
    };
  });
  renderRoomDrawer(rangeData);
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
    imageCatalog = [];
    select.innerHTML = '<option value="">No images found</option>';
    return;
  }
  imageCatalog = r.data.slice();
  select.innerHTML = imageCatalog.map((i) => `<option value="${i.image}">${i.image}</option>`).join("");
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

function addDraftRoom() {
  const name = ($("newRoomName").value || "").trim() || `room-${draftRooms.length + 1}`;
  const image = ($("imageRef").value || "").trim();
  const network = ($("newRoomNetwork").value || "guest").trim();
  if (!image) {
    setStatus("select an image first", true);
    return;
  }
  if (draftRooms.find((r) => r.name === name)) {
    setStatus("room name must be unique in this range", true);
    return;
  }
  draftRooms.push({ name, image, network });
  renderDraftRooms();
}

async function createRange() {
  const teamID = Number($("teamId").value);
  if (!teamID) {
    setStatus("team_id is required", true);
    return;
  }
  if (!draftRooms.length) {
    setStatus("add at least one room", true);
    return;
  }
  const body = {
    team_id: teamID,
    name: $("rangeName").value.trim(),
    rooms: draftRooms.map((r) => ({ name: r.name, image: r.image, network: r.network })),
    room: {
      user_pass: $("newRoomUserPass").value.trim(),
      admin_pass: $("newRoomAdminPass").value.trim(),
      max_connections: Number($("newRoomMaxConn").value) || 0,
      control_protection: true,
    },
  };
  const r = await api("/api/ranges", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`create range failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Range queued (#${r.data.range.id})`);
  draftRooms = [];
  renderDraftRooms();
  $("rangeId").value = r.data.range.id;
  await loadRanges();
  await loadRangeDetail();
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
$("refreshImages").onclick = loadImageCatalog;
$("addRoom").onclick = addDraftRoom;
$("createRange").onclick = createRange;
$("loadRange").onclick = loadRangeDetail;
$("updateRoom").onclick = updateRoom;
$("destroyRange").onclick = destroyRange;
$("resetRange").onclick = resetRange;
$("closeRoomModal").onclick = closeRoomModal;
$("openSelectedRoom").onclick = () => {
  if (!currentRangeData) return;
  const links = getRoomAccessByService(currentRangeData);
  const link = links[selectedRoomService || ""] || "";
  if (link) window.open(link, "_blank", "noopener,noreferrer");
};
$("editSelectedRoom").onclick = () => {
  if (!selectedRoomService) return;
  openRoomModal(selectedRoomService);
};
$("roomModal").onclick = (ev) => {
  if (ev.target === $("roomModal")) closeRoomModal();
};

window.addEventListener("beforeunload", closeEvents);

(async function init() {
  renderDraftRooms();
  await refreshAll();
})();
