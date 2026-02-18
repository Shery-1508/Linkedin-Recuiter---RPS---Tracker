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
    throw new Error("Firebase URL not configured");
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
      throw new Error("Cannot connect to Firebase");
    }
    throw error;
  }
}

function formatTimestamp(iso) {
  if (!iso) return "–";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function setCurrentStatus(status, timestamp, source) {
  const indicator = document.getElementById("statusIndicator");
  const badge = document.getElementById("statusBadge");
  const lastTimeEl = document.getElementById("lastChangeTime");
  const lastSourceEl = document.getElementById("lastChangeSource");

  indicator.className = "status-indicator";
  badge.className = "status-badge";

  if (status === "logged_in") {
    indicator.classList.add("active");
    badge.textContent = "Logged In (RPS)";
    badge.classList.add("logged-in");
  } else if (status === "logged_in_personal") {
    indicator.classList.add("inactive");
    badge.textContent = "Personal account";
    badge.classList.add("logged-out");
  } else if (status === "logged_out") {
    indicator.classList.add("inactive");
    badge.textContent = "Logged Out";
    badge.classList.add("logged-out");
  } else {
    indicator.classList.add("unknown");
    badge.textContent = "Unknown";
  }

  lastTimeEl.textContent = formatTimestamp(timestamp);
  lastSourceEl.textContent = source || "–";
}

function renderHistory(history) {
  const list = document.getElementById("historyList");
  list.innerHTML = "";

  if (!Array.isArray(history) || history.length === 0) {
    list.innerHTML = '<div class="empty-state">No activity recorded yet</div>';
    return;
  }

  history.slice(0, 15).forEach((entry) => {
    const item = document.createElement("div");
    item.className = `list-item ${entry.status || ""}`;

    const header = document.createElement("div");
    header.className = "list-item-header";

    const status = document.createElement("div");
    status.style.fontWeight = "600";
    status.textContent =
      entry.status === "logged_in"
        ? "✓ Logged In (RPS)"
        : entry.status === "logged_out"
        ? "✗ Logged Out"
        : entry.status === "logged_in_personal"
        ? "Personal account (not tracking)"
        : entry.status || "Unknown";

    const time = document.createElement("div");
    time.className = "list-item-time";
    time.textContent = formatTimestamp(entry.timestamp);

    header.appendChild(status);
    header.appendChild(time);

    const source = document.createElement("div");
    source.style.fontSize = "0.75rem";
    source.style.color = "var(--text-muted)";
    source.style.marginTop = "4px";
    source.textContent = entry.source || "–";

    item.appendChild(header);
    item.appendChild(source);
    list.appendChild(item);
  });
}

function renderLogs(logs) {
  const list = document.getElementById("logList");
  list.innerHTML = "";

  if (!Array.isArray(logs) || logs.length === 0) {
    list.innerHTML = '<div class="empty-state">No debug messages</div>';
    return;
  }

  logs.slice(0, 20).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.style.fontSize = "0.8rem";

    const msg = document.createElement("div");
    msg.textContent = entry.message || "";

    const ts = document.createElement("div");
    ts.className = "list-item-time";
    ts.style.marginTop = "4px";
    ts.textContent = formatTimestamp(entry.timestamp);

    item.appendChild(msg);
    item.appendChild(ts);
    list.appendChild(item);
  });
}

function renderExtensionUserInfo(extensionAuth) {
  const indicator = document.getElementById("userIndicator");
  const badge = document.getElementById("userBadge");
  const details = document.getElementById("userDetailsValue");

  indicator.className = "status-indicator";
  badge.className = "status-badge";

  if (!extensionAuth) {
    indicator.classList.add("unknown");
    badge.textContent = "Not logged in";
    details.textContent = "Open this popup and log in to the extension.";
    return;
  }

  let label;
  if (extensionAuth.isAdmin) {
    label = "Admin";
  } else {
    label =
      extensionAuth.displayName ||
      extensionAuth.username ||
      extensionAuth.userId ||
      "Extension User";
  }

  indicator.classList.add("active");
  badge.classList.add("logged-in");
  badge.textContent = label;
  details.textContent = extensionAuth.isAdmin
    ? "Admin session (local). Events will be marked as Admin."
    : `Logged in as "${label}". Events will be stored in Firebase with this user.`;
}

