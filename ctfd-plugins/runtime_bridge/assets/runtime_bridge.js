"use strict";

(function runtimeBridgeInit() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  // Prefer dark mode by default when user has not explicitly chosen.
  if (!localStorage.getItem("theme")) {
    localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-bs-theme", "dark");
  }

  function csrfHeader() {
    const nonce = window.init && window.init.csrfNonce ? window.init.csrfNonce : "";
    return nonce ? { "CSRF-Token": nonce } : {};
  }

  async function postJSON(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeader(),
      },
      body: JSON.stringify(payload || {}),
    });
    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      // Non-JSON errors are surfaced as generic HTTP failures below.
    }
    if (!response.ok || !body || body.success !== true) {
      const message = (body && body.error) || "Runtime request failed";
      throw new Error(message);
    }
    return body.data || {};
  }

  async function getJSON(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
    });
    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      // Non-JSON errors are surfaced as generic HTTP failures below.
    }
    if (!response.ok || !body || body.success !== true) {
      const message = (body && body.error) || "Runtime request failed";
      throw new Error(message);
    }
    return body.data || {};
  }

  let catalogPromise = null;
  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = getJSON("/plugins/runtime/catalog")
        .then(function (data) {
          const rows = data && Array.isArray(data.images) ? data.images : [];
          return rows.filter(function (item) {
            return item && item.id && item.default_profile && typeof item.default_profile === "object";
          });
        })
        .catch(function () {
          return [];
        });
    }
    return catalogPromise;
  }

  function setWorkspaceStatus(workspace, state, text) {
    const badge = workspace.querySelector(".rb-status");
    if (!badge) return;
    badge.classList.remove("is-idle", "is-active", "is-error", "is-busy");
    badge.classList.add(state || "is-idle");
    badge.textContent = text || "Idle";
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

  function bindWorkspaceHandlers(workspace, challengeId) {
    const startBtn = workspace.querySelector(".rb-start");
    const resetBtn = workspace.querySelector(".rb-reset");
    const stopBtn = workspace.querySelector(".rb-stop");
    const runtimeSelect = workspace.querySelector(".rb-runtime-select");

    function profilePayload(action) {
      const payload = {};
      if (action) payload.action = action;
      if (runtimeSelect && runtimeSelect.value) {
        payload.profile_id = runtimeSelect.value;
      }
      return payload;
    }

    if (startBtn) {
      startBtn.addEventListener("click", async function handleStart() {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Starting");
          const data = await postJSON(
            "/plugins/runtime/challenges/" + challengeId + "/connect",
            profilePayload("")
          );
          updateWorkspaceFrame(workspace, data);
          setWorkspaceStatus(workspace, "is-active", "Connected");
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Start failed");
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async function handleReset() {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Resetting");
          const data = await postJSON(
            "/plugins/runtime/challenges/" + challengeId + "/session",
            profilePayload("reset")
          );
          updateWorkspaceFrame(workspace, data);
          setWorkspaceStatus(workspace, "is-active", "Connected");
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Reset failed");
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", async function handleStop() {
        try {
          setWorkspaceStatus(workspace, "is-busy", "Stopping");
          await postJSON(
            "/plugins/runtime/challenges/" + challengeId + "/session",
            profilePayload("stop")
          );
          updateWorkspaceFrame(workspace, {});
          setWorkspaceStatus(workspace, "is-idle", "Stopped");
        } catch (err) {
          setWorkspaceStatus(workspace, "is-error", err.message || "Stop failed");
        }
      });
    }
  }

  function fillRuntimeOptions(workspace, items) {
    const select = workspace.querySelector(".rb-runtime-select");
    if (!select) return;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Challenge default runtime";
    select.appendChild(defaultOption);

    items.forEach(function (item) {
      const option = document.createElement("option");
      const profile = item.default_profile || {};
      const type = String(profile.type || "").toLowerCase() || "runtime";
      option.value = String(item.id);
      option.textContent = item.name + " (" + type + ")";
      select.appendChild(option);
    });
  }

  function createWorkspace(challengeId) {
    const aside = document.createElement("aside");
    aside.className = "rb-workspace";
    aside.innerHTML =
      "<div class=\"rb-header\">" +
      "<h4 class=\"rb-title\">Workspace</h4>" +
      "<span class=\"rb-status is-idle\">Idle</span>" +
      "</div>" +
      "<div class=\"rb-runtime-picker\">" +
      "<label for=\"rb-runtime-select-" +
      challengeId +
      "\">Runtime</label>" +
      "<select id=\"rb-runtime-select-" +
      challengeId +
      "\" class=\"form-control form-control-sm rb-runtime-select\">" +
      "<option value=\"\">Challenge default runtime</option>" +
      "</select>" +
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
      "</div>";
    bindWorkspaceHandlers(aside, challengeId);
    loadCatalog().then(function (items) {
      fillRuntimeOptions(aside, items || []);
    });
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
