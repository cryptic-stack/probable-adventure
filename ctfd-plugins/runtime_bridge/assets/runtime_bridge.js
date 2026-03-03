"use strict";

(function runtimeBridgeInit() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!localStorage.getItem("theme")) {
    localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }

  function csrfHeader() {
    const nonce = window.init && window.init.csrfNonce ? window.init.csrfNonce : "";
    return nonce ? { "CSRF-Token": nonce } : {};
  }

  async function requestJSON(method, path, payload) {
    const response = await fetch(path, {
      method: method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeader(),
      },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });

    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      // non-json is handled below
    }

    if (!response.ok || !body || body.success !== true) {
      const message = (body && (body.error || body.detail)) || "Request failed";
      throw new Error(message);
    }
    return body.data;
  }

  function getJSON(path) {
    return requestJSON("GET", path);
  }

  function postJSON(path, payload) {
    return requestJSON("POST", path, payload || {});
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setWorkspaceStatus(workspace, state, text) {
    const badge = workspace.querySelector(".rb-status");
    if (!badge) return;
    badge.classList.remove("is-idle", "is-active", "is-error", "is-busy");
    badge.classList.add(state || "is-idle");
    badge.textContent = text || "Idle";
  }

  function setLockStatus(workspace, text, isError) {
    const status = workspace.querySelector(".rb-lock-status");
    if (!status) return;
    status.textContent = text || "No lock";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function setSessionContext(workspace, data) {
    const sessionId = data && data.session_id ? String(data.session_id) : "";
    workspace.dataset.sessionId = sessionId;
  }

  function updateWorkspaceFrame(workspace, data) {
    const iframe = workspace.querySelector(".rb-frame");
    const empty = workspace.querySelector(".rb-empty");
    const openBtn = workspace.querySelector(".rb-open");
    const embedUrl = data && data.embed_url ? data.embed_url : "";
    const externalUrl = data && data.external_url ? data.external_url : embedUrl;

    if (embedUrl && iframe) {
      iframe.src = embedUrl;
      iframe.classList.remove("d-none");
      if (empty) empty.classList.add("d-none");
      if (openBtn) {
        openBtn.href = embedUrl;
        openBtn.classList.remove("disabled");
      }
      return;
    }

    if (empty) {
      empty.classList.remove("d-none");
      if (externalUrl) {
        empty.innerHTML =
          "Embedded workspace unavailable for this challenge.<br><a class=\"rb-open-link\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"" +
          externalUrl +
          "\">Open external access</a>";
      } else {
        empty.textContent = "Start a session to attach terminal or desktop workspace.";
      }
    }
    if (iframe) {
      iframe.removeAttribute("src");
      iframe.classList.add("d-none");
    }
    if (openBtn) {
      if (embedUrl) {
        openBtn.href = embedUrl;
        openBtn.classList.remove("disabled");
      } else {
        openBtn.href = "#";
        openBtn.classList.add("disabled");
      }
    }
  }

  function renderChat(workspace, rows) {
    const list = workspace.querySelector(".rb-chat-list");
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML = "<div class=\"rb-muted\">No messages yet.</div>";
      return;
    }

    list.innerHTML = rows
      .map(function (row) {
        const author = escapeHtml(row.username || row.room || "user");
        const text = escapeHtml(row.text || "");
        const time = escapeHtml(row.created_at || "");
        return (
          "<div class=\"rb-chat-item\">" +
          "<div><strong>" +
          author +
          "</strong></div>" +
          "<div>" +
          text +
          "</div>" +
          "<div class=\"rb-muted\">" +
          time +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  async function refreshChat(workspace) {
    try {
      const rows = await getJSON("/plugins/team-chat/messages?limit=80");
      renderChat(workspace, rows || []);
    } catch (err) {
      renderChat(workspace, []);
    }
  }

  function renderDrive(workspace, payload) {
    const list = workspace.querySelector(".rb-drive-list");
    if (!list) return;
    const rows = payload && Array.isArray(payload.items) ? payload.items : [];
    if (!rows.length) {
      list.innerHTML = "<div class=\"rb-muted\">No team files registered.</div>";
      return;
    }

    list.innerHTML = rows
      .map(function (row) {
        const id = String(row.id || "");
        const name = escapeHtml(row.name || "");
        const path = escapeHtml(row.path || "");
        const link = escapeHtml(row.download_url || "");
        const notes = escapeHtml(row.notes || "");
        return (
          "<div class=\"rb-drive-item\">" +
          "<div><strong>" +
          name +
          "</strong></div>" +
          "<div class=\"rb-muted\">" +
          path +
          "</div>" +
          (notes ? "<div>" + notes + "</div>" : "") +
          (link ? "<div><a target=\"_blank\" rel=\"noopener noreferrer\" href=\"" + link + "\">Open</a></div>" : "") +
          "<button type=\"button\" class=\"btn btn-sm btn-outline-danger rb-drive-del\" data-file-id=\"" + id + "\">Delete</button>" +
          "</div>"
        );
      })
      .join("");
  }

  async function refreshDrive(workspace) {
    try {
      const data = await getJSON("/plugins/team-drive/files");
      renderDrive(workspace, data || {});
    } catch (err) {
      renderDrive(workspace, { items: [] });
    }
  }

  async function refreshLock(workspace, challengeId) {
    const sessionId = workspace.dataset.sessionId || "";
    const acquireBtn = workspace.querySelector(".rb-lock-acquire");
    const releaseBtn = workspace.querySelector(".rb-lock-release");

    if (!sessionId) {
      if (acquireBtn) acquireBtn.disabled = true;
      if (releaseBtn) releaseBtn.disabled = true;
      setLockStatus(workspace, "No active session", false);
      return;
    }

    if (acquireBtn) acquireBtn.disabled = false;
    try {
      const data = await getJSON(
        "/plugins/shared-terminal/locks?challenge_id=" +
          encodeURIComponent(String(challengeId)) +
          "&session_id=" +
          encodeURIComponent(sessionId)
      );
      if (!data) {
        if (releaseBtn) releaseBtn.disabled = true;
        setLockStatus(workspace, "Unlocked", false);
        return;
      }

      const actorId = workspace.dataset.actorId || "";
      const owner = data.username || data.actor_id || "unknown";
      const mine = actorId && data.actor_id === actorId;
      if (releaseBtn) releaseBtn.disabled = !mine;
      setLockStatus(
        workspace,
        (mine ? "You hold lock" : "Locked by " + owner) + (data.expires_at ? " until " + data.expires_at : ""),
        false
      );
    } catch (err) {
      if (releaseBtn) releaseBtn.disabled = true;
      setLockStatus(workspace, err.message || "Lock status failed", true);
    }
  }

  function recordEvent(workspace, challengeId, eventType, payload) {
    const sessionId = workspace.dataset.sessionId || "";
    if (!sessionId) return;
    postJSON("/plugins/session-recorder/events", {
      challenge_id: challengeId,
      session_id: sessionId,
      event_type: eventType,
      payload: payload || {},
    }).catch(function () {
      // best effort only
    });
  }

  async function loadActorIdentity(workspace) {
    try {
      const data = await getJSON("/plugins/team-chat/room");
      if (data && data.team_id) {
        workspace.dataset.actorId = "team-" + String(data.team_id);
      } else if (data && data.user_id) {
        workspace.dataset.actorId = "user-" + String(data.user_id);
      }
    } catch (err) {
      workspace.dataset.actorId = "";
    }
  }

  function bindWorkspaceHandlers(workspace, challengeId) {
    const startBtn = workspace.querySelector(".rb-start");
    const resetBtn = workspace.querySelector(".rb-reset");
    const stopBtn = workspace.querySelector(".rb-stop");

    const chatSendBtn = workspace.querySelector(".rb-chat-send");
    const chatInput = workspace.querySelector(".rb-chat-input");

    const driveAddBtn = workspace.querySelector(".rb-drive-add");
    const driveName = workspace.querySelector(".rb-drive-name");
    const drivePath = workspace.querySelector(".rb-drive-path");
    const driveNotes = workspace.querySelector(".rb-drive-notes");
    const driveList = workspace.querySelector(".rb-drive-list");

    const lockAcquireBtn = workspace.querySelector(".rb-lock-acquire");
    const lockReleaseBtn = workspace.querySelector(".rb-lock-release");

    if (startBtn) {
      startBtn.addEventListener("click", async function () {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Starting");
          const data = await postJSON("/plugins/runtime/challenges/" + challengeId + "/connect", {});
          setSessionContext(workspace, data || {});
          updateWorkspaceFrame(workspace, data || {});
          setWorkspaceStatus(workspace, "is-active", "Connected");
          refreshLock(workspace, challengeId);
          recordEvent(workspace, challengeId, "runtime.start", data || {});
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Start failed");
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async function () {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Resetting");
          const data = await postJSON("/plugins/runtime/challenges/" + challengeId + "/session", { action: "reset" });
          setSessionContext(workspace, data || {});
          updateWorkspaceFrame(workspace, data || {});
          setWorkspaceStatus(workspace, "is-active", "Connected");
          refreshLock(workspace, challengeId);
          recordEvent(workspace, challengeId, "runtime.reset", data || {});
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Reset failed");
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", async function () {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Stopping");
          await postJSON("/plugins/runtime/challenges/" + challengeId + "/session", { action: "stop" });
          updateWorkspaceFrame(workspace, {});
          workspace.dataset.sessionId = "";
          setWorkspaceStatus(workspace, "is-idle", "Stopped");
          refreshLock(workspace, challengeId);
          recordEvent(workspace, challengeId, "runtime.stop", {});
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Stop failed");
        }
      });
    }

    if (chatSendBtn && chatInput) {
      chatSendBtn.addEventListener("click", async function () {
        const text = String(chatInput.value || "").trim();
        if (!text) return;
        try {
          await postJSON("/plugins/team-chat/messages", { text: text });
          chatInput.value = "";
          refreshChat(workspace);
          recordEvent(workspace, challengeId, "chat.message", { length: text.length });
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Chat send failed");
        }
      });

      chatInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          chatSendBtn.click();
        }
      });
    }

    if (driveAddBtn && driveName && drivePath && driveNotes) {
      driveAddBtn.addEventListener("click", async function () {
        const name = String(driveName.value || "").trim();
        const path = String(drivePath.value || "").trim();
        const notes = String(driveNotes.value || "").trim();
        if (!name || !path) return;
        try {
          await postJSON("/plugins/team-drive/files", { name: name, path: path, notes: notes });
          driveName.value = "";
          drivePath.value = "";
          driveNotes.value = "";
          refreshDrive(workspace);
          recordEvent(workspace, challengeId, "drive.add", { name: name, path: path });
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Drive add failed");
        }
      });
    }

    if (driveList) {
      driveList.addEventListener("click", async function (event) {
        const btn = event.target.closest(".rb-drive-del");
        if (!btn) return;
        const fileId = btn.dataset.fileId;
        if (!fileId) return;
        try {
          await postJSON("/plugins/team-drive/files/" + fileId + "/delete", {});
          refreshDrive(workspace);
          recordEvent(workspace, challengeId, "drive.delete", { id: fileId });
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Drive delete failed");
        }
      });
    }

    if (lockAcquireBtn) {
      lockAcquireBtn.addEventListener("click", async function () {
        const sessionId = workspace.dataset.sessionId || "";
        if (!sessionId) {
          setWorkspaceStatus(workspace, "is-error", "Start session before acquiring lock");
          return;
        }
        try {
          await postJSON("/plugins/shared-terminal/locks", {
            challenge_id: challengeId,
            session_id: sessionId,
            action: "acquire",
            ttl_seconds: 300,
          });
          refreshLock(workspace, challengeId);
          recordEvent(workspace, challengeId, "lock.acquire", {});
        } catch (err) {
          setLockStatus(workspace, err.message || "Acquire failed", true);
        }
      });
    }

    if (lockReleaseBtn) {
      lockReleaseBtn.addEventListener("click", async function () {
        const sessionId = workspace.dataset.sessionId || "";
        if (!sessionId) return;
        try {
          await postJSON("/plugins/shared-terminal/locks", {
            challenge_id: challengeId,
            session_id: sessionId,
            action: "release",
          });
          refreshLock(workspace, challengeId);
          recordEvent(workspace, challengeId, "lock.release", {});
        } catch (err) {
          setLockStatus(workspace, err.message || "Release failed", true);
        }
      });
    }

    loadActorIdentity(workspace).then(function () {
      refreshLock(workspace, challengeId);
    });
    refreshChat(workspace);
    refreshDrive(workspace);

    if (!workspace._rbInterval) {
      workspace._rbInterval = window.setInterval(function () {
        refreshChat(workspace);
        refreshDrive(workspace);
        refreshLock(workspace, challengeId);
      }, 15000);
    }
  }

  function createWorkspace(challengeId) {
    const aside = document.createElement("aside");
    aside.className = "rb-workspace";
    aside.innerHTML =
      "<div class=\"rb-header\">" +
      "<h4 class=\"rb-title\">Workspace</h4>" +
      "<span class=\"rb-status is-idle\">Idle</span>" +
      "</div>" +
      "<div class=\"rb-actions\">" +
      "<button type=\"button\" class=\"btn btn-sm btn-primary rb-start\">Start</button>" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-warning rb-reset\">Reset</button>" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-secondary rb-stop\">Stop</button>" +
      "<a class=\"btn btn-sm btn-outline-info rb-open disabled\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"#\">Open</a>" +
      "</div>" +
      "<div class=\"rb-canvas\">" +
      "<div class=\"rb-empty\">Start a session to attach terminal or desktop workspace.</div>" +
      "<iframe class=\"rb-frame d-none\" title=\"Challenge Workspace\" allowfullscreen></iframe>" +
      "</div>" +
      "<div class=\"rb-collab\">" +
      "<div class=\"rb-card\">" +
      "<div class=\"rb-card-title\">Shared Control</div>" +
      "<div class=\"rb-lock-status rb-muted\">No active session</div>" +
      "<div class=\"rb-inline-actions\">" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-light rb-lock-acquire\">Acquire</button>" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-light rb-lock-release\" disabled>Release</button>" +
      "</div>" +
      "</div>" +
      "<div class=\"rb-card\">" +
      "<div class=\"rb-card-title\">Team Chat</div>" +
      "<div class=\"rb-chat-list\"></div>" +
      "<div class=\"rb-inline-actions\">" +
      "<input class=\"form-control form-control-sm rb-chat-input\" placeholder=\"Message team\" />" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-light rb-chat-send\">Send</button>" +
      "</div>" +
      "</div>" +
      "<div class=\"rb-card\">" +
      "<div class=\"rb-card-title\">Team Drive</div>" +
      "<div class=\"rb-drive-list\"></div>" +
      "<div class=\"rb-drive-form\">" +
      "<input class=\"form-control form-control-sm rb-drive-name\" placeholder=\"Name\" />" +
      "<input class=\"form-control form-control-sm rb-drive-path\" placeholder=\"fileshare path (e.g. challenge-2/notes.txt)\" />" +
      "<input class=\"form-control form-control-sm rb-drive-notes\" placeholder=\"Notes (optional)\" />" +
      "<button type=\"button\" class=\"btn btn-sm btn-outline-light rb-drive-add\">Add</button>" +
      "</div>" +
      "</div>" +
      "</div>";

    bindWorkspaceHandlers(aside, challengeId);
    return aside;
  }

  function enhanceChallengePane(challengePane) {
    if (!challengePane || challengePane.dataset.rbEnhanced === "1") {
      return;
    }

    const challengeIdInput = challengePane.querySelector("input.challenge-id");
    const challengeId = challengeIdInput ? parseInt(challengeIdInput.value, 10) : 0;
    if (!challengeId) {
      return;
    }

    const layout = document.createElement("div");
    layout.className = "rb-layout";

    const main = document.createElement("div");
    main.className = "rb-main";

    while (challengePane.firstChild) {
      main.appendChild(challengePane.firstChild);
    }

    layout.appendChild(main);
    layout.appendChild(createWorkspace(challengeId));
    challengePane.appendChild(layout);
    challengePane.dataset.rbEnhanced = "1";
  }

  function initChallengeObserver() {
    const challengeWindow = document.getElementById("challenge-window");
    if (!challengeWindow) {
      return;
    }

    const applyEnhancement = function () {
      const challengePane = challengeWindow.querySelector("#challenge.tab-pane");
      if (challengePane) {
        enhanceChallengePane(challengePane);
      }
    };

    applyEnhancement();
    const observer = new MutationObserver(applyEnhancement);
    observer.observe(challengeWindow, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChallengeObserver);
  } else {
    initChallengeObserver();
  }
})();