/** Work day: 5pm previous day → 5pm current day (24h). Aligns with typical work schedule. */
const WORK_DAY_START_HOUR = 17;

/** Returns the 5pm→5pm work-day window that contains the given date/time. */
function getDayBounds(date) {
  const d = new Date(date);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const today5pm = new Date(y, m, day, WORK_DAY_START_HOUR, 0, 0, 0).getTime();
  const now = d.getTime();
  if (now < today5pm) {
    return { start: today5pm - 24 * 60 * 60 * 1000, end: today5pm };
  }
  return { start: today5pm, end: today5pm + 24 * 60 * 60 * 1000 };
}

function getWorkDayLabel(dayStart, dayEnd) {
  const startD = new Date(dayStart);
  const endD = new Date(dayEnd);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(startD)}, 5pm – ${fmt(endD)}, 5pm`;
}

/** Build daily calendar from Firebase sessions (today, 12am–12am), grouped by user */
const USER_COLORS = [
  "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899",
  "#06b6d4", "#84cc16", "#ef4444", "#6366f1", "#14b8a6"
];

const TIMELINE_ZOOM_LEVELS = [
  { pxPerHour: 24, tickMinutes: 180 },
  { pxPerHour: 48, tickMinutes: 60 },
  { pxPerHour: 72, tickMinutes: 30 },
  { pxPerHour: 120, tickMinutes: 15 },
  { pxPerHour: 168, tickMinutes: 10 },
  { pxPerHour: 240, tickMinutes: 5 }
];
const TIMELINE_BLOCK_GAP_PCT = 0.08;
const TIMELINE_BLOCK_MIN_WIDTH_PCT = 0.06;
let timelineZoomIndex = 1;
let lastSessionsForTimeline = null;

function getTimelineZoom() {
  return TIMELINE_ZOOM_LEVELS[Math.min(timelineZoomIndex, TIMELINE_ZOOM_LEVELS.length - 1)];
}

function formatTimeLabel(h, min) {
  if (h === 0 && min === 0) return "12am";
  if (h === 12 && min === 0) return "12pm";
  if (h < 12) return `${h}:${String(min).padStart(2, "0")}am`;
  return `${h - 12 || 12}:${String(min).padStart(2, "0")}pm`;
}

function shouldShowAxisLabel(tickMinutes, m) {
  if (tickMinutes >= 60) return true;
  return m % 60 === 0;
}

/** Normalize Firebase sessions response (object or array) to array of session objects */
function normalizeSessionsArray(sessionsObj) {
  if (!sessionsObj) return [];
  if (Array.isArray(sessionsObj)) {
    return sessionsObj.map((s, i) => ({ id: String(i), ...(s && typeof s === "object" ? s : {}) }));
  }
  return Object.entries(sessionsObj).map(([id, s]) => ({ id, ...(s && typeof s === "object" ? s : {}) }));
}

function buildDailyCalendarFromFirebase(sessionsObj) {
  const container = document.getElementById("dailyCalendarContainer");
  if (!container) return;
  if (sessionsObj !== undefined && sessionsObj !== null) lastSessionsForTimeline = sessionsObj;

  const sessions = normalizeSessionsArray(lastSessionsForTimeline);
  const { start: dayStart, end: dayEnd } = getDayBounds(new Date());
  const dayLength = dayEnd - dayStart;

  const inToday = (t) => {
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
    const end = logoutAt
      ? Math.min(logoutAt, dayEnd)
      : Math.min(Date.now(), dayEnd);
    if (inToday(loginAt) || inToday(logoutAt) || (loginAt < dayStart && (!logoutAt || logoutAt > dayStart))) {
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
  const zoomCfg = getTimelineZoom();
  const TIMELINE_HOURS = 24;
  const trackWidthPx = TIMELINE_HOURS * zoomCfg.pxPerHour;
  const dayLabel = getWorkDayLabel(dayStart, dayEnd);

  if (users.length === 0) {
    container.innerHTML = `
      <div class="timeline-day-label">${dayLabel} (scroll →)</div>
      <div class="timeline-zoom-controls"><button type="button" id="timelineZoomOut" class="timeline-zoom-btn">−</button><span class="timeline-zoom-label">${zoomCfg.tickMinutes === 60 ? "1h" : zoomCfg.tickMinutes + "m"}</span><button type="button" id="timelineZoomIn" class="timeline-zoom-btn">+</button></div>
      <div class="timeline-empty">No one has used the extension today yet.</div>`;
    attachTimelineZoomHandlers();
    return;
  }

  const totalMinutes = 24 * 60;
  const ticks = [];
  for (let m = 0; m <= totalMinutes; m += zoomCfg.tickMinutes) {
    const clockHour = (WORK_DAY_START_HOUR + Math.floor(m / 60)) % 24;
    const min = m % 60;
    const showLabel = shouldShowAxisLabel(zoomCfg.tickMinutes, m);
    if (!showLabel) continue;
    const label = `${clockHour >= 6 && clockHour < 18 ? "☀" : "☽"} ${formatTimeLabel(clockHour, min)}`;
    ticks.push({ label, leftPct: (m / totalMinutes) * 100, icon: clockHour >= 6 && clockHour < 18 ? "sun" : "moon" });
  }
  let axisHtml = `<div class="timeline-axis timeline-axis-detail" style="width: ${trackWidthPx}px; min-width: ${trackWidthPx}px;">`;
  ticks.forEach(({ label, leftPct, icon }) => {
    axisHtml += `<span class="timeline-axis-tick ${icon}" style="left: ${leftPct}%;">${label}</span>`;
  });
  axisHtml += "</div>";

  let rowsHtml = "";
  users.forEach((user, idx) => {
    const color = USER_COLORS[idx % USER_COLORS.length];
    const blocks = segmentsByUser[user];
    const totalMs = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
    const totalMins = Math.round(totalMs / 60000);
    const totalStr = totalMins < 60 ? `${totalMins}m` : `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
    const titleAttr = `${escapeHtml(user)} — ${totalStr} on RPS this work day`;
    let blocksHtml = "";
    blocks.forEach((b) => {
      const leftPct = ((b.start - dayStart) / dayLength) * 100;
      let widthPct = ((b.end - b.start) / dayLength) * 100;
      widthPct = Math.max(TIMELINE_BLOCK_MIN_WIDTH_PCT, widthPct - TIMELINE_BLOCK_GAP_PCT);
      const timeStr = `${new Date(b.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(b.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      blocksHtml += `<div class="timeline-block" style="left: ${leftPct}%; width: ${widthPct}%; background: ${color};" title="${escapeHtml(timeStr)}">${widthPct >= 2 ? escapeHtml(user) : ""}</div>`;
    });
    rowsHtml += `
      <div class="timeline-row">
        <div class="timeline-name" title="${titleAttr}">${escapeHtml(user)}</div>
        <div class="timeline-track-wrap" style="width: ${trackWidthPx}px; min-width: ${trackWidthPx}px;">
          <div class="timeline-track" style="width: ${trackWidthPx}px;">${blocksHtml}</div>
        </div>
      </div>`;
  });

  const zoomLabel = zoomCfg.tickMinutes === 60 ? "1h" : zoomCfg.tickMinutes + "m";
  container.innerHTML = `
    <div class="timeline-day-label">${dayLabel} (scroll →)</div>
    <div class="timeline-zoom-controls"><button type="button" id="timelineZoomOut" class="timeline-zoom-btn">−</button><span class="timeline-zoom-label">${zoomLabel}</span><button type="button" id="timelineZoomIn" class="timeline-zoom-btn">+</button></div>
    <div class="timeline-rows-scroll" id="timelineScrollArea">
      <div class="timeline-scroll-inner" style="width: ${trackWidthPx}px; min-width: ${trackWidthPx}px;">
        ${axisHtml}
        ${rowsHtml}
      </div>
    </div>
  `;
  attachTimelineZoomHandlers();
}

function timelineZoomIn() {
  timelineZoomIndex = Math.min(TIMELINE_ZOOM_LEVELS.length - 1, timelineZoomIndex + 1);
  buildDailyCalendarFromFirebase();
}

function timelineZoomOut() {
  timelineZoomIndex = Math.max(0, timelineZoomIndex - 1);
  buildDailyCalendarFromFirebase();
}

function attachTimelineZoomHandlers() {
  const out = document.getElementById("timelineZoomOut");
  const inBtn = document.getElementById("timelineZoomIn");
  if (out) out.onclick = timelineZoomOut;
  if (inBtn) inBtn.onclick = timelineZoomIn;
  const scrollArea = document.getElementById("timelineScrollArea");
  if (scrollArea) {
    scrollArea.onwheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (e.deltaY < 0) timelineZoomIn();
      else timelineZoomOut();
    };
    scrollArea.style.touchAction = "pan-x";
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Fetch only currentUser – keeps "who's using now" live with minimal data */
async function loadWhoIsUsing() {
  const baseUrl = getFirebaseBaseUrl();
  const whosUsingEl = document.getElementById("whosUsingDetails");
  const whosUsingBadge = document.getElementById("whosUsingBadge");
  const whosUsingIndicator = document.getElementById("whosUsingIndicator");

  if (!baseUrl) {
    if (whosUsingEl) whosUsingEl.textContent = "Firebase URL not configured’s";
    if (whosUsingBadge) whosUsingBadge.textContent = "–";
    if (whosUsingIndicator) whosUsingIndicator.className = "status-indicator unknown";
    return;
  }

  try {
    const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}`;
    const currentUser = await firebaseRequest(`${path}/currentUser`);

    const showAsInUse = currentUser && currentUser.displayName;

    if (showAsInUse) {
      if (whosUsingBadge) {
        whosUsingBadge.textContent = currentUser.displayName;
        whosUsingBadge.className = "status-badge logged-in";
      }
      if (whosUsingIndicator) whosUsingIndicator.className = "status-indicator active";
      if (whosUsingEl) {
        const at = currentUser.loggedInAt
          ? formatTimestamp(currentUser.loggedInAt)
          : "";
        whosUsingEl.textContent = `Logged in since ${at}${currentUser.clientId ? ` (${currentUser.clientId})` : ""}`;
      }
    } else {
      if (whosUsingBadge) {
        whosUsingBadge.textContent = "No one";
        whosUsingBadge.className = "status-badge logged-out";
      }
      if (whosUsingIndicator) whosUsingIndicator.className = "status-indicator inactive";
      if (whosUsingEl) whosUsingEl.textContent = "No one is currently logged into LinkedIn/RPS.";
    }
  } catch (e) {
    console.warn("[Popup] Failed to load who's using:", e);
    if (whosUsingEl) whosUsingEl.textContent = "Could not load. Check Firebase.";
    if (whosUsingBadge) whosUsingBadge.textContent = "–";
    if (whosUsingIndicator) whosUsingIndicator.className = "status-indicator unknown";
  }
}

