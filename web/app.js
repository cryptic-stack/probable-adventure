const $ = (id) => document.getElementById(id);
let es = null;
let currentRangeId = null;
let templateCache = [];

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
  templateCache = Array.isArray(items) ? items : [];
  const el = $("templates");
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<div class="item muted">No templates</div>';
    renderTemplateOptions([]);
    return;
  }
  el.innerHTML = items.map((t) => {
    return `<div class="item"><span><strong>${t.name}</strong> v${t.version} (${t.display_name})</span><button data-template="${t.id}">Use ${t.id}</button></div>`;
  }).join("");
  renderTemplateOptions(items);
  el.querySelectorAll("button[data-template]").forEach((btn) => {
    btn.onclick = () => { $("templateId").value = btn.dataset.template; };
  });
}

function renderTemplateOptions(items) {
  const select = $("templateId");
  if (!select) return;
  if (!Array.isArray(items) || items.length === 0) {
    select.innerHTML = '<option value="">No templates</option>';
    return;
  }
  select.innerHTML = items.map((t) => `<option value="${t.id}">${t.id} - ${t.display_name} (${t.name} v${t.version})</option>`).join("");
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

function renderAccessLinks(rangeData) {
  const host = window.location.hostname || "localhost";
  const ports = rangeData?.range?.metadata_json?.ports;
  const links = [];
  if (ports && typeof ports === "object") {
    for (const [serviceName, mapping] of Object.entries(ports)) {
      if (!mapping || typeof mapping !== "object") continue;
      for (const [containerProto, hostBindings] of Object.entries(mapping)) {
        if (!Array.isArray(hostBindings)) continue;
        for (const bind of hostBindings) {
          const hostPort = bind?.HostPort;
          if (!hostPort) continue;
          const containerPort = Number((containerProto || "").split("/")[0] || 0);
          const scheme = containerPort === 443 ? "https" : "http";
          let href = `${scheme}://${host}:${hostPort}`;
          if (containerPort === 6080) {
            href += "/vnc.html?autoconnect=1&resize=scale";
          }
          links.push({ serviceName, href, containerProto });
        }
      }
    }
  }
  const el = $("accessLinks");
  if (!links.length) {
    el.textContent = "No published links";
    return;
  }
  el.innerHTML = links.map((l) =>
    `<div><a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.serviceName}: ${l.href}</a> <span class="muted">(${l.containerProto})</span></div>`
  ).join("");
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
    renderTemplateOptions([]);
    return;
  }
  renderTemplates(r.data);
  if (Array.isArray(r.data) && r.data.length > 0 && !Number($("templateId").value)) {
    $("templateId").value = r.data[0].id;
  }
}

function renderImageOptions(items) {
  const select = $("imageRef");
  if (!select) return;
  if (!Array.isArray(items) || items.length === 0) {
    select.innerHTML = '<option value="">No images found</option>';
    return;
  }
  select.innerHTML = items.map((i) => `<option value="${i.image}">${i.image}</option>`).join("");
}

async function loadImageCatalog() {
  const r = await api("/api/catalog/images");
  if (!r.ok) {
    setStatus(`images catalog error (${r.status})`, true);
    renderImageOptions([]);
    return;
  }
  renderImageOptions(r.data);
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
  renderAccessLinks(r.data);
  renderPorts(r.data);
  attachEvents(id);
  setStatus(`Loaded range #${id}`);
}

async function createRange() {
  const teamId = Number($("teamId").value);
  const templateId = Number($("templateId").value);
  if (!teamId || !templateId) {
    setStatus("team_id and template_id are required", true);
    return;
  }
  const body = {
    team_id: teamId,
    template_id: templateId,
    name: $("rangeName").value,
  };
  const r = await api("/api/ranges", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`create range failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Range queued (#${r.data.range.id})`);
  await loadRanges();
}

async function createTemplate() {
  const image = $("imageRef").value;
  const name = $("tplName").value.trim();
  const displayName = $("tplDisplayName").value.trim();
  const description = $("tplDescription").value.trim();
  const serviceName = $("tplServiceName").value.trim() || "service";
  const network = $("tplNetwork").value || "corporate";
  const quota = Number($("tplQuota").value) || 1;
  const containerPort = Number($("tplContainerPort").value);

  if (!name || !displayName || !image) {
    setStatus("template name, display name, and image are required", true);
    return;
  }

  const ports = Number.isInteger(containerPort) && containerPort > 0
    ? [{ container: containerPort, host: 0 }]
    : [];

  const body = {
    name,
    display_name: displayName,
    description,
    quota,
    definition_json: {
      name,
      services: [{ name: serviceName, image, network, ports }],
    },
  };

  const r = await api("/api/templates", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const detail = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    setStatus(`create template failed (${r.status}): ${detail}`, true);
    return;
  }
  setStatus(`Template created (#${r.data.id})`);
  await loadTemplates();
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
$("refreshImages").onclick = loadImageCatalog;
$("refreshRanges").onclick = loadRanges;
$("loadRange").onclick = loadRangeDetail;
$("createRange").onclick = createRange;
$("createTemplate").onclick = createTemplate;
$("destroyRange").onclick = destroyRange;
$("resetRange").onclick = resetRange;

window.addEventListener("beforeunload", closeEvents);

(async function init() {
  await loadMe();
  await loadImageCatalog();
  await loadTemplates();
  await loadRanges();
})();
