"use strict";

(function () {
  const root = document.getElementById("team-drive-admin-root");
  if (!root) return;

  const refreshBtn = document.getElementById("td-refresh");
  const body = document.getElementById("td-body");
  const status = document.getElementById("td-status");

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

  function renderRows(rows) {
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No file entries</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" + esc(row.id) + "</td>" +
          "<td><code>" + esc(row.scope_id) + "</code></td>" +
          "<td>" + esc(row.name) + "</td>" +
          "<td>" + esc(row.path) + "</td>" +
          "<td>" + esc(row.notes) + "</td>" +
          "<td>" + esc(row.created_at) + "</td>" +
          '<td><button class="btn btn-sm btn-outline-danger td-del" data-id="' + esc(row.id) + '">Delete</button></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  async function refreshAll() {
    try {
      setStatus("Loading...");
      const rows = await getJSON("/plugins/team-drive/admin/all");
      renderRows(rows || []);
      setStatus("Loaded " + (rows || []).length + " file entries.");
    } catch (err) {
      setStatus(err.message || "Failed", true);
    }
  }

  refreshBtn.addEventListener("click", refreshAll);

  body.addEventListener("click", async function (event) {
    const btn = event.target.closest(".td-del");
    if (!btn) return;
    try {
      await postJSON("/plugins/team-drive/admin/files/" + btn.dataset.id + "/delete", {});
      refreshAll();
    } catch (err) {
      setStatus(err.message || "Delete failed", true);
    }
  });

  refreshAll();
})();