/** Fetch recent sessions (limited) and build today's timeline */
async function loadSessionsAndCalendar() {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) {
    buildDailyCalendarFromFirebase(null);
    return;
  }
  const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}/sessions`;
  try {
    const sessionsObj = await firebaseRequest(path, {
      query: { orderBy: '"$key"', limitToLast: SESSIONS_FETCH_LIMIT }
    });
    buildDailyCalendarFromFirebase(sessionsObj || null);
  } catch (e) {
    console.warn("[Popup] Sessions query failed, trying full fetch:", e);
    try {
      const sessionsObj = await firebaseRequest(path);
      buildDailyCalendarFromFirebase(sessionsObj || null);
    } catch (e2) {
      console.warn("[Popup] Failed to load sessions for calendar:", e2);
      buildDailyCalendarFromFirebase(null);
    }
  }
}

/** Load both "who's using" and timeline (used on popup open) */
function loadFirebasePresenceAndCalendar() {
  loadWhoIsUsing();
  loadSessionsAndCalendar();
}

const TEAM_ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;

function formatGoneSince(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  } catch (e) {
    return "";
  }
}

function formatActiveSince(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    return `${Math.floor(diffHours / 24)}d`;
  } catch (e) {
    return "";
  }
}

async function loadTeamAvailability() {
  const container = document.getElementById("teamAvailabilityList");
  if (!container) return;
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) {
    container.innerHTML = '<div class="team-avail-empty">Firebase not configured</div>';
    return;
  }
  try {
    const [{ accountId }, usersObj, onlineObj] = await Promise.all([
      getAccountIdAndClientId(),
      firebaseRequest("/users"),
      firebaseRequest("/extensionOnline")
    ]);
    const users = usersObj
      ? Object.entries(usersObj).map(([id, u]) => ({
          id,
          displayName: (u && (u.displayName || u.username)) || id,
          teamId: u && u.teamId ? u.teamId : null
        }))
      : [];
    const online = onlineObj && typeof onlineObj === "object" ? onlineObj : {};
    const userIdsFromOnline = Object.keys(online).filter((k) => online[k] && typeof online[k] === "object");
    // Filter to this account's team if teamId is set. Users without teamId are treated as global.
    const idSet = new Set();
    users.forEach((u) => {
      if (!accountId || !u.teamId || u.teamId === accountId) {
        idSet.add(u.id);
      }
    });
    userIdsFromOnline.forEach((id) => {
      const u = users.find((x) => x.id === id);
      if (u) {
        if (!accountId || !u.teamId || u.teamId === accountId) idSet.add(id);
      } else if (!accountId) {
        idSet.add(id);
      }
    });
    const combinedIds = Array.from(idSet);
    const getDisplayName = (id) => {
      const u = users.find((x) => x.id === id);
      if (u) return u.displayName;
      const p = online[id];
      return (p && p.displayName) || (id === "ADMIN" ? "Admin" : id);
    };
    const now = Date.now();
    // Group by display name to avoid duplicates when the same person has multiple entries
    const grouped = new Map();
    combinedIds.forEach((id) => {
      const displayName = getDisplayName(id);
      const presence = online[id];
      const lastSeenAt = presence && presence.lastSeenAt ? new Date(presence.lastSeenAt).getTime() : 0;
      const existing = grouped.get(displayName);
      if (!existing || lastSeenAt > existing.lastSeenAt) {
        grouped.set(displayName, { id, displayName, presence, lastSeenAt });
      }
    });

    let html = "";
    const entries = Array.from(grouped.values());
    if (entries.length === 0) {
      html = '<div class="team-avail-empty">No extension accounts yet (add in Admin)</div>';
    } else {
      entries.forEach(({ displayName, presence, lastSeenAt }) => {
        const isActive = lastSeenAt && (now - lastSeenAt) < TEAM_ACTIVE_THRESHOLD_MS;
        const firstSeenAtIso = presence && presence.firstSeenAt ? presence.firstSeenAt : null;
        const activeSinceStr = formatActiveSince(firstSeenAtIso);
        const goneSince = formatGoneSince(presence && presence.lastSeenAt ? presence.lastSeenAt : null);
        const clientId = presence && presence.clientId ? presence.clientId : "";
        const statusClass = isActive ? "team-avail-active" : "team-avail-offline";
        const statusLabel = isActive ? (activeSinceStr ? `Active since ${activeSinceStr}` : "Active") : "Offline";
        const title = isActive
          ? (activeSinceStr ? `Active since ${activeSinceStr}` : (clientId ? `Active · ${clientId}` : "Active now"))
          : (lastSeenAt ? `Gone since ${goneSince}` : "Not logged in");
        html += `<div class="team-avail-row ${statusClass}" title="${escapeHtml(title)}">
          <span class="team-avail-dot"></span>
          <span class="team-avail-name">${escapeHtml(displayName)}</span>
          <span class="team-avail-status">${escapeHtml(statusLabel)}</span>
        </div>`;
      });
    }
    container.innerHTML = html;
  } catch (e) {
    console.warn("[Popup] Team availability failed:", e);
    container.innerHTML = '<div class="team-avail-empty">Could not load</div>';
  }
}

async function loadDetectedAccount() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes("linkedin.com")) {
      return;
    }

    const results = await chrome.tabs.sendMessage(tab.id, { action: "getAccountInfo" });
    if (results && results.email) {
      const container = document.getElementById("detectedAccount");
      const valueEl = document.getElementById("detectedAccountValue");
      container.style.display = "block";
      valueEl.textContent = results.email;

      // Check if it matches the configured RPS account (Firebase config) or any saved account
      const emailLower = results.email.toLowerCase();
      let fromConfig = false;
      try {
        const { accountId } = await getAccountIdAndClientId();
        if (accountId) {
          const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`);
          if (cfg && cfg.email && typeof cfg.email === "string" && cfg.email.toLowerCase() === emailLower) {
            fromConfig = true;
          }
        }
      } catch (_) {}
      const fromSaved = await new Promise((resolve) => {
        chrome.storage.sync.get(["savedAccounts"], ({ savedAccounts }) => {
          const accounts = Array.isArray(savedAccounts) ? savedAccounts : [];
          resolve(accounts.some((acc) => acc.username && acc.username.toLowerCase() === emailLower));
        });
      });
      const isRPS = fromConfig || fromSaved;
      if (isRPS) {
        container.classList.add("match");
        valueEl.textContent = `${results.email} ✓ (RPS Account)`;
      } else {
        container.classList.remove("match");
      }
    }
  } catch (err) {
    // Tab might not be LinkedIn or content script not ready
  }
}

