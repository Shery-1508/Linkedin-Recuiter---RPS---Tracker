// GOD mode – standalone admin for all teams/accounts
// Open god.html directly in a browser. Uses the same Firebase DB URL as popup/background.

const FIREBASE_CONFIG = {
  // IMPORTANT: keep this in sync with popup.js/background.js/admin.js
  // Get your URL from Firebase Console > Realtime Database > Data > Copy URL
  databaseURL: "YOUR-FIREBASE-DATABASE-URL-HERE" // e.g. "https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app/"
};

function getFirebaseBaseUrl() {
  if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes("YOUR-PROJECT-ID")) {
    return null;
  }
  let url = FIREBASE_CONFIG.databaseURL.trim().replace(/\/+$/, "");
  if (url.endsWith(".json")) url = url.replace(/\.json$/, "");
  return url;
}

async function firebaseRequest(path, options = {}) {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) {
    throw new Error("Firebase URL not configured in god.js");
  }
  let url = `${baseUrl}${path.startsWith("/") ? path : "/" + path}.json`;
  if (options.query && (!options.method || options.method === "GET")) {
    const qs = new URLSearchParams(options.query).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  const { query, ...fetchOptions } = options;
  const defaultOptions = {
    headers: { "Content-Type": "application/json" }
  };
  const resp = await fetch(url, { ...defaultOptions, ...fetchOptions });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const msg = data && data.error ? data.error : resp.statusText || `HTTP ${resp.status}`;
    throw new Error(`Firebase ${resp.status}: ${msg}`);
  }
  return data;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("godStatusBar");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#800000" : "#000000";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Firebase test ---

async function godTestFirebase() {
  try {
    const baseUrl = getFirebaseBaseUrl();
    document.getElementById("godFirebaseUrl").value = baseUrl || "(not configured)";
    const resEl = document.getElementById("godTestResult");
    if (!baseUrl) {
      resEl.textContent = "No Firebase URL configured.";
      resEl.style.color = "#800000";
      setStatus("Firebase URL not configured in god.js", true);
      return;
    }
    await firebaseRequest("/.info/connected").catch(() => null);
    resEl.textContent = "Connected OK.";
    resEl.style.color = "#008000";
    setStatus("Firebase connection OK.");
  } catch (e) {
    const resEl = document.getElementById("godTestResult");
    if (resEl) {
      resEl.textContent = e.message;
      resEl.style.color = "#800000";
    }
    setStatus(`Firebase test failed: ${e.message}`, true);
  }
}

// --- Accounts / Teams ---

async function reloadAccountsList() {
  const listEl = document.getElementById("godAccountsList");
  if (!listEl) return;
  listEl.innerHTML = "Loading accounts…";
  try {
    const accountsObj = await firebaseRequest("/accounts");
    if (!accountsObj || typeof accountsObj !== "object") {
      listEl.innerHTML = "<div class=\"small\">No /accounts found.</div>";
      return;
    }
    const entries = Object.entries(accountsObj);
    if (!entries.length) {
      listEl.innerHTML = "<div class=\"small\">No /accounts found.</div>";
      return;
    }
    let html = "";
    const teamSelect = document.getElementById("godUserTeam");
    if (teamSelect) {
      // Rebuild team dropdown
      teamSelect.innerHTML = '<option value="">(none)</option>';
    }

    entries.forEach(([id, node]) => {
      const cfg = node && node.config ? node.config : {};
      const teamName = cfg.teamName || "";
      const email = cfg.email || "";
      html += `<div class="list-item">
        <div><strong>${escapeHtml(id)}</strong>${teamName ? " – " + escapeHtml(teamName) : ""}</div>
        <div class="small mono">${escapeHtml(email || "(no email set)")}</div>
        <div class="small">
          <button class="btn" data-god-edit-account="${escapeHtml(id)}">Edit</button>
        </div>
      </div>`;

      if (teamSelect) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = teamName ? `${teamName} (${id})` : id;
        teamSelect.appendChild(opt);
      }
    });
    listEl.innerHTML = html;
    // Wire edit buttons
    Array.from(listEl.querySelectorAll("[data-god-edit-account]")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const accountId = btn.getAttribute("data-god-edit-account");
        fillAccountFormFromFirebase(accountId);
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="small">Error: ${escapeHtml(e.message)}</div>`;
    setStatus(`Failed to load accounts: ${e.message}`, true);
  }
}

async function fillAccountFormFromFirebase(accountId) {
  try {
    const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`).catch(() => ({}));
    document.getElementById("godAccountId").value = accountId;
    document.getElementById("godTeamName").value = cfg.teamName || "";
    document.getElementById("godRpsEmail").value = cfg.email || "";
    document.getElementById("godRpsDisplayName").value = cfg.displayName || "";
    document.getElementById("godRpsProfilePath").value = cfg.profilePath || "";
    setStatus(`Loaded account ${accountId} config.`);
  } catch (e) {
    setStatus(`Failed to load account config: ${e.message}`, true);
  }
}

