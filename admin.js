const STORAGE_KEYS = {
  accounts: "savedAccounts",
  accountId: "accountId",
  clientId: "clientId"
};

// Firebase config - UPDATE THIS WITH YOUR FIREBASE DATABASE URL
// Get your URL from Firebase Console > Realtime Database > Data > Copy URL
const FIREBASE_CONFIG = {
  databaseURL: "YOUR-FIREBASE-DATABASE-URL-HERE" // e.g. "https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app/"
};

/**
 * Get Firebase base URL
 */
function getFirebaseBaseUrl() {
  if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes("YOUR-PROJECT-ID")) {
    return null;
  }
  // Remove trailing slashes and ensure clean URL
  let url = FIREBASE_CONFIG.databaseURL.trim().replace(/\/+$/, "");
  // Ensure it doesn't end with .json
  if (url.endsWith(".json")) {
    url = url.replace(/\.json$/, "");
  }
  return url;
}

/**
 * Firebase REST API helper
 */
async function firebaseRequest(path, options = {}) {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) {
    throw new Error("Firebase URL not configured. Update FIREBASE_CONFIG.databaseURL in admin.js");
  }

  let url = `${baseUrl}${path.startsWith("/") ? path : "/" + path}.json`;
  if (options.query && (options.method === "GET" || !options.method)) {
    const qs = new URLSearchParams(options.query).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  const { query, ...fetchOptions } = options;
  const defaultOptions = {
    headers: { "Content-Type": "application/json" }
  };

  console.log("[Firebase] Request:", url, fetchOptions.method || "GET");

  try {
    const response = await fetch(url, { ...defaultOptions, ...fetchOptions });
    const text = await response.text();
    let data = null;
    
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      // If not JSON, might be empty or error message
      console.warn("[Firebase] Response not JSON:", text);
    }

    console.log("[Firebase] Response:", response.status, data);

    if (!response.ok) {
      const errorMsg = data?.error || text || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Firebase ${response.status}: ${errorMsg}`);
    }

    return data;
  } catch (error) {
    console.error("[Firebase] Error:", error, "URL:", url);
    
    if (error.message && error.message.includes("Firebase")) {
      throw error;
    }
    
    if (error.name === "TypeError" || error.message.includes("Failed to fetch")) {
      throw new Error(
        `Network error connecting to Firebase.\n` +
        `URL: ${url}\n` +
        `Check: 1) Firebase URL is correct, 2) Database exists, 3) Security rules allow access, 4) Internet connection`
      );
    }
    
    throw error;
  }
}

function showStatus(message, type = "success") {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.className = `status-message ${type}`;
  setTimeout(() => {
    el.className = "status-message";
  }, 5000);
}

function generateId() {
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadAllSettings() {
  chrome.storage.sync.get(
    [STORAGE_KEYS.accounts, STORAGE_KEYS.accountId, STORAGE_KEYS.clientId],
    (data) => {
      const accounts = Array.isArray(data[STORAGE_KEYS.accounts])
        ? data[STORAGE_KEYS.accounts]
        : [];
      const accountId = data[STORAGE_KEYS.accountId] || "";
      const clientId = data[STORAGE_KEYS.clientId] || "";

      document.getElementById("clientIdInput").value = clientId;
      renderAccounts(accounts, accountId);
    }
  );
}

function saveGlobalSettings() {
  const clientId = document.getElementById("clientIdInput").value.trim();

  if (!clientId) {
    showStatus("Browser/User ID is required", "error");
    return;
  }

  chrome.storage.sync.set(
    {
      [STORAGE_KEYS.clientId]: clientId
    },
    () => {
      showStatus("Settings saved successfully!");
    }
  );
}

function renderAccounts(accounts, activeAccountId) {
  const container = document.getElementById("accountsList");
  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div>No RPS accounts configured yet</div>
        <div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.8;">
          Add an account above to start tracking
        </div>
      </div>
    `;
    return;
  }

  accounts.forEach((acc) => {
    const item = document.createElement("div");
    item.className = "account-item";

    const header = document.createElement("div");
    header.className = "account-header";

    const titleDiv = document.createElement("div");
    const title = document.createElement("div");
    title.className = "account-title";
    title.textContent = acc.displayName || acc.accountId || "(unnamed)";

    if (acc.accountId && acc.accountId === activeAccountId) {
      const badge = document.createElement("span");
      badge.className = "badge badge-active";
      badge.textContent = "Active";
      titleDiv.appendChild(badge);
      titleDiv.appendChild(document.createTextNode(" "));
    }

    titleDiv.appendChild(title);
    header.appendChild(titleDiv);

    const actions = document.createElement("div");
    actions.className = "account-actions";

    const useBtn = document.createElement("button");
    useBtn.className = "btn btn-primary";
    useBtn.style.fontSize = "0.85rem";
    useBtn.style.padding = "6px 12px";
    useBtn.textContent = "✓ Use for Tracking";
    useBtn.addEventListener("click", () => {
      if (!acc.accountId) return;
      chrome.storage.sync.set({ [STORAGE_KEYS.accountId]: acc.accountId }, () => {
        showStatus(`Now tracking "${acc.accountId}"`);
        chrome.storage.sync.get([STORAGE_KEYS.accounts], (data) => {
          const updatedAccounts = Array.isArray(data[STORAGE_KEYS.accounts])
            ? data[STORAGE_KEYS.accounts]
            : [];
          renderAccounts(updatedAccounts, acc.accountId);
        });
      });
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.style.fontSize = "0.85rem";
    editBtn.style.padding = "6px 12px";
    editBtn.textContent = "✏️ Edit";
    editBtn.addEventListener("click", () => {
      document.getElementById("accDisplayName").value = acc.displayName || "";
      document.getElementById("accId").value = acc.accountId || "";
      document.getElementById("accUsername").value = acc.username || "";
      document.getElementById("accPassword").value = acc.password || "";
      document.getElementById("accNotes").value = acc.notes || "";
      document.getElementById("addAccountBtn").dataset.editId = acc.id;
      showStatus(`Editing account "${acc.displayName || acc.accountId}"`);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.style.fontSize = "0.85rem";
    deleteBtn.style.padding = "6px 12px";
    deleteBtn.textContent = "🗑️ Delete";
    deleteBtn.addEventListener("click", () => {
      const confirmed = confirm(
        `Delete account "${acc.displayName || acc.accountId}"?\n\nThis will remove it from tracking.`
      );
      if (!confirmed) return;

      chrome.storage.sync.get(
        [STORAGE_KEYS.accounts, STORAGE_KEYS.accountId],
        ({ [STORAGE_KEYS.accounts]: storedAccounts, [STORAGE_KEYS.accountId]: storedActiveId }) => {
          const list = Array.isArray(storedAccounts) ? storedAccounts : [];
          const filtered = list.filter((a) => a.id !== acc.id);
          const updates = { [STORAGE_KEYS.accounts]: filtered };

          if (storedActiveId && storedActiveId === acc.accountId) {
            updates[STORAGE_KEYS.accountId] = "";
          }

          chrome.storage.sync.set(updates, () => {
            showStatus("Account deleted");
            renderAccounts(filtered, updates[STORAGE_KEYS.accountId] || storedActiveId || "");
          });
        }
      );
    });

    actions.appendChild(useBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(actions);

    const details = document.createElement("div");
    details.className = "account-details";

    const idItem = document.createElement("div");
    idItem.className = "detail-item";
    idItem.innerHTML = `
      <div class="detail-label">Account ID</div>
      <div class="detail-value">${acc.accountId || "-"}</div>
    `;

    const emailItem = document.createElement("div");
    emailItem.className = "detail-item";
    emailItem.innerHTML = `
      <div class="detail-label">Email/Username</div>
      <div class="detail-value">${acc.username || "-"}</div>
    `;

    details.appendChild(idItem);
    details.appendChild(emailItem);

    if (acc.notes) {
      const notesItem = document.createElement("div");
      notesItem.style.gridColumn = "1 / -1";
      notesItem.style.marginTop = "8px";
      notesItem.style.paddingTop = "8px";
      notesItem.style.borderTop = "1px solid var(--border)";
      notesItem.style.fontSize = "0.85rem";
      notesItem.style.color = "var(--text-muted)";
      notesItem.textContent = acc.notes;
      details.appendChild(notesItem);
    }

    item.appendChild(header);
    item.appendChild(details);
    container.appendChild(item);
  });
}

function handleAddOrUpdateAccount() {
  const displayName = document.getElementById("accDisplayName").value.trim();
  const accountId = document.getElementById("accId").value.trim();
  const username = document.getElementById("accUsername").value.trim();
  const password = document.getElementById("accPassword").value;
  const notes = document.getElementById("accNotes").value.trim();

  if (!accountId) {
    showStatus("Shared Account ID is required", "error");
    return;
  }

  if (!username) {
    showStatus("LinkedIn email/username is required for account detection", "error");
    return;
  }

  chrome.storage.sync.get(
    [STORAGE_KEYS.accounts, STORAGE_KEYS.accountId],
    ({ [STORAGE_KEYS.accounts]: storedAccounts, [STORAGE_KEYS.accountId]: activeId }) => {
      const list = Array.isArray(storedAccounts) ? storedAccounts : [];
      const editId = document.getElementById("addAccountBtn").dataset.editId;

      let updatedList;
      if (editId) {
        updatedList = list.map((acc) =>
          acc.id === editId
            ? {
                ...acc,
                displayName,
                accountId,
                username,
                password,
                notes
              }
            : acc
        );
        showStatus("Account updated successfully!");
      } else {
        const newAccount = {
          id: generateId(),
          displayName,
          accountId,
          username,
          password,
          notes
        };
        updatedList = [...list, newAccount];
        showStatus("Account added successfully!");
      }

      chrome.storage.sync.set(
        {
          [STORAGE_KEYS.accounts]: updatedList
        },
        () => {
          renderAccounts(updatedList, activeId || accountId);
          delete document.getElementById("addAccountBtn").dataset.editId;
        }
      );
    }
  );
}

function resetForm() {
  document.getElementById("accDisplayName").value = "";
  document.getElementById("accId").value = "";
  document.getElementById("accUsername").value = "";
  document.getElementById("accPassword").value = "";
  document.getElementById("accNotes").value = "";
  delete document.getElementById("addAccountBtn").dataset.editId;
}

// ---------- Firebase-backed extension login users ----------

async function fetchExtensionUsers() {
  try {
    const users = await firebaseRequest("/users");
    return users || {};
  } catch (e) {
    console.error("[Admin] Error fetching users:", e);
    showStatus(`Failed to load users: ${e.message}`, "error");
    return {};
  }
}

async function fetchAdmins() {
  try {
    const admins = await firebaseRequest("/admins");
    return admins && typeof admins === "object" ? admins : {};
  } catch (e) {
    return {};
  }
}

async function setUserAdmin(userId, isAdmin) {
  try {
    if (isAdmin) {
      await firebaseRequest(`/admins/${userId}`, {
        method: "PUT",
        body: JSON.stringify(true)
      });
      showStatus("User set as admin");
    } else {
      await firebaseRequest(`/admins/${userId}`, { method: "DELETE" });
      showStatus("Admin removed");
    }
  } catch (e) {
    showStatus(`Failed: ${e.message}`, "error");
  }
}

async function renderExtensionUsers(usersObj) {
  const container = document.getElementById("usersList");
  container.innerHTML = "";
  const admins = await fetchAdmins();

  const entries = Object.entries(usersObj || {});
  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div>No extension login users yet</div>
        <div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.8;">
          Create a user above so they can log in from the popup.
        </div>
      </div>
    `;
    return;
  }

  entries.forEach(([id, user]) => {
    const item = document.createElement("div");
    item.className = "account-item";

    const header = document.createElement("div");
    header.className = "account-header";

    const title = document.createElement("div");
    title.className = "account-title";
    const isAdmin = admins[id] === true;
    title.textContent = (user.displayName || user.username || id) + (isAdmin ? " (Admin)" : "");

    const actions = document.createElement("div");
    actions.className = "account-actions";

    const adminBtn = document.createElement("button");
    adminBtn.className = "btn btn-secondary";
    adminBtn.textContent = isAdmin ? "Remove admin" : "Make admin";
    adminBtn.addEventListener("click", async () => {
      await setUserAdmin(id, !isAdmin);
      const updated = await fetchExtensionUsers();
      renderExtensionUsers(updated);
    });

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      document.getElementById("userUsername").value = user.username || "";
      document.getElementById("userDisplayName").value = user.displayName || "";
      document.getElementById("userPassword").value = user.password || "";
      document.getElementById("saveUserBtn").dataset.editUserId = id;
      showStatus(`Editing extension user "${user.username || id}"`);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      const confirmed = confirm(
        `Delete extension user "${user.username || id}"?\nThey will no longer be able to log in.`
      );
      if (!confirmed) return;
      try {
        await firebaseRequest(`/users/${id}`, { method: "DELETE" });
        await firebaseRequest(`/admins/${id}`, { method: "DELETE" }).catch(() => {});
        showStatus("Extension user deleted");
        const updated = await fetchExtensionUsers();
        renderExtensionUsers(updated);
      } catch (e) {
        console.error(e);
        showStatus(`Failed to delete user: ${e.message}`, "error");
      }
    });

    actions.appendChild(adminBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(title);
    header.appendChild(actions);

    const details = document.createElement("div");
    details.className = "account-details";

    const uItem = document.createElement("div");
    uItem.className = "detail-item";
    uItem.innerHTML = `
      <div class="detail-label">Username</div>
      <div class="detail-value">${user.username || "-"}</div>
    `;

    details.appendChild(uItem);

    item.appendChild(header);
    item.appendChild(details);
    container.appendChild(item);
  });
}

async function saveExtensionUser() {
  const username = document.getElementById("userUsername").value.trim();
  const displayName = document.getElementById("userDisplayName").value.trim();
  const password = document.getElementById("userPassword").value;

  if (!username) {
    showStatus("Username is required", "error");
    return;
  }
  if (!password) {
    showStatus("Password is required", "error");
    return;
  }

  const editId = document.getElementById("saveUserBtn").dataset.editUserId;
  const accountId = await getAdminAccountId();
  const payload = {
    username,
    displayName: displayName || username,
    password,
    // Tag user with the currently active account/team so GOD mode and Team availability can group correctly.
    teamId: accountId || null
  };
  if (editId) {
    payload.forceLogoutAt = new Date().toISOString();
  }

  try {
    if (editId) {
      await firebaseRequest(`/users/${editId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showStatus("User updated. They will be logged out from the extension on next open.");
    } else {
      await firebaseRequest("/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showStatus("User created successfully!");
    }

    // Clear form
    delete document.getElementById("saveUserBtn").dataset.editUserId;
    document.getElementById("userUsername").value = "";
    document.getElementById("userDisplayName").value = "";
    document.getElementById("userPassword").value = "";

    // Refresh list
    const users = await fetchExtensionUsers();
    renderExtensionUsers(users);
  } catch (e) {
    console.error("[Admin] Error saving user:", e);
    showStatus(`Failed to save user: ${e.message}`, "error");
  }
}

function resetUserForm() {
  document.getElementById("userUsername").value = "";
  document.getElementById("userDisplayName").value = "";
  document.getElementById("userPassword").value = "";
  delete document.getElementById("saveUserBtn").dataset.editUserId;
}

async function testFirebaseConnection() {
  const resultEl = document.getElementById("firebaseTestResult");
  const baseUrl = getFirebaseBaseUrl();
  
  if (!baseUrl) {
    resultEl.innerHTML = '<span style="color: var(--danger);">❌ Firebase URL not configured</span>';
    return;
  }
  
  resultEl.innerHTML = `<span style="color: var(--warning);">Testing connection to:<br/><code style="font-size: 0.75rem; word-break: break-all;">${baseUrl}</code></span>`;

  try {
    await firebaseRequest("/accounts/default/currentUser");
    resultEl.innerHTML = `<span style="color: var(--success);">✅ Connection successful!<br/><small>Database is accessible.</small></span>`;
  } catch (e) {
    console.error("[Admin] Connection test failed:", e);
    const errorMsg = e.message || String(e);
    resultEl.innerHTML = `<span style="color: var(--danger);">❌ ${errorMsg}</span>`;
  }
}

/** Use "default" for extension presence so no Account ID is required */
const PRESENCE_ACCOUNT_ID = "default";

function getAdminAccountId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["accountId"], ({ accountId }) => resolve(accountId || PRESENCE_ACCOUNT_ID));
  });
}