async function loadTeamNameLabel() {
  const label = document.getElementById("teamNameLabel");
  if (!label) return;
  try {
    const { accountId } = await getAccountIdAndClientId();
    if (!accountId) {
      label.textContent = "";
      return;
    }
    const cfg = await firebaseRequest(`/accounts/${encodeURIComponent(accountId)}/config`);
    if (cfg && typeof cfg.teamName === "string" && cfg.teamName.trim()) {
      label.textContent = `Team: ${cfg.teamName}`;
    } else {
      label.textContent = `Account: ${accountId}`;
    }
  } catch (e) {
    label.textContent = "";
  }
}

function loadPopupData() {
  chrome.storage.local.get(
    [
      "statusHistory",
      "lastStatus",
      "lastStatusTimestamp",
      "lastStatusSource",
      "debugLogs"
    ],
    (data) => {
      const { statusHistory, lastStatus, lastStatusTimestamp, lastStatusSource, debugLogs } =
        data || {};

      setCurrentStatus(lastStatus, lastStatusTimestamp, lastStatusSource);
      renderHistory(statusHistory);
      renderLogs(debugLogs);
    }
  );

  chrome.runtime.sendMessage({ action: "ensurePresence" }).catch(() => {});
  loadFirebasePresenceAndCalendar();
  loadTeamAvailability();
  loadDetectedAccount();
}

