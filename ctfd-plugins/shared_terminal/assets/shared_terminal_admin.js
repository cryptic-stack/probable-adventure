"use strict";

(function () {
  const root = document.getElementById("shared-terminal-admin-root");
  if (!root) return;

  const refreshBtn = document.getElementById("st-refresh");
  const body = document.getElementById("st-body");
  const status = document.getElementById("st-status");

  function csrfHeader() {
    const nonce = window.init && window.init.csrfNonce ? window.init.csrfNonce : "";
    return nonce ? { "CSRF-Token": nonce } : {};
  }

  function esc(v) {
    return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  async function getJSON(path) {
    const res = await fetch(path, { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Request failed");
    return data.data;
  }

  async function postJSON(path, payload) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...csrfHeader() },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Request failed");
    return data.data;
  }

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.classList.toggle("text-danger", Boolean(isError));
  }

  function renderRows(mapData) {
    const rows = Object.entries(mapData || {}).map(function (entry) {
      const key = entry[0];
      const value = entry[1] || {};
      const parts = key.split(":");
      const challengeId = parts[0] || value.challenge_id || "";
      const sessionId = parts[1] || value.session_id || "";
      return {
        challengeId: challengeId,
        sessionId: sessionId,
        actorId: value.actor_id,
        username: value.username,
        expiresAt: value.expires_at,
      };
    });

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No active locks</td></tr>';
      return;
    }

    body.innerHTML = rows
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" + esc(row.challengeId) + "</td>" +
          "<td><code>" + esc(row.sessionId) + "</code></td>" +
          "<td><code>" + esc(row.actorId) + "</code></td>" +
          "<td>" + esc(row.username) + "</td>" +
          "<td>" + esc(row.expiresAt) + "</td>" +
          '<td><button class="btn btn-sm btn-outline-danger st-release" data-cid="' + esc(row.challengeId) + '" data-sid="' + esc(row.sessionId) + '">Release</button></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  async function refreshAll() {
    try {
      setStatus("Loading...");
      const data = await getJSON("/plugins/shared-terminal/admin/locks");
      renderRows(data || {});
      setStatus("Loaded active locks.");
    } catch (err) {
      setStatus(err.message || "Failed", true);
    }
  }

  refreshBtn.addEventListener("click", refreshAll);

  body.addEventListener("click", async function (event) {
    const btn = event.target.closest(".st-release");
    if (!btn) return;
    try {
      await postJSON("/plugins/shared-terminal/admin/locks/release", {
        challenge_id: btn.dataset.cid,
        session_id: btn.dataset.sid,
      });
      refreshAll();
    } catch (err) {
      setStatus(err.message || "Release failed", true);
    }
  });

  refreshAll();
})();