async function saveAccountConfig() {
  const accountId = document.getElementById("godAccountId").value.trim();
  const teamName = document.getElementById("godTeamName").value.trim();
  const email = document.getElementById("godRpsEmail").value.trim();
  const displayName = document.getElementById("godRpsDisplayName").value.trim();
  const profilePath = document.getElementById("godRpsProfilePath").value.trim();
  if (!accountId) {
    setStatus("Account ID is required.", true);
    return;
  }
  const payload = {
    teamName: teamName || null,
    email: email || null,
    displayName: displayName || null,
    profilePath: profilePath || null
  };
  try {
    await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    setStatus(`Account ${accountId} config saved.`);
    reloadAccountsList();
  } catch (e) {
    setStatus(`Failed to save account: ${e.message}`, true);
  }
}

async function deleteAccountSubtree() {
  const accountId = document.getElementById("godAccountId").value.trim();
  if (!accountId) {
    setStatus("Enter Account ID to delete.", true);
    return;
  }
  if (!window.confirm(`Delete ALL data under /accounts/${accountId}? This cannot be undone.`)) {
    return;
  }
  try {
    await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}`, {
      method: "PUT",
      body: JSON.stringify(null)
    });
    setStatus(`Account ${accountId} subtree deleted.`);
    reloadAccountsList();
  } catch (e) {
    setStatus(`Failed to delete account: ${e.message}`, true);
  }
}

// --- Users / Admins ---

async function reloadUsersList() {
  const listEl = document.getElementById("godUsersList");
  if (!listEl) return;
  listEl.innerHTML = "Loading users…";
  try {
    const [usersObj, adminsObj] = await Promise.all([
      firebaseRequest("/users").catch(() => ({})),
      firebaseRequest("/admins").catch(() => ({}))
    ]);
    if (!usersObj || typeof usersObj !== "object") {
      listEl.innerHTML = "<div class=\"small\">No /users found.</div>";
      return;
    }
    const admins = adminsObj && typeof adminsObj === "object" ? adminsObj : {};
    const entries = Object.entries(usersObj);
    let html = "";
    entries.forEach(([id, u]) => {
      const isAdmin = !!admins[id];
      const username = u && u.username ? u.username : id;
      const displayName = u && u.displayName ? u.displayName : username;
      const teamId = u && u.teamId ? u.teamId : "";
      html += `<div class="list-item">
        <div><strong>${escapeHtml(displayName)}</strong> (${escapeHtml(username)}) ${isAdmin ? "[ADMIN]" : ""}</div>
        ${teamId ? `<div class="small">teamId=${escapeHtml(teamId)}</div>` : ""}
        <div class="small mono">id=${escapeHtml(id)} | pwd=${escapeHtml(u.password || "")}</div>
        <div class="small">
          <button class="btn" data-god-edit-user="${escapeHtml(id)}">Edit</button>
        </div>
      </div>`;
    });
    listEl.innerHTML = html;
    Array.from(listEl.querySelectorAll("[data-god-edit-user]")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = btn.getAttribute("data-god-edit-user");
        fillUserFormFromFirebase(uid);
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="small">Error loading users: ${escapeHtml(e.message)}</div>`;
    setStatus(`Failed to load users: ${e.message}`, true);
  }
}

async function fillUserFormFromFirebase(userId) {
  try {
    const [user, adminsObj] = await Promise.all([
      firebaseRequest(`/users/${encodeURIComponent(userId)}`).catch(() => null),
      firebaseRequest("/admins").catch(() => ({}))
    ]);
    if (!user) {
      setStatus(`User ${userId} not found.`, true);
      return;
    }
    const isAdmin = !!(adminsObj && adminsObj[userId]);
    document.getElementById("godUserId").value = userId;
    document.getElementById("godUsername").value = user.username || "";
    document.getElementById("godUserDisplayName").value = user.displayName || "";
    document.getElementById("godUserPassword").value = user.password || "";
    document.getElementById("godUserIsAdmin").checked = isAdmin;
    const teamSelect = document.getElementById("godUserTeam");
    if (teamSelect) {
      teamSelect.value = user.teamId || "";
    }
    setStatus(`Loaded user ${userId}.`);
  } catch (e) {
    setStatus(`Failed to load user: ${e.message}`, true);
  }
}

