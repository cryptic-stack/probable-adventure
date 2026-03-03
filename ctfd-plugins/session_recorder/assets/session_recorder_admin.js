"use strict";

(function () {
  const root = document.getElementById("session-recorder-admin-root");
  if (!root) return;

  const challengeInput = document.getElementById("sr-challenge");
  const sessionInput = document.getElementById("sr-session");
  const refreshBtn = document.getElementById("sr-refresh");
  const pruneBtn = document.getElementById("sr-prune");
  const body = document.getElementById("sr-body");
  const status = document.getElementById("sr-status");

  function csrfHeader() {
    const nonce = window.init && window.init.csrfNonce ? window.init.csrfNonce : "";
    return nonce ? { "CSRF-Token": nonce } : {};
  }

  function esc(v) {
    return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("text-danger", Boolean(isError));
  }

  function renderRows(rows) {
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No events</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" + esc(row.id) + "</td>" +
          "<td>" + esc(row.challenge_id) + "</td>" +
          "<td><code>" + esc(row.session_id) + "</code></td>" +
          "<td>" + esc(row.event_type) + "</td>" +
          "<td>" + esc(row.team_id || row.user_id) + "</td>" +
          "<td>" + esc(row.created_at) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function refreshAll() {
    try {
      setStatus("Loading...");
      const q = [];
      if (challengeInput.value.trim()) q.push("challenge_id=" + encodeURIComponent(challengeInput.value.trim()));
      if (sessionInput.value.trim()) q.push("session_id=" + encodeURIComponent(sessionInput.value.trim()));
      q.push("limit=500");
      const rows = await getJSON("/plugins/session-recorder/admin/events?" + q.join("&"));
      renderRows(rows || []);
      setStatus("Loaded " + (rows || []).length + " events.");
    } catch (err) {
      setStatus(err.message || "Failed", true);
    }
  }

  refreshBtn.addEventListener("click", refreshAll);

  pruneBtn.addEventListener("click", async function () {
    try {
      const result = await postJSON("/plugins/session-recorder/admin/events/prune", { keep: 1000 });
      setStatus("Pruned " + result.removed + " events.");
      refreshAll();
    } catch (err) {
      setStatus(err.message || "Prune failed", true);
    }
  });

  refreshAll();
})();