// ---- AUTH / LOGIN HANDLING ----

async function getAccountIdAndClientId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["accountId", "clientId"], ({ accountId, clientId }) => {
      resolve({ accountId: accountId || null, clientId: clientId || "unknown" });
    });
  });
}

/** Fixed path for extension presence – no Account ID needed once logged in */
const PRESENCE_ACCOUNT_ID = "default";
const SESSIONS_SWEEP_LIMIT = 300;

/** Close every open session (no logoutAt) that does NOT belong to the given user. */
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
    console.warn("[Popup] closeAllOtherOpenSessions failed:", e);
  }
}

/** Refresh "who's using" (currentUser only) every 10s for a live feel */
const PRESENCE_REFRESH_MS = 10000;
/** Refresh timeline (sessions) less often – only need last N for calendar */
const SESSIONS_FETCH_LIMIT = 500;
const SESSIONS_REFRESH_MS = 60000;
let presenceRefreshIntervalId = null;
let sessionsRefreshIntervalId = null;
let teamAvailabilityIntervalId = null;

/** Update the single active-user slot in Firebase. When a different user logs in, close the previous user's open session (set logoutAt). */
async function setCurrentUserInFirebase(auth) {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) return;

  const { lastStatus } = await new Promise((resolve) => {
    chrome.storage.local.get(["lastStatus"], resolve);
  });
  if (lastStatus !== "logged_in") {
    return;
  }

  const { clientId } = await getAccountIdAndClientId();
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
  });
  const existingSessionId = stored.currentSessionId;
  const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}`;
  const now = new Date().toISOString();
  const newUserId = auth.userId || "ADMIN";
  const newDisplayName = auth.displayName || auth.username || "Admin";

  try {
    const currentInFirebase = await firebaseRequest(`${path}/currentUser`);
    const isDifferentUser =
      currentInFirebase &&
      (currentInFirebase.userId !== newUserId || currentInFirebase.displayName !== newDisplayName);

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

    await closeAllOtherOpenSessions(path, newUserId, newDisplayName, now);

    const storedAfterClose = await new Promise((resolve) => {
      chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
    });
    const haveSession = storedAfterClose.currentSessionId;

    let loggedInAt = now;
    if (haveSession && currentInFirebase && currentInFirebase.clientId === clientId && currentInFirebase.userId === newUserId && currentInFirebase.loggedInAt) {
      loggedInAt = currentInFirebase.loggedInAt;
    }

    const currentUser = {
      userId: newUserId,
      displayName: newDisplayName,
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
              displayName: newDisplayName,
              userId: newUserId,
              at: now,
              source: "popup_login"
            })
          });
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn("[Popup] Failed to set current user in Firebase:", e);
  }
}

/** Clear current user in Firebase only when we are the one shown (same clientId). Close our session always. */
async function clearCurrentUserInFirebase() {
  const baseUrl = getFirebaseBaseUrl();
  if (!baseUrl) return;

  const stored = await new Promise((resolve) => {
    chrome.storage.local.get(["currentSessionId", "currentSessionAccountId"], resolve);
  });
  const sessionId = stored.currentSessionId;
  const sessionAccountId = stored.currentSessionAccountId || PRESENCE_ACCOUNT_ID;
  const path = `/accounts/${encodeURIComponent(sessionAccountId)}`;
  const { clientId } = await getAccountIdAndClientId();

  try {
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

    const currentInFirebase = await firebaseRequest(`${path}/currentUser`);
    if (currentInFirebase && currentInFirebase.clientId === clientId) {
      await firebaseRequest(`${path}/currentUser`, {
        method: "PUT",
        body: JSON.stringify(null)
      });
    }
  } catch (e) {
    console.warn("[Popup] Failed to clear current user in Firebase:", e);
  }
}

async function loginAsUser(username, password) {
  if (!username || !password) {
    return { ok: false, error: "Please enter username and password." };
  }

  try {
    const users = await firebaseRequest("/users");
    if (!users) {
      return { ok: false, error: "No users found in Firebase." };
    }

    const entries = Object.entries(users);
    const found = entries.find(
      ([, u]) =>
        u &&
        typeof u.username === "string" &&
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );

    if (!found) {
      return { ok: false, error: "Invalid username or password." };
    }

    const [userId, user] = found;
    const { clientId: ourClientId } = await getAccountIdAndClientId();

    // Block if this extension user is already active on another device (extensionOnline presence)
    try {
      const presence = await firebaseRequest(`/extensionOnline/${encodeURIComponent(userId)}`);
      if (presence && presence.clientId && presence.clientId !== ourClientId) {
        const lastSeen = presence.lastSeenAt ? new Date(presence.lastSeenAt).getTime() : 0;
        const nowMs = Date.now();
        // If we have no lastSeen or it is recent, treat as active and block
        if (!lastSeen || nowMs - lastSeen < 10 * 60 * 1000) {
          return {
            ok: false,
            error: `This user is already active on another device (${presence.clientId}).`
          };
        }
      }
    } catch (_) {}

    // Also block if RPS currentUser is already this user from a different client
    const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}`;
    const currentInFirebase = await firebaseRequest(`${path}/currentUser`);
    if (currentInFirebase && currentInFirebase.userId === userId && currentInFirebase.clientId && currentInFirebase.clientId !== ourClientId) {
      const location = currentInFirebase.clientId;
      return {
        ok: false,
        error: `This user is already logged in at another location (${location}). Log out there first, or ask admin to reset your password to force logout.`
      };
    }

    let isAdmin = false;
    try {
      const admins = await firebaseRequest("/admins");
      isAdmin = !!(admins && admins[userId] === true);
    } catch (_) {}
    const auth = {
      isAdmin,
      userId,
      username: user.username,
      displayName: user.displayName || user.username,
      loggedInAt: new Date().toISOString()
    };
    await chrome.storage.sync.set({ extensionAuth: auth });
    await setCurrentUserInFirebase(auth);
    return { ok: true, auth };
  } catch (e) {
    return { ok: false, error: e.message || "Error connecting to Firebase." };
  }
}

