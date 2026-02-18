# Quick Configuration Reference

This file lists all the places where you need to edit code to configure the extension.

---

## 🔥 Firebase Configuration (Required)

**Files to edit:** `popup.js`, `background.js`, `admin.js`, `god.js`

**Location:** Top of each file, look for:

```javascript
const FIREBASE_CONFIG = {
  databaseURL: "YOUR-FIREBASE-DATABASE-URL-HERE"
};
```

**What to do:**
1. Get your Firebase Database URL from Firebase Console
2. Replace `YOUR-FIREBASE-DATABASE-URL-HERE` in all 4 files
3. Format: `https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app/`

**Example:**
```javascript
const FIREBASE_CONFIG = {
  databaseURL: "https://my-project-default-rtdb.asia-southeast1.firebasedatabase.app/"
};
```

---

## ⏰ Work Day Hours (Optional)

**Files:** `popup.js` (line ~225), `admin.js` (line ~587)

**Location:** Look for `WORK_DAY_START_HOUR`

```javascript
const WORK_DAY_START_HOUR = 17; // 5pm (24-hour format)
```

**What to change:** Set to your work day start hour (0-23). Timeline runs from this hour to the same hour next day.

**Example:** For 9am start:
```javascript
const WORK_DAY_START_HOUR = 9; // 9am
```

---

## 🔍 Timeline Zoom Levels (Optional)

**Files:** `popup.js`, `admin.js`

**Location:** Look for `TIMELINE_ZOOM_LEVELS` or `ADMIN_ZOOM_LEVELS`

```javascript
const TIMELINE_ZOOM_LEVELS = [
  { pxPerHour: 24, tickMinutes: 180 },  // 3h view
  { pxPerHour: 48, tickMinutes: 60 },   // 1h view
  { pxPerHour: 72, tickMinutes: 30 },  // 30m view
  // ... more levels
];
```

**What to change:**
- `pxPerHour`: Pixels per hour (higher = more zoomed in)
- `tickMinutes`: Minutes between axis ticks

---

## 🎨 Theme Colors (Optional)

**Files:** `popup.html`, `admin.html`

**Location:** `<style>` blocks, look for `:root` variables

```css
:root {
  --win-title: #000080;        /* Title bar blue */
  --win-bg: #c0c0c0;           /* Background gray */
  --win-face: #c0c0c0;         /* Button face */
  --win-highlight: #ffffff;    /* 3D highlight */
  --win-shadow: #808080;       /* 3D shadow */
  --win-text: #000000;         /* Text color */
}
```

**What to change:** Modify hex color values to customize the theme.

---

## 📝 That's It!

All other configuration is done through:

1. **GOD Mode** (`god.html`) – Manage accounts, teams, users
2. **Extension Admin** (gear icon) – Configure per-team settings
3. **Firebase Console** – View/manage data directly

No other code changes are required!
