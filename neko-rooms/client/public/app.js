const statusLine = document.getElementById('statusLine');
const roomsBody = document.getElementById('roomsBody');
const reloadBtn = document.getElementById('reloadBtn');
const refreshSeconds = document.getElementById('refreshSeconds');
const createForm = document.getElementById('createForm');
const imageSelect = document.getElementById('image');

let refreshTimer = null;
let roomsConfig = null;

function absUrl(url) {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return '#';
  }
}

function setStatus(message, error = false) {
  statusLine.textContent = message;
  statusLine.className = error ? 'err' : 'muted';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadConfig() {
  roomsConfig = await api('/api/config/rooms');
  const images = Array.isArray(roomsConfig.neko_images) ? roomsConfig.neko_images : [];
  imageSelect.innerHTML = '';
  for (const img of images) {
    const opt = document.createElement('option');
    opt.value = img;
    opt.textContent = img;
    imageSelect.appendChild(opt);
  }
}

function roomState(room) {
  if (room.running && room.paused) return 'paused';
  if (room.running) return room.is_ready ? 'running' : 'starting';
  return 'stopped';
}

function actionButton(label, fn) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', fn);
  return btn;
}

function renderRooms(rooms) {
  roomsBody.innerHTML = '';
  if (!rooms.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="muted">No rooms found.</td>';
    roomsBody.appendChild(tr);
    return;
  }

  for (const room of rooms) {
    const tr = document.createElement('tr');

    const link = absUrl(room.url || '#');
    const state = roomState(room);

    const nameTd = document.createElement('td');
    nameTd.textContent = room.name || room.id || '(unnamed)';
    tr.appendChild(nameTd);

    const imgTd = document.createElement('td');
    imgTd.textContent = room.neko_image || '-';
    tr.appendChild(imgTd);

    const stateTd = document.createElement('td');
    stateTd.textContent = `${state}${room.status ? ` (${room.status})` : ''}`;
    stateTd.className = room.running ? 'ok' : 'muted';
    tr.appendChild(stateTd);

    const linkTd = document.createElement('td');
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link;
    linkTd.appendChild(a);
    tr.appendChild(linkTd);

    const actionsTd = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(actionButton('Start', () => roomAction(room.id, 'start')));
    actions.appendChild(actionButton('Stop', () => roomAction(room.id, 'stop')));
    actions.appendChild(actionButton('Restart', () => roomAction(room.id, 'restart')));
    actions.appendChild(actionButton('Delete', () => roomDelete(room.id, room.name || room.id)));
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    roomsBody.appendChild(tr);
  }
}

async function loadRooms() {
  setStatus('Loading rooms...');
  const rooms = await api('/api/rooms');
  renderRooms(Array.isArray(rooms) ? rooms : []);
  setStatus(`Loaded ${Array.isArray(rooms) ? rooms.length : 0} rooms.`);
}

async function roomAction(roomId, action) {
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}/${action}`, { method: 'POST' });
    await loadRooms();
  } catch (err) {
    setStatus(`Action failed: ${err.message}`, true);
  }
}

async function roomDelete(roomId, roomName) {
  const ok = window.confirm(`Delete room "${roomName}"?`);
  if (!ok) return;
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
    await loadRooms();
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`, true);
  }
}

function buildCreatePayload(formData) {
  const payload = {
    name: formData.get('name')?.toString().trim(),
    neko_image: formData.get('image')?.toString(),
    max_connections: Number(formData.get('maxConnections') || 1),
    user_pass: formData.get('userPass')?.toString() || '',
    admin_pass: formData.get('adminPass')?.toString() || '',
  };
  if (!payload.name) throw new Error('room name is required');
  if (!payload.neko_image) throw new Error('image is required');
  if (Number.isNaN(payload.max_connections) || payload.max_connections < 0) {
    throw new Error('max connections must be 0 or greater');
  }
  return payload;
}

async function createRoom(event) {
  event.preventDefault();
  try {
    const formData = new FormData(createForm);
    const payload = buildCreatePayload(formData);
    const startNow = formData.get('startNow') === 'on';
    await api(`/api/rooms?start=${startNow ? 'true' : 'false'}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    createForm.reset();
    if (imageSelect.options.length > 0) imageSelect.selectedIndex = 0;
    document.getElementById('maxConnections').value = '1';
    document.getElementById('startNow').checked = true;
    await loadRooms();
  } catch (err) {
    setStatus(`Create failed: ${err.message}`, true);
  }
}

function resetRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const seconds = Number(refreshSeconds.value);
  if (seconds > 0) {
    refreshTimer = window.setInterval(() => {
      loadRooms().catch((err) => setStatus(`Refresh failed: ${err.message}`, true));
    }, seconds * 1000);
  }
}

reloadBtn.addEventListener('click', () => {
  loadRooms().catch((err) => setStatus(`Reload failed: ${err.message}`, true));
});
refreshSeconds.addEventListener('change', resetRefresh);
createForm.addEventListener('submit', createRoom);

(async function init() {
  try {
    await loadConfig();
    await loadRooms();
    resetRefresh();
  } catch (err) {
    setStatus(`Startup failed: ${err.message}`, true);
  }
})();
