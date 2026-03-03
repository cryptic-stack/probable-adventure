"use strict";

(function runtimeAdminInit() {
  const root = document.getElementById("runtime-admin-root");
  if (!root) return;

  const profileForm = document.getElementById("rb-profile-form");
  const challengeIdInput = document.getElementById("rb-challenge-id");
  const profileJsonInput = document.getElementById("rb-profile-json");
  const profileStatus = document.getElementById("rb-profile-status");
  const catalogSelect = document.getElementById("rb-catalog-select");
  const applyCatalogBtn = document.getElementById("rb-apply-selected-catalog");
  const sessionStatus = document.getElementById("rb-session-status");
  const sessionsBody = document.getElementById("rb-sessions-body");
  let currentChallengeId = null;

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
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      throw new Error(body.error || "Request failed");
    }
    return body.data || {};
  }

  async function getJSON(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      throw new Error(body.error || "Request failed");
    }
    return body.data || {};
  }

  function setProfileStatus(text, error) {
    profileStatus.textContent = text || "";
    profileStatus.classList.toggle("text-danger", Boolean(error));
    profileStatus.classList.toggle("text-success", !error && Boolean(text));
  }

  function setSessionStatus(text, error) {
    sessionStatus.textContent = text || "";
    sessionStatus.classList.toggle("text-danger", Boolean(error));
  }

  function applyCatalogItem(item) {
    const profile = item.default_profile && typeof item.default_profile === "object" ? item.default_profile : {};
    const payload = {
      ...profile,
      image: item.image || profile.image || "",
    };
    if (!payload.type) payload.type = "terminal";
    if (!payload.internal_port) payload.internal_port = payload.type === "terminal" ? 7681 : 6080;
    profileJsonInput.value = JSON.stringify(payload, null, 2);
    setProfileStatus("Loaded preset: " + (item.name || item.id || "catalog image"), false);
  }

  function actionButtons(challengeId, sessionId) {
    const actions = ["start", "stop", "reset", "remove"];
    return actions
      .map(function (action) {
        return (
          "<button type=\"button\" class=\"btn btn-sm btn-outline-secondary rb-session-action\" " +
          "data-action=\"" +
          action +
          "\" data-challenge-id=\"" +
          challengeId +
          "\" data-session-id=\"" +
          sessionId +
          "\">" +
          action +
          "</button>"
        );
      })
      .join(" ");
  }

  function renderSessions(challengeId, rows) {
    if (!rows || !rows.length) {
      sessionsBody.innerHTML =
        "<tr><td colspan=\"6\" class=\"text-center text-muted\">No active session containers for this challenge.</td></tr>";
      return;
    }
    const html = rows
      .map(function (row) {
        const access = row.embed_url || row.external_url || "";
        return (
          "<tr>" +
          "<td><code>" +
          (row.session_id || "") +
          "</code></td>" +
          "<td><code>" +
          (row.container_name || "") +
          "</code></td>" +
          "<td>" +
          (row.access_type || "") +
          "</td>" +
          "<td>" +
          (row.status || "") +
          "</td>" +
          "<td>" +
          (access
            ? "<a target=\"_blank\" rel=\"noopener noreferrer\" href=\"" + access + "\">open</a>"
            : "-") +
          "</td>" +
          "<td class=\"rb-action-row\">" +
          actionButtons(challengeId, row.session_id) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    sessionsBody.innerHTML = html;
  }

  async function loadSessions(challengeId) {
    currentChallengeId = challengeId;
    setSessionStatus("Loading sessions for challenge " + challengeId + "...");
    try {
      const rows = await getJSON("/plugins/runtime/challenges/" + challengeId + "/sessions");
      renderSessions(challengeId, rows);
      setSessionStatus("Loaded " + rows.length + " session(s).");
    } catch (err) {
      setSessionStatus(err.message || "Failed to load sessions", true);
      sessionsBody.innerHTML =
        "<tr><td colspan=\"6\" class=\"text-center text-danger\">Unable to load sessions.</td></tr>";
    }
  }

  root.addEventListener("click", function (event) {
    const catalogBtn = event.target.closest(".rb-apply-catalog");
    if (catalogBtn) {
      const raw = catalogBtn.dataset.catalog || "{}";
      try {
        const item = JSON.parse(raw);
        applyCatalogItem(item);
      } catch (err) {
        setProfileStatus("Invalid catalog preset", true);
      }
      return;
    }

    const editBtn = event.target.closest(".rb-edit-profile");
    if (editBtn) {
      challengeIdInput.value = editBtn.dataset.challengeId || "";
      const payload = editBtn.dataset.payload || "{}";
      try {
        profileJsonInput.value = JSON.stringify(JSON.parse(payload), null, 2);
      } catch (err) {
        profileJsonInput.value = payload;
      }
      setProfileStatus("");
      return;
    }

    const sessionsBtn = event.target.closest(".rb-load-sessions");
    if (sessionsBtn) {
      const challengeId = sessionsBtn.dataset.challengeId;
      if (challengeId) {
        loadSessions(challengeId);
      }
      return;
    }

    const actionBtn = event.target.closest(".rb-session-action");
    if (actionBtn) {
      const challengeId = actionBtn.dataset.challengeId;
      const sessionId = actionBtn.dataset.sessionId;
      const action = actionBtn.dataset.action;
      if (!challengeId || !sessionId || !action) return;

      setSessionStatus("Running " + action + " on " + sessionId + "...");
      postJSON("/plugins/runtime/admin/challenges/" + challengeId + "/sessions/" + sessionId + "/action", {
        action: action,
      })
        .then(function () {
          return loadSessions(challengeId);
        })
        .catch(function (err) {
          setSessionStatus(err.message || "Session action failed", true);
        });
    }
  });

  if (applyCatalogBtn) {
    applyCatalogBtn.addEventListener("click", function () {
      const raw = catalogSelect ? catalogSelect.value : "";
      if (!raw) {
        setProfileStatus("Select a preset first", true);
        return;
      }
      try {
        applyCatalogItem(JSON.parse(raw));
      } catch (err) {
        setProfileStatus("Invalid catalog preset", true);
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const challengeId = String(challengeIdInput.value || "").trim();
      if (!challengeId) {
        setProfileStatus("Challenge ID is required", true);
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(profileJsonInput.value);
      } catch (err) {
        setProfileStatus("Invalid JSON: " + err.message, true);
        return;
      }

      setProfileStatus("Saving...");
      postJSON("/plugins/runtime/profiles/" + challengeId, payload)
        .then(function () {
          setProfileStatus("Saved profile for challenge " + challengeId, false);
          if (currentChallengeId && String(currentChallengeId) === challengeId) {
            loadSessions(challengeId);
          }
        })
        .catch(function (err) {
          setProfileStatus(err.message || "Save failed", true);
        });
    });
  }
})();
