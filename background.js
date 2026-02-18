// LinkedIn RPS Login Tracker - BACKGROUND (service worker)
// All detection below runs automatically; you do NOT need to open the extension popup.
// Cookie changes, LinkedIn navigation, and session-conflict page are monitored 24/7.

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
    return null; // Silently fail if not configured
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

  try {
    const response = await fetch(url, { ...defaultOptions, ...fetchOptions });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const errorMsg = data?.error || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Firebase ${response.status}: ${errorMsg}`);
    }

    return data;
  } catch (error) {
    if (error.message && error.message.includes("Firebase")) {
      throw error;
    }
    if (error.name === "TypeError" || error.message.includes("Failed to fetch")) {
      throw new Error("Cannot connect to Firebase. Check URL and security rules.");
    }
    throw error;
  }
}

const LINKEDIN_DOMAIN = ".www.linkedin.com";
const AUTH_COOKIE_NAME = "li_at";
const HISTORY_LIMIT = 100;
const PRESENCE_ACCOUNT_ID = "default";

/** URL path patterns that indicate RPS/Recruiter (any open tab with these = treat as RPS). */
const RPS_URL_PATH_PATTERNS = ["/talent/"];

/**
 * Get saved RPS accounts from storage (Admin config)
 */
async function getRPSAccounts() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["savedAccounts"], ({ savedAccounts }) => {
      resolve(Array.isArray(savedAccounts) ? savedAccounts : []);
    });
  });
}

/**
 * Get the currently logged-in extension user (from popup login)
 * Stored under chrome.storage.sync as "extensionAuth".
 */
async function getCurrentExtensionUser() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["extensionAuth"], ({ extensionAuth }) => {
      if (extensionAuth && !extensionAuth.isAdmin && extensionAuth.userId) {
        // Normal extension user
        resolve({
          id: extensionAuth.userId,
          displayName: extensionAuth.displayName || extensionAuth.username || extensionAuth.userId
        });
      } else if (extensionAuth && extensionAuth.isAdmin) {
        // Admin logged in via local credentials
        resolve({
          id: "ADMIN",
          displayName: "Admin"
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Check if the detected LinkedIn account matches the configured RPS account.
 * Prefer the active account's Firebase config; fall back to locally saved accounts.
 */
async function isRPSAccount(email) {
  if (!email) return false;
  const lower = email.toLowerCase();

  // 1) Try active account config from Firebase
  try {
    const accountId = await getActiveAccountId();
    if (accountId) {
      const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`);
      if (cfg && cfg.email && typeof cfg.email === "string" && cfg.email.toLowerCase() === lower) {
        return true;
      }
    }
  } catch (_) {}

  // 2) Fall back to locally saved accounts (Admin config in this browser)
  const accounts = await getRPSAccounts();
  return accounts.some((acc) => acc.username && acc.username.toLowerCase() === lower);
}

/**
 * Get the active account ID for tracking.
 * Falls back to PRESENCE_ACCOUNT_ID ("default") so detection still works even
 * if the browser has not explicitly selected an account in the Admin UI.
 */
async function getActiveAccountId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["accountId"], ({ accountId }) => {
      resolve(accountId || PRESENCE_ACCOUNT_ID);
    });
  });
}

/**
 * Get client ID (browser/user identifier)
 */
async function getClientId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["clientId"], ({ clientId }) => {
      resolve(clientId || "unknown-client");
    });
  });
}

/**
 * Append a debug log entry to storage (for popup debugging view).
 */
async function addDebugLog(message, extra = {}) {
  const entry = {
    message,
    extra,
    timestamp: new Date().toISOString()
  };

  chrome.storage.local.get(["debugLogs"], ({ debugLogs }) => {
    const logs = Array.isArray(debugLogs) ? debugLogs : [];
    logs.unshift(entry);
    const trimmed = logs.slice(0, HISTORY_LIMIT);
    chrome.storage.local.set({ debugLogs: trimmed });
  });
}

/**
 * Determine if currently logged in by checking auth cookie.
 */
async function isCurrentlyLoggedIn() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: "https://www.linkedin.com/", name: AUTH_COOKIE_NAME },
      (cookie) => {
        resolve(!!cookie);
      }
    );
  });
}

/**
 * Check if any open LinkedIn tab has an RPS URL (e.g. /talent/ = Recruiter).
 * Uses all tabs so multiple LinkedIn tabs are considered; no manual refresh needed.
 */