async function saveUser() {
  const userId = document.getElementById("godUserId").value.trim();
  const username = document.getElementById("godUsername").value.trim();
  const displayName = document.getElementById("godUserDisplayName").value.trim();
  const password = document.getElementById("godUserPassword").value;
  const isAdmin = document.getElementById("godUserIsAdmin").checked;
  const teamId = document.getElementById("godUserTeam").value;

  if (!username) {
    setStatus("Username is required.", true);
    return;
  }
  if (!password) {
    setStatus("Password is required.", true);
    return;
  }

  const payload = {
    username,
    displayName: displayName || username,
    password,
    teamId: teamId || null
  };

  try {
    let id = userId;
    if (id) {
      // Update existing user – also trigger forceLogoutAt
      payload.forceLogoutAt = new Date().toISOString();
      await firebaseRequest(`/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      // Create new user (push)
      const result = await firebaseRequest("/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      id = result && result.name ? result.name : null;
    }

    if (id) {
      // Update admin flag
      if (isAdmin) {
        await firebaseRequest(`/admins/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(true)
        });
      } else {
        await firebaseRequest(`/admins/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(null)
        });
      }
    }

    setStatus(`User saved (${id || "unknown id"}).`);
    reloadUsersList();
  } catch (e) {
    setStatus(`Failed to save user: ${e.message}`, true);
  }
}

async function deleteUser() {
  const userId = document.getElementById("godUserId").value.trim();
  if (!userId) {
    setStatus("Enter a User ID to delete (from list).", true);
    return;
  }
  if (!window.confirm(`Delete user ${userId} from /users and /admins?`)) return;
  try {
    await firebaseRequest(`/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    await firebaseRequest(`/admins/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(() => {});
    setStatus(`User ${userId} deleted.`);
    reloadUsersList();
  } catch (e) {
    setStatus(`Failed to delete user: ${e.message}`, true);
  }
}

// --- Inspect sessions / events ---

async function loadInspectSessions() {
  const accountId = document.getElementById("godInspectAccountId").value.trim();
  const out = document.getElementById("godInspectOutput");
  if (!accountId) {
    setStatus("Enter Account ID to inspect sessions.", true);
    return;
  }
  try {
    const sessions = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/sessions`, {
      query: { orderBy: '"$key"', limitToLast: 200 }
    }).catch(() => ({}));
    out.value = JSON.stringify(sessions || {}, null, 2);
    setStatus(`Loaded sessions for account ${accountId}.`);
  } catch (e) {
    out.value = `Error: ${e.message}`;
    setStatus(`Failed to load sessions: ${e.message}`, true);
  }
}

async function loadInspectEvents() {
  const accountId = document.getElementById("godInspectAccountId").value.trim();
  const out = document.getElementById("godInspectOutput");
  if (!accountId) {
    setStatus("Enter Account ID to inspect events.", true);
    return;
  }
  try {
    const events = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/events`, {
      query: { orderBy: '"$key"', limitToLast: 200 }
    }).catch(() => ({}));
    out.value = JSON.stringify(events || {}, null, 2);
    setStatus(`Loaded events for account ${accountId}.`);
  } catch (e) {
    out.value = `Error: ${e.message}`;
    setStatus(`Failed to load events: ${e.message}`, true);
  }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  const baseUrl = getFirebaseBaseUrl();
  const urlEl = document.getElementById("godFirebaseUrl");
  if (urlEl) urlEl.value = baseUrl || "(not configured)";

  document.getElementById("godTestFirebaseBtn").addEventListener("click", godTestFirebase);
  document.getElementById("godReloadAccountsBtn").addEventListener("click", reloadAccountsList);
  document.getElementById("godSaveAccountBtn").addEventListener("click", saveAccountConfig);
  document.getElementById("godDeleteAccountBtn").addEventListener("click", deleteAccountSubtree);

  document.getElementById("godReloadUsersBtn").addEventListener("click", reloadUsersList);
  document.getElementById("godSaveUserBtn").addEventListener("click", saveUser);
  document.getElementById("godDeleteUserBtn").addEventListener("click", deleteUser);

  document.getElementById("godLoadSessionsBtn").addEventListener("click", loadInspectSessions);
  document.getElementById("godLoadEventsBtn").addEventListener("click", loadInspectEvents);

  // Initial loads
  godTestFirebase().catch(() => {});
  reloadAccountsList().catch(() => {});
  reloadUsersList().catch(() => {});
});