async function logoutExtension() {
  const auth = await new Promise((r) => chrome.storage.sync.get(["extensionAuth"], r));
  const userId = auth.extensionAuth && (auth.extensionAuth.userId || (auth.extensionAuth.isAdmin ? "ADMIN" : null));
  await clearCurrentUserInFirebase();
  await chrome.storage.sync.remove("extensionAuth");
  if (userId) {
    try {
      await chrome.runtime.sendMessage({ action: "removeExtensionOnline", userId });
    } catch (e) {}
  }
}

function showLoginView() {
  if (presenceRefreshIntervalId) {
    clearInterval(presenceRefreshIntervalId);
    presenceRefreshIntervalId = null;
  }
  if (sessionsRefreshIntervalId) {
    clearInterval(sessionsRefreshIntervalId);
    sessionsRefreshIntervalId = null;
  }
  if (teamAvailabilityIntervalId) {
    clearInterval(teamAvailabilityIntervalId);
    teamAvailabilityIntervalId = null;
  }
  document.getElementById("loginView").style.display = "block";
  document.getElementById("appView").style.display = "none";
}

function showAppView(extensionAuth) {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("appView").style.display = "block";
  renderExtensionUserInfo(extensionAuth);
  const adminBtn = document.getElementById("adminBtn");
  if (adminBtn) adminBtn.style.display = extensionAuth && extensionAuth.isAdmin ? "" : "none";
  loadPopupData();
  chrome.runtime.sendMessage({ action: "writeExtensionOnlineNow" }).catch(() => {});

  if (presenceRefreshIntervalId) clearInterval(presenceRefreshIntervalId);
  presenceRefreshIntervalId = setInterval(() => {
    loadFirebasePresenceAndCalendar();
  }, PRESENCE_REFRESH_MS);
  if (teamAvailabilityIntervalId) clearInterval(teamAvailabilityIntervalId);
  teamAvailabilityIntervalId = setInterval(loadTeamAvailability, 20000);
  loadTeamAvailability();
}