async function loadAdminTeamName() {
  const el = document.getElementById("adminTeamName");
  if (!el) return;
  try {
    const accountId = await getAdminAccountId();
    if (!accountId) {
      el.textContent = "";
      return;
    }
    const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`);
    if (cfg && typeof cfg.teamName === "string" && cfg.teamName.trim()) {
      el.textContent = `Team: ${cfg.teamName} (Account: ${accountId})`;
    } else {
      el.textContent = `Account: ${accountId}`;
    }
  } catch (e) {
    el.textContent = "";
  }
}

/** Clear extensionOnline entries for users that belong to the active account/team (by teamId on /users). */
async function resetTeamPresence() {
  try {
    const accountId = await getAdminAccountId();
    if (!accountId) {
      showStatus("No active account set (set one in LinkedIn RPS Account Configuration).", "error");
      return;
    }
    const confirmed = confirm(
      `Reset presence for all users in team/account "${accountId}"?\n\n` +
      "This will clear their entries from Team availability until they are seen again."
    );
    if (!confirmed) return;

    const usersObj = await firebaseRequest("/users").catch(() => ({}));
    if (!usersObj || typeof usersObj !== "object") {
      showStatus("No users found to reset.", "error");
      return;
    }
    const idsToClear = Object.entries(usersObj)
      .filter(([id, u]) => u && u.teamId === accountId)
      .map(([id]) => id);
    if (!idsToClear.length) {
      showStatus(`No users with teamId=${accountId} found.`, "error");
      return;
    }
    await Promise.all(
      idsToClear.map((id) =>
        firebaseRequest(`/extensionOnline/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(null)
        }).catch(() => {})
      )
    );
    showStatus(`Cleared presence for ${idsToClear.length} user(s) in team ${accountId}.`);
  } catch (e) {
    console.error("[Admin] resetTeamPresence failed:", e);
    showStatus(`Failed to reset presence: ${e.message}`, "error");
  }
}

