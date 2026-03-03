"use strict";

(function () {
  const root = document.getElementById("team-chat-admin-root");
  if (!root) return;

  const roomFilter = document.getElementById("tc-room-filter");
  const refreshBtn = document.getElementById("tc-refresh");
  const purgeBtn = document.getElementById("tc-purge-room");
  const body = document.getElementById("tc-body");
  const status = document.getElementById("tc-status");

  function csrfHeader() {
    const nonce = window.init && window.init.csrfNonce ? window.init.csrfNonce : "";
    return nonce ? { "CSRF-Token": nonce } : {};
  }

  async function getJSON(path) {
    const res = await fetch(path, { credentials: "same-origin" });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error("Non-JSON response (" + res.status + ")");
    }
    if (!res.ok || !data.success) throw new Error(data.error || data.detail || "Request failed");
    return data.data;
  }

  async function postJSON(path, payload) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...csrfHeader() },
      body: JSON.stringify(payload || {}),
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error("Non-JSON response (" + res.status + ")");
    }
    if (!res.ok || !data.success) throw new Error(data.error || data.detail || "Request failed");
    return data.data;
  }

  function esc(v) {
    return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("text-danger", Boolean(isError));
  }

  async function loadRooms() {
    const counts = await getJSON("/plugins/team-chat/admin/rooms");
    const selected = roomFilter.value;
    roomFilter.innerHTML = '<option value="">All Rooms</option>';
    Object.keys(counts || {}).sort().forEach(function (room) {
      const option = document.createElement("option");
      option.value = room;
      option.textContent = room + " (" + counts[room] + ")";
      roomFilter.appendChild(option);
    });
    roomFilter.value = selected || "";
  }

  function renderRows(rows) {
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No messages</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" + esc(row.id) + "</td>" +
          "<td><code>" + esc(row.room) + "</code></td>" +
          "<td>" + esc(row.username || row.user_id) + "</td>" +
          "<td>" + esc(row.text) + "</td>" +
          "<td>" + esc(row.created_at) + "</td>" +
          '<td><button class="btn btn-sm btn-outline-danger tc-del" data-id="' + esc(row.id) + '">Delete</button></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  async function refreshAll() {
    try {
      setStatus("Loading...");
      await loadRooms();
      const room = roomFilter.value ? "?room=" + encodeURIComponent(roomFilter.value) : "";
      const rows = await getJSON("/plugins/team-chat/admin/messages" + room + (room ? "&" : "?") + "limit=300");
      renderRows(rows);
      setStatus("Loaded " + (rows || []).length + " messages.");
    } catch (err) {
      setStatus(err.message || "Failed", true);
    }
  }

  refreshBtn.addEventListener("click", refreshAll);
  roomFilter.addEventListener("change", refreshAll);

  purgeBtn.addEventListener("click", async function () {
    const room = roomFilter.value;
    if (!room) {
      setStatus("Select a room first", true);
      return;
    }
    try {
      const result = await postJSON("/plugins/team-chat/admin/rooms/" + encodeURIComponent(room) + "/purge", {});
      setStatus("Purged " + result.removed + " messages from " + room);
      refreshAll();
    } catch (err) {
      setStatus(err.message || "Purge failed", true);
    }
  });

  body.addEventListener("click", async function (event) {
    const btn = event.target.closest(".tc-del");
    if (!btn) return;
    try {
      await postJSON("/plugins/team-chat/admin/messages/" + btn.dataset.id + "/delete", {});
      refreshAll();
    } catch (err) {
      setStatus(err.message || "Delete failed", true);
    }
  });

  refreshAll();
})();