function initLoginHandlers() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const errorEl = document.getElementById("loginError");

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      errorEl.textContent = "";
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      if (!username || !password) {
        errorEl.textContent = "Enter username and password.";
        return;
      }
      const res = await loginAsUser(username, password);
      if (!res.ok) {
        errorEl.textContent = res.error || "Login failed.";
        return;
      }
      showAppView(res.auth);
    });
  }

  logoutBtn.addEventListener("click", async () => {
    await logoutExtension();
    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginError").textContent = "";
    showLoginView();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLoginHandlers();

  chrome.storage.sync.get(["extensionAuth"], async ({ extensionAuth }) => {
    if (extensionAuth && !extensionAuth.isAdmin && extensionAuth.userId) {
      try {
        const path = `/accounts/${encodeURIComponent(PRESENCE_ACCOUNT_ID)}`;
        const userNode = await firebaseRequest(`/users/${extensionAuth.userId}`);
        const forceLogoutAt = userNode && userNode.forceLogoutAt ? userNode.forceLogoutAt : null;
        const loggedInAt = extensionAuth.loggedInAt || "0";
        if (forceLogoutAt && new Date(forceLogoutAt) > new Date(loggedInAt)) {
          await clearCurrentUserInFirebase();
          await chrome.storage.sync.remove("extensionAuth");
          showLoginView();
          const msg = document.getElementById("loginError");
          if (msg) msg.textContent = "You have been logged out (password was changed by admin).";
          return;
        }
      } catch (_) {}
    }
    if (extensionAuth) {
      showAppView(extensionAuth);
    } else {
      showLoginView();
      const err = document.getElementById("loginError");
      if (err) err.textContent = "";
    }
    loadTeamNameLabel().catch(() => {});
  });

  document.getElementById("adminBtn").addEventListener("click", () => {
    const url = chrome.runtime.getURL("admin.html");
    chrome.tabs.create({ url });
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadPopupData();
  });

  // Collapsible Recent Activity and Debug Log
  const toggleCollapse = (btnId, bodyId) => {
    const btn = document.getElementById(btnId);
    const body = document.getElementById(bodyId);
    if (!btn || !body) return;
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", !expanded);
      body.classList.toggle("collapsed", expanded);
    });
  };
  toggleCollapse("toggleActivity", "activityBody");
  toggleCollapse("toggleDebug", "debugBody");
});