/** Work day: 5pm previous day → 5pm on selected date (matches popup). */
const WORK_DAY_START_HOUR = 17;

function getDayBoundsForDate(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const end = new Date(y, m, day, WORK_DAY_START_HOUR, 0, 0, 0).getTime();
  const start = end - 24 * 60 * 60 * 1000;
  return { start, end };
}

function getWorkDayLabelAdmin(dayStart, dayEnd) {
  const startD = new Date(dayStart);
  const endD = new Date(dayEnd);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(startD)}, 5pm – ${fmt(endD)}, 5pm`;
}

const ADMIN_USER_COLORS = [
  "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899",
  "#06b6d4", "#84cc16", "#ef4444", "#6366f1", "#14b8a6"
];

function escapeHtmlAdmin(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ADMIN_ZOOM_LEVELS = [
  { pxPerHour: 24, tickMinutes: 180 },
  { pxPerHour: 48, tickMinutes: 60 },
  { pxPerHour: 72, tickMinutes: 30 },
  { pxPerHour: 120, tickMinutes: 15 },
  { pxPerHour: 168, tickMinutes: 10 },
  { pxPerHour: 240, tickMinutes: 5 }
];
const ADMIN_TIMELINE_BLOCK_GAP_PCT = 0.08;
const ADMIN_TIMELINE_BLOCK_MIN_WIDTH_PCT = 0.06;
let adminTimelineZoomIndex = 1;
let lastAdminSessionsObj = null;
let lastAdminCalendarDate = null;

function getAdminTimelineZoom() {
  return ADMIN_ZOOM_LEVELS[Math.min(adminTimelineZoomIndex, ADMIN_ZOOM_LEVELS.length - 1)];
}

function formatAdminTimeLabel(h, min) {
  if (h === 0 && min === 0) return "12am";
  if (h === 12 && min === 0) return "12pm";
  if (h < 12) return `${h}:${String(min).padStart(2, "0")}am`;
  return `${h - 12 || 12}:${String(min).padStart(2, "0")}pm`;
}

function adminShouldShowAxisLabel(tickMinutes, m) {
  if (tickMinutes >= 60) return true;
  return m % 60 === 0;
}

function normalizeSessionsAdmin(sessionsObj) {
  if (!sessionsObj) return [];
  if (Array.isArray(sessionsObj)) {
    return sessionsObj.map((s, i) => ({ id: String(i), ...(s && typeof s === "object" ? s : {}) }));
  }
  return Object.entries(sessionsObj).map(([id, s]) => ({ id, ...(s && typeof s === "object" ? s : {}) }));
}

function buildAdminDailyCalendar(sessionsObj, dateStr) {
  const container = document.getElementById("adminDailyCalendar");
  if (!container) return;
  if (sessionsObj !== undefined && sessionsObj !== null) lastAdminSessionsObj = sessionsObj;
  if (dateStr !== undefined && dateStr !== null) lastAdminCalendarDate = dateStr;
  const dateInput = document.getElementById("adminCalendarDate");
  if (lastAdminCalendarDate == null && dateInput && dateInput.value) lastAdminCalendarDate = dateInput.value;
  if (lastAdminCalendarDate == null) lastAdminCalendarDate = new Date().toISOString().slice(0, 10);

  const sessions = normalizeSessionsAdmin(lastAdminSessionsObj);
  const effectiveDate = lastAdminCalendarDate;
  const { start: dayStart, end: dayEnd } = getDayBoundsForDate(effectiveDate);
  const dayLength = dayEnd - dayStart;

  const inDay = (t) => {
    const ms = typeof t === "string" ? new Date(t).getTime() : t;
    return ms >= dayStart && ms < dayEnd;
  };

  const segmentsByUser = {};
  sessions.forEach((s) => {
    if (s.isRps === false) return;
    const loginAt = s.loginAt ? new Date(s.loginAt).getTime() : null;
    const logoutAt = s.logoutAt ? new Date(s.logoutAt).getTime() : null;
    if (!loginAt || Number.isNaN(loginAt)) return;
    const userKey = s.displayName || s.userId || "Unknown";
    if (!segmentsByUser[userKey]) segmentsByUser[userKey] = [];
    const start = Math.max(loginAt, dayStart);
    const end = logoutAt ? Math.min(logoutAt, dayEnd) : Math.min(Date.now(), dayEnd);
    if (inDay(loginAt) || inDay(logoutAt) || (loginAt < dayStart && (!logoutAt || logoutAt > dayStart))) {
      segmentsByUser[userKey].push({ start, end });
    }
  });

  Object.keys(segmentsByUser).forEach((user) => {
    const segs = segmentsByUser[user].sort((a, b) => a.start - b.start);
    const merged = [];
    segs.forEach((s) => {
      if (merged.length && s.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, s.end);
      } else {
        merged.push({ ...s });
      }
    });
    segmentsByUser[user] = merged;
  });

  const users = Object.keys(segmentsByUser);
  const dayLabel = getWorkDayLabelAdmin(dayStart, dayEnd);

  const zoomCfg = getAdminTimelineZoom();
  const TIMELINE_HOURS = 24;
  const trackWidthPx = TIMELINE_HOURS * zoomCfg.pxPerHour;

  if (users.length === 0) {
    const zoomLabel = zoomCfg.tickMinutes === 60 ? "1h" : zoomCfg.tickMinutes + "m";
    container.innerHTML = `
      <div class="admin-timeline-day-label">${escapeHtmlAdmin(dayLabel)} (scroll →)</div>
      <div class="admin-timeline-zoom-controls"><button type="button" id="adminTimelineZoomOut" class="admin-timeline-zoom-btn">−</button><span class="admin-timeline-zoom-label">${zoomLabel}</span><button type="button" id="adminTimelineZoomIn" class="admin-timeline-zoom-btn">+</button></div>
      <div class="admin-timeline-rows-scroll">
        <div class="admin-timeline-scroll-inner" style="width: ${trackWidthPx}px;">
          <div class="admin-timeline-empty">No RPS sessions on this day.</div>
        </div>
      </div>`;
    attachAdminTimelineZoomHandlers();
    return;
  }

  const totalMinutes = 24 * 60;
  const ticks = [];
  for (let m = 0; m <= totalMinutes; m += zoomCfg.tickMinutes) {
    const clockHour = (WORK_DAY_START_HOUR + Math.floor(m / 60)) % 24;
    const min = m % 60;
    if (!adminShouldShowAxisLabel(zoomCfg.tickMinutes, m)) continue;
    const label = `${clockHour >= 6 && clockHour < 18 ? "☀" : "☽"} ${formatAdminTimeLabel(clockHour, min)}`;
    ticks.push({ label, leftPct: (m / totalMinutes) * 100, icon: clockHour >= 6 && clockHour < 18 ? "sun" : "moon" });
  }
  let axisHtml = `<div class="admin-timeline-axis admin-timeline-axis-detail" style="width: ${trackWidthPx}px;">`;
  ticks.forEach(({ label, leftPct, icon }) => {
    axisHtml += `<span class="admin-timeline-axis-tick ${icon}" style="left: ${leftPct}%;">${label}</span>`;
  });
  axisHtml += "</div>";

  let rowsHtml = "";
  users.forEach((user, idx) => {
    const color = ADMIN_USER_COLORS[idx % ADMIN_USER_COLORS.length];
    const blocks = segmentsByUser[user];
    const totalMs = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
    const totalMins = Math.round(totalMs / 60000);
    const totalStr = totalMins < 60 ? `${totalMins}m` : `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
    const titleAttr = `${escapeHtmlAdmin(user)} — ${totalStr} on RPS`;
    let blocksHtml = "";
    blocks.forEach((b) => {
      const leftPct = ((b.start - dayStart) / dayLength) * 100;
      let widthPct = ((b.end - b.start) / dayLength) * 100;
      widthPct = Math.max(ADMIN_TIMELINE_BLOCK_MIN_WIDTH_PCT, widthPct - ADMIN_TIMELINE_BLOCK_GAP_PCT);
      const timeStr = `${new Date(b.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(b.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      blocksHtml += `<div class="admin-timeline-block" style="left: ${leftPct}%; width: ${widthPct}%; background: ${color};" title="${escapeHtmlAdmin(timeStr)}">${widthPct >= 2 ? escapeHtmlAdmin(user) : ""}</div>`;
    });
    rowsHtml += `
      <div class="admin-timeline-row">
        <div class="admin-timeline-name" title="${titleAttr}">${escapeHtmlAdmin(user)}</div>
        <div class="admin-timeline-track-wrap" style="width: ${trackWidthPx}px;">
          <div class="admin-timeline-track" style="width: ${trackWidthPx}px;">${blocksHtml}</div>
        </div>
      </div>`;
  });

  const zoomLabel = zoomCfg.tickMinutes === 60 ? "1h" : zoomCfg.tickMinutes + "m";
  container.innerHTML = `
    <div class="admin-timeline-day-label">${escapeHtmlAdmin(dayLabel)} (scroll →)</div>
    <div class="admin-timeline-zoom-controls"><button type="button" id="adminTimelineZoomOut" class="admin-timeline-zoom-btn">−</button><span class="admin-timeline-zoom-label">${zoomLabel}</span><button type="button" id="adminTimelineZoomIn" class="admin-timeline-zoom-btn">+</button></div>
    <div class="admin-timeline-rows-scroll" id="adminTimelineScrollArea">
      <div class="admin-timeline-scroll-inner" style="width: ${trackWidthPx}px;">
        ${axisHtml}
        ${rowsHtml}
      </div>
    </div>
  `;
  attachAdminTimelineZoomHandlers();
}

function adminTimelineZoomIn() {
  adminTimelineZoomIndex = Math.min(ADMIN_ZOOM_LEVELS.length - 1, adminTimelineZoomIndex + 1);
  buildAdminDailyCalendar();
}

function adminTimelineZoomOut() {
  adminTimelineZoomIndex = Math.max(0, adminTimelineZoomIndex - 1);
  buildAdminDailyCalendar();
}

function attachAdminTimelineZoomHandlers() {
  const out = document.getElementById("adminTimelineZoomOut");
  const inBtn = document.getElementById("adminTimelineZoomIn");
  if (out) out.onclick = adminTimelineZoomOut;
  if (inBtn) inBtn.onclick = adminTimelineZoomIn;
  const scrollArea = document.getElementById("adminTimelineScrollArea");
  if (scrollArea) {
    scrollArea.onwheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (e.deltaY < 0) adminTimelineZoomIn();
      else adminTimelineZoomOut();
    };
    scrollArea.style.touchAction = "pan-x";
  }
}

async function loadAdminUsage() {
  const accountId = await getAdminAccountId();
  const whosEl = document.getElementById("adminWhosUsing");
  const dateInput = document.getElementById("adminCalendarDate");
  const dateStr = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().slice(0, 10);

  if (!getFirebaseBaseUrl()) {
    if (whosEl) whosEl.innerHTML = '<div class="admin-whos-using empty"><div class="label">Firebase not configured</div></div>';
    buildAdminDailyCalendar(null, dateStr);
    return;
  }

  const presenceId = accountId || PRESENCE_ACCOUNT_ID;
  const path = `/accounts/${encodeURIComponent(presenceId)}`;

  try {
    const currentUser = await firebaseRequest(`${path}/currentUser`);
    let sessionsObj = null;
    try {
      sessionsObj = await firebaseRequest(`${path}/sessions`, {
        query: { orderBy: '"$key"', limitToLast: 500 }
      });
    } catch (_) {
      sessionsObj = await firebaseRequest(`${path}/sessions`).catch(() => ({}));
    }
    if (!sessionsObj || typeof sessionsObj !== "object") sessionsObj = {};

    if (whosEl) {
      if (currentUser && currentUser.displayName) {
        const since = currentUser.loggedInAt ? new Date(currentUser.loggedInAt).toLocaleString() : "";
        whosEl.innerHTML = `
          <div class="admin-whos-using">
            <div class="label">Currently logged into extension</div>
            <div class="name">${String(currentUser.displayName).replace(/</g, "&lt;")}</div>
            <div class="meta">Since ${since}${currentUser.clientId ? " · " + currentUser.clientId : ""}</div>
          </div>`;
      } else {
        whosEl.innerHTML = '<div class="admin-whos-using empty"><div class="label">Currently logged in</div><div class="name">No one</div></div>';
      }
    }

    buildAdminDailyCalendar(sessionsObj, dateStr);
  } catch (e) {
    console.error("[Admin] Load usage failed:", e);
    if (whosEl) whosEl.innerHTML = `<div class="admin-whos-using empty"><div class="label">Error</div><div class="meta">${e.message}</div></div>`;
    buildAdminDailyCalendar(null, dateStr);
  }
}

const SESSIONS_FETCH_LIMIT_ADMIN = 1000;

async function loadSessionsForAdmin() {
  const tbody = document.getElementById("sessionsTableBody");
  const emptyEl = document.getElementById("sessionsTableEmpty");
  const tableWrap = document.getElementById("sessionsTableWrap");
  const dateFilter = document.getElementById("sessionsDateFilter");
  const dateStr = dateFilter && dateFilter.value ? dateFilter.value : null;

  if (!getFirebaseBaseUrl()) {
    if (tbody) tbody.innerHTML = "";
    if (emptyEl) { emptyEl.style.display = "block"; emptyEl.textContent = "Firebase not configured."; }
    if (tableWrap) tableWrap.querySelector("table") && (tableWrap.querySelector("table").style.display = "none");
    return;
  }

  if (emptyEl) { emptyEl.style.display = "block"; emptyEl.textContent = "Loading sessions…"; }
  if (tbody) tbody.innerHTML = "";

  try {
    const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}/sessions`;
    let sessionsObj = null;
    try {
      sessionsObj = await firebaseRequest(path);
    } catch (err) {
      console.warn("[Admin] Sessions GET failed:", err);
      sessionsObj = await firebaseRequest(path, {
        query: { orderBy: '"$key"', limitToLast: SESSIONS_FETCH_LIMIT_ADMIN }
      }).catch(() => null);
    }
    if (sessionsObj === null || sessionsObj === undefined) sessionsObj = {};
    if (typeof sessionsObj !== "object" || Array.isArray(sessionsObj)) {
      sessionsObj = Array.isArray(sessionsObj) ? Object.fromEntries(sessionsObj.map((s, i) => [`_${i}`, s])) : {};
    }
    const entries = Object.entries(sessionsObj).map(([id, s]) => ({ id, ...(s && typeof s === "object" ? s : {}) }));
    const dayStart = dateStr ? new Date(dateStr + "T00:00:00").getTime() : null;
    const dayEnd = dateStr ? dayStart + 24 * 60 * 60 * 1000 : null;
    const filtered = dateStr
      ? entries.filter((s) => {
          const t = s.loginAt ? new Date(s.loginAt).getTime() : 0;
          return t >= dayStart && t < dayEnd;
        })
      : entries;
    const sorted = filtered.sort((a, b) => {
      const ta = a.loginAt ? new Date(a.loginAt).getTime() : 0;
      const tb = b.loginAt ? new Date(b.loginAt).getTime() : 0;
      return tb - ta;
    });

    if (!tbody) return;
    const tableEl = tableWrap && tableWrap.querySelector("#sessionsTable");
    if (tableEl) tableEl.style.display = "table";
    tbody.innerHTML = "";
    if (emptyEl) {
      emptyEl.style.display = "none";
    }

    if (sorted.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">${dateStr ? `No sessions on ${dateStr}.` : "No sessions in Firebase. Log in on RPS with the extension to create sessions."}</td>`;
      tbody.appendChild(tr);
    }

    sorted.forEach((s) => {
      const tr = document.createElement("tr");
      const loginAt = s.loginAt ? new Date(s.loginAt).toLocaleString() : "–";
      const logoutAt = s.logoutAt ? new Date(s.logoutAt).toLocaleString() : "–";
      const user = s.displayName || s.userId || "Unknown";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-delete-session";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Delete this session (${user}, ${loginAt})?`)) return;
        try {
          await firebaseRequest(`/accounts/${PRESENCE_ACCOUNT_ID}/sessions/${s.id}`, { method: "DELETE" });
          showStatus("Session deleted");
          loadSessionsForAdmin();
          loadAdminUsage();
        } catch (e) {
          showStatus(`Failed: ${e.message}`, "error");
        }
      });
      tr.innerHTML = `<td>${escapeHtmlAdmin(user)}</td><td>${escapeHtmlAdmin(loginAt)}</td><td>${escapeHtmlAdmin(logoutAt)}</td><td></td>`;
      tr.querySelector("td:last-child").appendChild(deleteBtn);
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("[Admin] Load sessions failed:", e);
    showStatus(`Failed to load sessions: ${e.message}`, "error");
    if (emptyEl) { emptyEl.style.display = "block"; emptyEl.textContent = `Failed: ${e.message}`; }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--danger);">Failed to load: ${escapeHtmlAdmin(e.message)}</td></tr>`;
    }
    const tableEl = tableWrap && tableWrap.querySelector("#sessionsTable");
    if (tableEl) tableEl.style.display = "table";
  }
}

