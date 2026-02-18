# LinkedIn RPS Tracker – Complete Setup Guide

This is a detailed, step-by-step guide for setting up the extension from scratch. Follow this guide if you're setting up the extension for the first time or handing it to someone else.

---

## 📋 Table of Contents

1. [What This Extension Does](#what-this-extension-does)
2. [Prerequisites](#prerequisites)
3. [Firebase Setup](#firebase-setup)
4. [Install the Extension](#install-the-extension)
5. [Configure the Extension](#configure-the-extension)
6. [Initial Setup (GOD Mode)](#initial-setup-god-mode)
7. [Configure Extension Admin](#configure-extension-admin)
8. [How to Use](#how-to-use)
9. [File Overview](#file-overview)
10. [Troubleshooting](#troubleshooting)

---

## What This Extension Does

- **Tracks who is on your shared LinkedIn RPS account** in real time ("Who's on RPS now")
- **Tracks extension logins** so you see which team member is logged into the extension (Team availability)
- **Shows a daily timeline** of who was on RPS when (by extension session)
- **Multi-team support** – manage multiple teams/accounts from one extension
- **Does not scrape LinkedIn data** – it only observes login/logout (cookie + URL) and writes presence/sessions to Firebase

**Key concept:** One RPS account = one person on LinkedIn at a time. When someone else logs in, the previous person is logged out. The extension records these sessions and shows them live and in the timeline.

---

## Prerequisites

- **Chrome** or **Microsoft Edge** (Chromium-based)
- A **Google account** (for Firebase)
- The project folder with all files

---

## Firebase Setup

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** (or use an existing one)
3. Name it (e.g., "LinkedIn RPS Tracker")
4. Follow the setup wizard (Analytics is optional)
5. When the project is ready, open it

### Step 2: Create Realtime Database

1. In the left menu: **Build → Realtime Database**
2. Click **"Create Database"**
3. Pick a region (e.g., your country or `asia-southeast1`)
4. Start in **Test mode** for initial setup (you'll secure it with rules next)
5. After creation, you'll see the **Database URL** at the top:
   ```
   https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app
   ```
   **Copy this URL** – you'll need it in the next steps

### Step 3: Set Security Rules

1. In Realtime Database, open the **Rules** tab
2. Replace the default rules with the contents of **`database.rules.json`** from this project
3. Click **"Publish"**

These rules allow read/write to the paths the extension uses (`/users`, `/accounts/{accountId}/...`, `/extensionOnline`, etc.) and validate data shape.

**Important:** The rules allow public read/write. This is fine for internal use, but if you need stricter security, consider Firebase Authentication or IP restrictions.

---

## Install the Extension

1. Open **Chrome**: go to `chrome://extensions` (or **Edge**: `edge://extensions`)
2. Turn **Developer mode** on (toggle in top right)
3. Click **"Load unpacked"**
4. Select the project folder (the one that contains `manifest.json`, `popup.html`, `background.js`, etc.)
5. The extension should appear in the toolbar. Pin it if you like

---

## Configure the Extension

### Step 1: Set Firebase URL (Required)

You must set your Firebase Database URL in **4 files**. Open each file and find `FIREBASE_CONFIG`:

| File | Line | What to change |
|------|------|----------------|
| `popup.js` | ~2 | `FIREBASE_CONFIG.databaseURL` |
| `background.js` | ~6 | `FIREBASE_CONFIG.databaseURL` |
| `admin.js` | ~8 | `FIREBASE_CONFIG.databaseURL` |
| `god.js` | ~4 | `FIREBASE_CONFIG.databaseURL` |

**Example:**

```javascript
const FIREBASE_CONFIG = {
  databaseURL: "https://YOUR-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app/"
};
```

**Important:**
- Use the **exact** URL from Firebase (no trailing path, only the database root)
- Replace `YOUR-PROJECT-ID` and `REGION` with your actual values
- After editing, **reload the extension** on `chrome://extensions`

---

## Initial Setup (GOD Mode)

GOD mode is a standalone admin interface for managing all teams, accounts, and users. You'll use it to set up your first account and admin user.

### Step 1: Open GOD Mode

1. Open **`god.html`** in your browser (double-click the file or drag it into Chrome/Edge)
2. You should see a Windows 98-style interface

### Step 2: Test Firebase Connection

1. Click **"Test connection"** button
2. You should see "Connected OK" in green
3. If you see an error, check:
   - Firebase URL is set correctly in `god.js`
   - Database is created and running
   - Rules are published

### Step 3: Create Your First Account/Team

1. In the **"Accounts / Teams"** panel:
   - **Account ID**: Enter an ID (e.g., `default` or `team-bd`)
   - **Team name**: Enter a display name (e.g., "BD Team")
   - **RPS LinkedIn email**: Enter the email of your shared RPS LinkedIn account
   - **RPS display name**: Enter a display name (e.g., "Company RPS Account")
   - **LinkedIn profile path** (optional): Your RPS account's LinkedIn profile slug
2. Click **"Save / Update account"**
3. You should see the account appear in the list below

### Step 4: Create Your First Admin User

1. In the **"Extension users & admins"** panel:
   - **Username**: Enter a username (e.g., `admin`)
   - **Display name**: Enter a display name (e.g., "Admin")
   - **Password**: Enter a secure password
   - Check **"Is admin"** checkbox
   - **Team / Account**: Select the account you just created from the dropdown
2. Click **"Save / Update user"**
3. You should see the user appear in the list with `[ADMIN]` tag

### Step 5: Create Team Members

1. For each team member:
   - **Username**: Their username (e.g., `john`, `sarah`)
   - **Display name**: Their display name (e.g., "John", "Sarah")
   - **Password**: Their password
   - **Team / Account**: Select the team from dropdown
   - Leave **"Is admin"** unchecked (unless they should be admin)
2. Click **"Save / Update user"** for each

**Note:** Users are automatically tagged with the selected `teamId`, so they'll only see their team's data in the extension.

---

## Configure Extension Admin

Now you'll configure the extension itself for your team.

### Step 1: Log Into Extension

1. Click the extension icon in your browser toolbar
2. Enter your **admin username** and **password** (created in GOD mode)
3. Click **"Log in"**
4. You should see the main popup interface

### Step 2: Open Admin Settings

1. Click the **gear icon** (⚙️) in the popup header
2. The Admin Settings page opens in a new tab

### Step 3: Set Browser/User ID

1. In **"Extension & Browser Identity"** section:
   - **Browser / User ID**: Enter your identifier (e.g., `shahriyar-office`, `john-laptop`)
   - This appears in "Who's on RPS now" so others know which device you're using
2. Click **"Save Settings"**

### Step 4: Configure RPS Account

1. In **"LinkedIn RPS Account Configuration"** section:
   - **Display Name**: e.g., "Main RPS Account"
   - **Shared Account ID**: **Must match** the Account ID you created in GOD mode (e.g., `default`)
   - **LinkedIn Email / Username**: Your RPS account email (same as in GOD mode)
   - **LinkedIn Password** (optional): For reference only
   - **Notes** (optional): Any additional info
2. Click **"Add / Update Account"**
3. The account card appears below
4. Click **"Set as active for tracking"** on the account card
5. This sets your active `accountId` so the extension knows which team you belong to

### Step 5: Verify Team Name

1. After setting the active account, reload the Admin page
2. You should see **"Team: {teamName}"** at the top (from GOD mode config)
3. If not, check that:
   - Account ID matches between GOD mode and Extension Admin
   - `teamName` is set in `/accounts/{accountId}/config` in Firebase

---

## How to Use

### For Regular Users

1. **Log into the extension:**
   - Click extension icon → Enter username/password → Click "Log in"

2. **Use LinkedIn as usual:**
   - Log into the RPS LinkedIn account in your browser
   - Navigate to Recruiter pages (e.g., `/talent/`)
   - The extension detects you're on RPS and shows you as "Who's on RPS now"

3. **View team availability:**
   - See who's active in the extension (green = active, gray = offline)

4. **View timeline:**
   - "Today's timeline" shows who was on RPS when
   - Scroll horizontally to see the full day
   - Use zoom buttons or mouse wheel to zoom in/out

### For Team Admins

1. **Manage users:**
   - Open Admin Settings (gear icon)
   - Use "Extension Login Users (Firebase)" to add/edit users
   - Users are automatically tagged with your team's `accountId`

2. **View sessions:**
   - Use "Sessions (RPS)" section to view/edit/delete sessions
   - Filter by date to see specific days

3. **Reset team presence:**
   - If users appear twice or stale, click "Reset this team's presence"
   - This clears `/extensionOnline` entries for your team only

---

## File Overview

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (permissions, popup, background, content script) |
| `popup.html` / `popup.js` | Main extension popup UI (login, "Who's on RPS," team list, timeline) |
| `background.js` | Service worker (cookie/tab monitoring, Firebase presence/sessions) |
| `content.js` | Content script (runs on LinkedIn pages, extracts account info) |
| `admin.html` / `admin.js` | Team admin panel (users, sessions, settings) |
| `god.html` / `god.js` | GOD mode (centralized admin for all teams/accounts) |
| `database.rules.json` | Firebase Realtime Database security rules |
| `README.md` | Main project README (for GitHub/public repo) |
| `SETUP_README.md` | This file (detailed setup guide) |

**Firebase is used via REST API** (no Firebase SDK). All config is in the `FIREBASE_CONFIG` blocks in the 4 JS files.

---

## Troubleshooting

### "Firebase URL not configured"

**Solution:** Set `FIREBASE_CONFIG.databaseURL` in all 4 files (`popup.js`, `background.js`, `admin.js`, `god.js`) and reload the extension.

---

### "Cannot connect to Firebase"

**Check:**
1. Firebase URL is correct (no typos)
2. Database is created and running
3. Security rules are published (`database.rules.json`)
4. No firewall blocking Firebase domains
5. Internet connection is working

**Test:** Use GOD mode's "Test connection" button.

---

### "Who's on RPS now" Shows "No one"

**Check:**
1. You're logged into the extension (not just LinkedIn)
2. You're logged into the RPS LinkedIn account (not personal)
3. You're on a Recruiter page (URL contains `/talent/`)
4. Your RPS account email matches `/accounts/{accountId}/config.email` in Firebase
5. Background script is running (check `chrome://extensions` → your extension → "Service worker")

---

### Timeline is Empty

**Check:**
1. You've logged into the extension
2. You've been on RPS (Recruiter pages) while logged in
3. Sessions are being created (check Firebase `/accounts/{accountId}/sessions`)
4. Date filter in admin is set correctly

---

### Team Name Not Showing

**Check:**
1. In GOD mode, you've set `teamName` in `/accounts/{accountId}/config`
2. In Extension Admin, you've set the active Account ID to match
3. You've clicked "Set as active for tracking" in Admin
4. Reload the popup after making changes

---

### Users Appearing Twice in Team Availability

**Solution:** Click **"Reset this team's presence"** in Extension Admin. This clears stale `/extensionOnline` entries for your team.

---

### Same User Can Log In on Multiple Devices

**Expected behavior:** The extension should block this. If it doesn't:
1. Check both devices are using the same Firebase database
2. Reload the extension on both devices
3. Check that `loginAsUser` in `popup.js` includes the `/extensionOnline` check

---

### RPS Account Detected as "Personal account"

**Check:**
1. You're on a Recruiter page (`/talent/` in URL)
2. `/accounts/{accountId}/config.email` matches your RPS login email
3. `accountId` is set correctly in Extension Admin

**Fix:** The extension detects RPS by URL (`/talent/`) first, then falls back to email matching. If you're on `/talent/` and still see "Personal", check Firebase config.

---

## Next Steps

After setup:

1. **Share with your team:**
   - Give them the extension files (or GitHub repo)
   - They need to set the same Firebase URL in the 4 files
   - They log in with credentials you created in GOD mode

2. **Monitor usage:**
   - Use GOD mode to view all teams' activity
   - Use Extension Admin to view your team's sessions
   - Check "Who's on RPS now" to see current usage

3. **Customize:**
   - Adjust `WORK_DAY_START_HOUR` if your work day starts at a different time
   - Customize theme colors in `popup.html` and `admin.html`
   - Adjust timeline zoom levels if needed

---

**That's it! You're ready to track your shared LinkedIn RPS account usage.**