async function detectRPSFromAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
    if (!tabs.length) return null;
    for (const tab of tabs) {
      if (!tab.url) continue;
      let urlPath;
      try {
        urlPath = new URL(tab.url).pathname;
      } catch (e) {
        continue;
      }
      for (const pattern of RPS_URL_PATH_PATTERNS) {
        if (urlPath.indexOf(pattern) !== -1) {
          // We don't know the exact email from URL alone; prefer active account config if present
          try {
            const accountId = await getActiveAccountId();
            if (accountId) {
              const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`);
              if (cfg && cfg.email) {
                return cfg.email;
              }
            }
          } catch (_) {}
          return null;
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Try to get the LinkedIn account email from a tab (content script).
 */
async function getLinkedInAccountEmailFromTab(tabId) {
  try {
    const results = await chrome.tabs.sendMessage(tabId, { action: "getAccountInfo" });
    return results?.email || null;
  } catch (err) {
    return null;
  }
}

/**
 * Try to get the logged-in LinkedIn account email from any tab via content script.
 * NOTE: On Recruiter (/talent/) pages this may return a candidate's email instead of the
 * logged-in account; we do NOT rely solely on this to decide RPS vs personal.
 */
async function getLinkedInAccountEmail() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
    for (const tab of tabs) {
      if (!tab.id) continue;
      const email = await getLinkedInAccountEmailFromTab(tab.id);
      if (email) return email;
    }
  } catch (err) {}
  return null;
}

/**
 * Check if any open LinkedIn tab looks like an RPS/Recruiter tab (e.g. /talent/ path).
 * This is used as a strong signal that we are using the RPS account, independent of email.
 */
async function anyRpsTabOpen() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
    if (!tabs.length) return false;
    for (const tab of tabs) {
      if (!tab.url) continue;
      let urlPath;
      try {
        urlPath = new URL(tab.url).pathname;
      } catch (e) {
        continue;
      }
      for (const pattern of RPS_URL_PATH_PATTERNS) {
        if (urlPath.indexOf(pattern) !== -1) {
          return true;
        }
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

/**
 * Send status to Firebase and persist locally (history + debug).
 * Only tracks if it's an RPS account.
 */
async function handleStatusChange(status, source) {
  const timestamp = new Date().toISOString();

  // Detect RPS:
  // 1) Any open /talent/ (or other RPS URL) tab => RPS, even if email detection is noisy.
  // 2) Otherwise, check if detected email matches configured RPS account.
  let detectedEmail = null;
  let isRPS = false;
  if (status === "logged_in") {
    const rpsFromUrl = await anyRpsTabOpen();
    detectedEmail = await getLinkedInAccountEmail();
    const emailIsRps = detectedEmail ? await isRPSAccount(detectedEmail) : false;
    isRPS = rpsFromUrl || emailIsRps;
    // Sticky RPS: once we've marked as RPS, stay RPS until logout/session conflict (even if /talent/ tab is closed)
    if (!isRPS) {
      const { lastStatus } = await new Promise((r) => chrome.storage.local.get(["lastStatus"], r));
      if (lastStatus === "logged_in") isRPS = true;
    }
  }

  const isPersonal =
    status === "logged_in" && !isRPS;
  const displayStatus = isPersonal ? "logged_in_personal" : status;

  if (status === "logged_in" && !detectedEmail) {
    await addDebugLog("Could not detect account email – not tracking (show as Personal)", {
      source
    });
  } else if (isPersonal) {
    await addDebugLog(`Personal account (not tracking): ${detectedEmail}`, {
      detectedEmail,
      isRPS
    });
  }

  // Store locally for popup display (use displayStatus so popup can show "Personal account")
  chrome.storage.local.get(
    ["statusHistory", "lastStatus", "lastStatusTimestamp", "lastStatusSource"],
    ({ statusHistory }) => {
      const entry = {
        status: displayStatus,
        source,
        timestamp,
        detectedEmail: detectedEmail || null,
        isRPS: isRPS || false
      };

      const history = Array.isArray(statusHistory) ? statusHistory : [];
      history.unshift(entry);
      const trimmed = history.slice(0, HISTORY_LIMIT);

      chrome.storage.local.set({
        statusHistory: trimmed,
        lastStatus: displayStatus,
        lastStatusTimestamp: timestamp,
        lastStatusSource: source
      });
    }
  );

  await addDebugLog(`Status change: ${displayStatus}`, {
    source,
    detectedEmail,
    isRPS
  });

  // Update "Who's using now" only for RPS. Personal = clear so you're not shown as active.
  if (status === "logged_out" || isPersonal) {
    await clearExtensionPresenceInFirebase();
  } else if (status === "logged_in") {
    await setExtensionPresenceInFirebase(source);
  }

  // Don't write to Firebase state/events for personal account
  if (isPersonal) return;

  // Get active account ID and client ID (for state/events only)
  const accountId = await getActiveAccountId();
  const clientId = await getClientId();
  const currentExtensionUser = await getCurrentExtensionUser();

  if (!accountId) {
    await addDebugLog("Status not sent: no active account ID configured");
    return;
  }

  // Write to Firebase
  const accountPath = `/accounts/${encodeURIComponent(accountId)}`;

  const statePayload = {
    status,
    lastClientId: clientId,
    updatedAt: timestamp,
    detectedEmail: detectedEmail || null,
    isRPS: isRPS || false,
    currentExtensionUserId: currentExtensionUser?.id || null,
    currentExtensionUserName: currentExtensionUser?.displayName || null
  };

  const eventPayload = {
    status,
    clientId,
    timestamp,
    source,
    detectedEmail: detectedEmail || null,
    isRPS: isRPS || false,
    currentExtensionUserId: currentExtensionUser?.id || null,
    currentExtensionUserName: currentExtensionUser?.displayName || null
  };

  try {
    // 1) Update latest state
    await firebaseRequest(`${accountPath}/state`, {
      method: "PUT",
      body: JSON.stringify(statePayload)
    });

    // 2) Append event (auto-generated key)
    const eventResult = await firebaseRequest(`${accountPath}/events`, {
      method: "POST",
      body: JSON.stringify(eventPayload)
    });

    console.log("[LinkedIn Tracker] Status written to Firebase", {
      accountId,
      eventKey: eventResult?.name
    });
    await addDebugLog("Status written to Firebase", {
      accountId,
      eventKey: eventResult?.name
    });
  } catch (err) {
    console.error("[LinkedIn Tracker] Firebase write failed:", err.message);
    await addDebugLog("Firebase write failed", {
      error: err.message,
      accountId
    });
  }
}

const SESSIONS_SWEEP_LIMIT = 300;

/**
 * Close every open session (no logoutAt) that does NOT belong to the given user.
 * Guarantees we never have 2 concurrent users regardless of flow/race.
 */
async function closeAllOtherOpenSessions(path, exceptUserId, exceptDisplayName, now) {
  try {
    let sessionsObj = null;
    try {
      sessionsObj = await firebaseRequest(`${path}/sessions`, {
        query: { orderBy: '"$key"', limitToLast: SESSIONS_SWEEP_LIMIT }
      });
    } catch (_) {
      sessionsObj = await firebaseRequest(`${path}/sessions`).catch(() => ({}));
    }
    if (!sessionsObj || typeof sessionsObj !== "object") return;
    for (const [sessionId, session] of Object.entries(sessionsObj)) {
      if (!session || typeof session !== "object") continue;
      if (session.logoutAt) continue;
      const isOther = session.userId !== exceptUserId || session.displayName !== exceptDisplayName;
      if (!isOther) continue;
      await firebaseRequest(`${path}/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ logoutAt: now })
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("[LinkedIn Tracker] closeAllOtherOpenSessions failed:", e);
  }
}

/**
 * Set "Who's using now" in Firebase – single thread, one active user at a time.
 * Sweeps all other open sessions so there are never 2 concurrent users.
 */
async function setExtensionPresenceInFirebase(source) {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) return;

  const extensionUser = await getCurrentExtensionUser();
  if (!extensionUser) return;

  const clientId = await getClientId();
  const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}`;
  const now = new Date().toISOString();

  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
  });
  const existingSessionId = stored.currentSessionId;

  try {
    const currentInFirebase = await firebaseRequest(`${path}/currentUser`);
    if (currentInFirebase && currentInFirebase.userId === extensionUser.id && currentInFirebase.clientId && currentInFirebase.clientId !== clientId) {
      return;
    }
    const isDifferentUser =
      currentInFirebase &&
      (currentInFirebase.userId !== extensionUser.id || currentInFirebase.displayName !== extensionUser.displayName);

    if (isDifferentUser) {
      const sessionIdToClose =
        currentInFirebase.sessionId ||
        (currentInFirebase.clientId === clientId ? existingSessionId : null);
      if (sessionIdToClose) {
        const session = await firebaseRequest(`${path}/sessions/${sessionIdToClose}`);
        if (session && !session.logoutAt) {
          await firebaseRequest(`${path}/sessions/${sessionIdToClose}`, {
            method: "PATCH",
            body: JSON.stringify({ logoutAt: now })
          });
        }
      }
      if (currentInFirebase.clientId === clientId) {
        await new Promise((resolve) => {
          chrome.storage.local.remove(["currentSessionId", "currentSessionAccountId"], resolve);
        });
      }
    }

    await closeAllOtherOpenSessions(path, extensionUser.id, extensionUser.displayName, now);

    const storedAfterClose = await new Promise((resolve) => {
      chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
    });
    const haveSession = storedAfterClose.currentSessionId;

    let loggedInAt = now;
    if (haveSession && currentInFirebase && currentInFirebase.clientId === clientId && currentInFirebase.userId === extensionUser.id && currentInFirebase.loggedInAt) {
      loggedInAt = currentInFirebase.loggedInAt;
    }

    const currentUser = {
      userId: extensionUser.id,
      displayName: extensionUser.displayName,
      clientId,
      loggedInAt
    };
    if (haveSession) currentUser.sessionId = storedAfterClose.currentSessionId;

    await firebaseRequest(`${path}/currentUser`, {
      method: "PUT",
      body: JSON.stringify(currentUser)
    });

    if (!haveSession) {
      const sessionPayload = {
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        clientId,
        loginAt: now,
        isRps: true
      };
      const sessionResult = await firebaseRequest(`${path}/sessions`, {
        method: "POST",
        body: JSON.stringify(sessionPayload)
      });

      if (sessionResult && sessionResult.name) {
        await new Promise((resolve) => {
          chrome.storage.local.set(
            { currentSessionId: sessionResult.name, currentSessionAccountId: PRESENCE_ACCOUNT_ID },
            resolve
          );
        });
        await firebaseRequest(`${path}/currentUser`, {
          method: "PATCH",
          body: JSON.stringify({ sessionId: sessionResult.name })
        });
        try {
          await firebaseRequest(`${path}/events`, {
            method: "POST",
            body: JSON.stringify({
              type: "rps_login",
              displayName: extensionUser.displayName,
              userId: extensionUser.id,
              at: now,
              source: source || "extension"
            })
          });
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn("[LinkedIn Tracker] setExtensionPresenceInFirebase failed:", err);
  }
}

/**
 * Clear the single active-user slot in Firebase only when the current user there is US (same clientId).
 * We do NOT clear just because we have a stale currentSessionId from another device – that would
 * make Chrome (personal) wipe "Asad on Edge" when Chrome has an old session id. So: only clear
 * currentUser when currentInFirebase.clientId === our clientId. If we have a sessionId we still
 * close that session (logoutAt) so our record is correct, and we clear our storage; but we only
 * set currentUser to null when we are the one currently shown.
 */
async function clearExtensionPresenceInFirebase() {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) return;

  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
  });
  const sessionId = stored.currentSessionId;
  const sessionAccountId = stored.currentSessionAccountId || PRESENCE_ACCOUNT_ID;
  const path = `/accounts/${encodeURIComponent(sessionAccountId)}`;

  try {
    const clientId = await getClientId();
    const currentInFirebase = await firebaseRequest(`${path}/currentUser`);

    const weAreCurrentUser = currentInFirebase && currentInFirebase.clientId === clientId;

    if (sessionId) {
      const session = await firebaseRequest(`${path}/sessions/${sessionId}`);
      if (session) {
        const updated = { ...session, logoutAt: new Date().toISOString() };
        await firebaseRequest(`${path}/sessions/${sessionId}`, {
          method: "PUT",
          body: JSON.stringify(updated)
        });
      }
      await new Promise((resolve) => {
        chrome.storage.local.remove(["currentSessionId", "currentSessionAccountId"], resolve);
      });
    }

    if (weAreCurrentUser) {
      await firebaseRequest(`${path}/currentUser`, {
        method: "PUT",
        body: JSON.stringify(null)
      });
      await addDebugLog("Extension presence cleared (Who's using now)", { source: "logged_out" });
    }
  } catch (e) {
    console.warn("[LinkedIn Tracker] clearExtensionPresenceInFirebase failed:", e);
  }
}

/**
 * Handle cookie changes and infer login/logout.
 */
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed } = changeInfo;

  if (!cookie || cookie.domain !== LINKEDIN_DOMAIN) return;
  if (cookie.name !== AUTH_COOKIE_NAME) return;

  // Small delay to let LinkedIn page load and account info be available
  setTimeout(async () => {
    if (removed) {
      await handleStatusChange("logged_out", "cookie_removed");
    } else {
      await handleStatusChange("logged_in", "cookie_set_or_updated");
    }
  }, 2000);
});

/**
 * Check if URL is LinkedIn's "multiple sign-ins" / session conflict page (user was pushed out).
 */
function isSessionConflictUrl(url) {
  if (!url || !url.includes("linkedin.com")) return false;
  try {
    const u = new URL(url);
    if (u.pathname.indexOf("enterprise-authentication/sessions") !== -1) return true;
    if (u.pathname.indexOf("checkpoint") !== -1) return true;
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * As a fallback, check login state on navigation to LinkedIn.
 * If user landed on session-conflict page, treat as logged out immediately.
 */
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (!details.url.includes("linkedin.com")) return;

    if (isSessionConflictUrl(details.url)) {
      await handleStatusChange("logged_out", "session_conflict_page");
      return;
    }

    setTimeout(async () => {
      const loggedIn = await isCurrentlyLoggedIn();
      await handleStatusChange(
        loggedIn ? "logged_in" : "logged_out",
        "navigation_completed"
      );
    }, 3000);
  },
  { url: [{ hostContains: "linkedin.com" }] }
);

/**
 * When a tab finishes loading, re-check RPS vs personal (e.g. user opened or switched to Recruiter tab).
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab || !tab.url || tab.url.indexOf("linkedin.com") === -1) return;
  const loggedIn = await isCurrentlyLoggedIn();
  if (!loggedIn) return;
  const rpsEmail = await detectRPSFromAllTabs();
  if (!rpsEmail) return;
  const { lastStatus } = await new Promise((r) => chrome.storage.local.get(["lastStatus"], r));
  if (lastStatus === "logged_in_personal") {
    await handleStatusChange("logged_in", "tab_rps_url");
  }
});

const EXTENSION_ONLINE_HEARTBEAT_MINUTES = 0.5;

/**
 * Write or update this browser's "extension online" presence (Teams-style availability).
 */
async function writeExtensionOnlinePresence() {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) return;
  const extUser = await getCurrentExtensionUser();
  if (!extUser) return;
  const clientId = await getClientId();
  const path = `/extensionOnline/${encodeURIComponent(extUser.id)}`;
  const now = new Date().toISOString();
  let firstSeenAt = now;
  try {
    const existing = await firebaseRequest(path);
    if (existing && existing.firstSeenAt) firstSeenAt = existing.firstSeenAt;
  } catch (_) {}
  const payload = {
    displayName: extUser.displayName,
    clientId,
    firstSeenAt,
    lastSeenAt: now
  };
  try {
    await firebaseRequest(path, { method: "PUT", body: JSON.stringify(payload) });
  } catch (e) {
    console.warn("[LinkedIn Tracker] extensionOnline heartbeat failed:", e);
  }
}

/**
 * Remove this user from extensionOnline (call when they log out of the extension).
 */
async function removeExtensionOnlinePresence(userId) {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl || !userId) return;
  const path = `/extensionOnline/${encodeURIComponent(userId)}`;
  try {
    await firebaseRequest(path, { method: "PUT", body: JSON.stringify(null) });
  } catch (e) {
    console.warn("[LinkedIn Tracker] removeExtensionOnline failed:", e);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "removeExtensionOnline") {
    removeExtensionOnlinePresence(message.userId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.action === "writeExtensionOnlineNow") {
    writeExtensionOnlinePresence().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.action === "sessionConflictDetected") {
    handleStatusChange("logged_out", "session_conflict_page").then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.action === "ensurePresence") {
    (async () => {
      try {
        const loggedIn = await isCurrentlyLoggedIn();
        const { lastStatus } = await new Promise((r) => chrome.storage.local.get(["lastStatus"], r));
        const extUser = await getCurrentExtensionUser();
        if (loggedIn && lastStatus === "logged_in" && extUser) {
          await setExtensionPresenceInFirebase("ensure_presence");
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});

chrome.alarms.create("extensionOnlineHeartbeat", { periodInMinutes: EXTENSION_ONLINE_HEARTBEAT_MINUTES });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "extensionOnlineHeartbeat") {
    const extUser = await getCurrentExtensionUser();
    if (extUser) await writeExtensionOnlinePresence();
  }
});
getCurrentExtensionUser().then((ext) => { if (ext) writeExtensionOnlinePresence(); });

chrome.runtime.onInstalled.addListener(async () => {
  setTimeout(async () => {
    const loggedIn = await isCurrentlyLoggedIn();
    await handleStatusChange(
      loggedIn ? "logged_in" : "logged_out",
      "extension_installed"
    );
  }, 2000);
});

chrome.runtime.onStartup.addListener(async () => {
  setTimeout(async () => {
    const loggedIn = await isCurrentlyLoggedIn();
    await handleStatusChange(
      loggedIn ? "logged_in" : "logged_out",
      "browser_startup"
    );
  }, 2000);
});