async function deleteSessionsForSelectedDate() {
  const dateFilter = document.getElementById("sessionsDateFilter");
  const dateStr = dateFilter && dateFilter.value ? dateFilter.value : null;
  if (!dateStr) {
    showStatus("Select a date first", "error");
    return;
  }
  if (!confirm(`Delete ALL sessions on ${dateStr}? This cannot be undone.`)) return;
  try {
    const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}/sessions`;
    const sessionsObj = await firebaseRequest(path, {
      query: { orderBy: '"$key"', limitToLast: SESSIONS_FETCH_LIMIT_ADMIN }
    }).catch(() => ({}));
    const entries = Object.entries(sessionsObj || {});
    const dayStart = new Date(dateStr + "T00:00:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const [id, s] of entries) {
      const t = s && s.loginAt ? new Date(s.loginAt).getTime() : 0;
      if (t >= dayStart && t < dayEnd) {
        await firebaseRequest(`/accounts/${PRESENCE_ACCOUNT_ID}/sessions/${id}`, { method: "DELETE" });
        deleted++;
      }
    }
    showStatus(`Deleted ${deleted} session(s) for ${dateStr}`);
    loadSessionsForAdmin();
    loadAdminUsage();
  } catch (e) {
    showStatus(`Failed: ${e.message}`, "error");
  }
}

async function deleteAllSessions() {
  if (!confirm("Delete ALL sessions? This cannot be undone.")) return;
  try {
    const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}/sessions`;
    const sessionsObj = await firebaseRequest(path, {
      query: { orderBy: '"$key"', limitToLast: SESSIONS_FETCH_LIMIT_ADMIN }
    }).catch(() => ({}));
    const ids = Object.keys(sessionsObj || {});
    for (const id of ids) {
      await firebaseRequest(`/accounts/${PRESENCE_ACCOUNT_ID}/sessions/${id}`, { method: "DELETE" });
    }
    showStatus(`Deleted ${ids.length} session(s).`);
    loadSessionsForAdmin();
    loadAdminUsage();
  } catch (e) {
    showStatus(`Failed: ${e.message}`, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("saveSettingsBtn").addEventListener("click", saveGlobalSettings);
  document.getElementById("addAccountBtn").addEventListener("click", handleAddOrUpdateAccount);
  document.getElementById("resetFormBtn").addEventListener("click", resetForm);

  document.getElementById("saveUserBtn").addEventListener("click", saveExtensionUser);
  document.getElementById("resetUserFormBtn").addEventListener("click", resetUserForm);
  document.getElementById("testFirebaseBtn").addEventListener("click", testFirebaseConnection);

  const sessionsDateFilter = document.getElementById("sessionsDateFilter");
  if (sessionsDateFilter) sessionsDateFilter.value = new Date().toISOString().slice(0, 10);
  document.getElementById("loadSessionsBtn").addEventListener("click", () => loadSessionsForAdmin());
  document.getElementById("deleteSessionsForDateBtn").addEventListener("click", () => deleteSessionsForSelectedDate());
  document.getElementById("deleteAllSessionsBtn").addEventListener("click", () => deleteAllSessions());

  const dateInput = document.getElementById("adminCalendarDate");
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", () => loadAdminUsage());
  }
  const refreshUsageBtn = document.getElementById("refreshUsageBtn");
  if (refreshUsageBtn) refreshUsageBtn.addEventListener("click", () => loadAdminUsage());

  // Display current Firebase URL
  const urlDisplay = document.getElementById("firebaseUrlDisplay");
  const firebaseUrl = getFirebaseBaseUrl();
  if (firebaseUrl) {
    urlDisplay.textContent = firebaseUrl;
    urlDisplay.style.color = "var(--text)";
  } else {
    urlDisplay.textContent = "Not configured (update FIREBASE_CONFIG.databaseURL)";
    urlDisplay.style.color = "var(--danger)";
  }

  loadAdminTeamName().catch(() => {});

  const resetTeamPresenceBtn = document.getElementById("resetTeamPresenceBtn");
  if (resetTeamPresenceBtn) {
    resetTeamPresenceBtn.addEventListener("click", () => resetTeamPresence());
  }

  loadAllSettings();

  // Load extension login users from Firebase
  fetchExtensionUsers().then(renderExtensionUsers);

  // Load who's using and daily calendar, then refresh every 10s
  loadAdminUsage();
  setInterval(loadAdminUsage, 10000);

  loadSessionsForAdmin();
});
