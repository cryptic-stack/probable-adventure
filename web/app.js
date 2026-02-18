const $ = (id) => document.getElementById(id);
let es = null;
let currentRangeId = null;

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.style.color = isError ? "#a72c2c" : "#5b6a77";
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
  const el = $("templates");
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<div class="item muted">No templates</div>';
    return;
  }
  el.innerHTML = items.map((t) => {
    return `<div class="item"><span><strong>${t.name}</strong> v${t.version} (${t.display_name})</span><button data-template="${t.id}">Use ${t.id}</button></div>`;
  }).join("");
  el.querySelectorAll("button[data-template]").forEach((btn) => {
    btn.onclick = () => { $("templateId").value = btn.dataset.template; };
  });
}

function renderRanges(items) {
  const el = $("ranges");
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<div class="item muted">No ranges</div>';
    return;
  }
  el.innerHTML = items.map((r) => {
    return `<div class="item"><span><strong>#${r.id}</strong> ${r.name} <span class="muted">(${r.status})</span></span><button data-range="${r.id}">Open</button></div>`;
  }).join("");
  el.querySelectorAll("button[data-range]").forEach((btn) => {
    btn.onclick = async () => {
      $("rangeId").value = btn.dataset.range;
      await loadRangeDetail();
    };
  });
}

function renderPorts(rangeData) {
  const ports = rangeData?.range?.metadata_json?.ports;
  if (!ports || Object.keys(ports).length === 0) {
    $("ports").textContent = "No published ports";
    return;
  }
  const lines = [];
  for (const [service, mapping] of Object.entries(ports)) {
    lines.push(`${service}: ${JSON.stringify(mapping)}`);
  }
  $("ports").textContent = lines.join("\n");
}

async function loadMe() {
  const r = await api("/api/me");
  if (r.ok) {
    $("me").textContent = `${r.data.email} (${r.data.role})`;
  } else {
    $("me").textContent = "anonymous";
  }
}

async function loadTemplates() {
  const r = await api("/api/templates");
  if (!r.ok) {
    setStatus(`templates error (${r.status})`, true);
    return;
  }
  renderTemplates(r.data);
}

async function loadRanges() {
  const r = await api("/api/ranges");
  if (!r.ok) {
    setStatus(`ranges error (${r.status})`, true);
    return;
  }
  renderRanges(r.data);
}

function attachEvents(rangeId) {
  closeEvents();
  $("events").textContent = "";
  es = new EventSource(`/api/ranges/${rangeId}/events`, { withCredentials: true });
  es.addEventListener("event", (ev) => {
    $("events").textContent += ev.data + "\n";
    $("events").scrollTop = $("events").scrollHeight;
  });
  es.onerror = () => setStatus("SSE disconnected/retrying", true);
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
  $("rangeDetail").textContent = JSON.stringify(r.data, null, 2);
  renderPorts(r.data);
  attachEvents(id);
  setStatus(`Loaded range #${id}`);
}

async function createRange() {
  const body = {
    team_id: Number($("teamId").value),
    template_id: Number($("templateId").value),
    name: $("rangeName").value,
  };
  const r = await api("/api/ranges", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    setStatus(`create range failed (${r.status})`, true);
    return;
  }
  setStatus(`Range queued (#${r.data.range.id})`);
  await loadRanges();
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

$("login").onclick = () => { window.location = "/auth/google/login"; };
$("logout").onclick = async () => {
  await api("/auth/logout", { method: "POST" });
  closeEvents();
  setStatus("Logged out");
  await loadMe();
};

$("refreshTemplates").onclick = loadTemplates;
$("refreshRanges").onclick = loadRanges;
$("loadRange").onclick = loadRangeDetail;
$("createRange").onclick = createRange;
$("destroyRange").onclick = destroyRange;
$("resetRange").onclick = resetRange;

window.addEventListener("beforeunload", closeEvents);

(async function init() {
  await loadMe();
  await loadTemplates();
  await loadRanges();
})();
