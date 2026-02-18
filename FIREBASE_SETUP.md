# Firebase Setup Guide

## Quick Setup (3 Steps)

### Step 1: Get Your Firebase Database URL

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click **Build → Realtime Database**
4. Click **Create Database** (if you haven't already)
5. Choose your region (e.g., `us-central1`)
6. Start in **Test mode** (for internal use)
7. Copy the database URL shown at the top (e.g., `https://your-project-id-default-rtdb.firebaseio.com`)

### Step 2: Update Firebase URL in Code

Update the Firebase URL in **3 files**:

1. **`background.js`** (line ~3)
2. **`popup.js`** (line ~3)
3. **`admin.js`** (line ~8)

In each file, find:
```javascript
const FIREBASE_CONFIG = {
  databaseURL: "https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com"
};
```

Replace `YOUR-PROJECT-ID` with your actual Firebase project ID, or replace the entire URL with your copied URL.

**Example:**
```javascript
const FIREBASE_CONFIG = {
  databaseURL: "https://my-linkedin-tracker-default-rtdb.firebaseio.com"
};
```

### Step 3: Set Firebase Security Rules (strict, recommended)

1. In Firebase Console → Realtime Database → **Rules** tab
2. Copy the contents of **`database.rules.json`** from this project (or paste the rules below).
3. Replace the existing rules and click **Publish**.

These rules **deny all access by default** and only allow read/write on the paths the extension uses. They also validate data shape so only expected structures can be written.

**Rules summary:**
- **`/users`** – read/write; each user must have `username` and `displayName` (strings).
- **`/accounts/{accountId}/currentUser`** – read/write; value must be `null` or an object with `userId`, `displayName`, `loggedInAt` (strings).
- **`/accounts/{accountId}/sessions`** – read/write; each session must have `loginAt` (string).
- **`/accounts/{accountId}/state`** and **`/accounts/{accountId}/events`** – read/write for LinkedIn status/events.

Any other path is denied. This keeps your database locked down even if the URL is known.

## Testing

1. **Reload the extension:**
   - Chrome: `chrome://extensions` → Reload button
   - Edge: `edge://extensions` → Reload button

2. **Test Firebase connection:**
   - Open extension popup → Click **⚙️ Admin**
   - Scroll to "Extension Login Users (Firebase)" section
   - Click **🔍 Test Firebase Connection**
   - Should show: ✅ Connection successful!

3. **Create a test user:**
   - In Admin page → "Extension Login Users (Firebase)"
   - Fill in: Username, Display Name, Password
   - Click **💾 Save User**
   - User should appear in the list below

## Troubleshooting

### "Firebase URL not configured"
- Make sure you updated `FIREBASE_CONFIG.databaseURL` in all 3 files
- Check that the URL doesn't contain "YOUR-PROJECT-ID"

### "Cannot connect to Firebase"
- Check your internet connection
- Verify Firebase URL is correct
- Check Firebase security rules allow read/write
- Open browser console (F12) for detailed error messages

### "Failed to load users"
- Make sure Firebase Realtime Database is enabled (not Firestore)
- Check security rules allow reads
- Try the test connection button first

## What Gets Stored in Firebase

All data is in **Realtime Database** (not Firestore). Structure:

| Path | Purpose |
|------|--------|
| **`/users`** | Extension login users (username, password, display name). Admin creates/edits here. |
| **`/accounts/default/currentUser`** | **Single thread – one active user at a time.** Who is on LinkedIn/RPS right now (or `null`). Always PUT (overwrite): when someone else logs in after the current user, the new person overwrites this. Cleared to `null` when that browser logs out (session conflict or cookie removed). |
| **`/accounts/default/sessions`** | One record per extension login session (`loginAt`, optional `logoutAt`, `userId`, `displayName`, `clientId`). Used for the timeline. Fetched with `limitToLast` so only recent sessions are read. |
| **`/accounts/{accountId}/state`** | Last LinkedIn login state for that RPS account (when an account ID is set in Admin). |
| **`/accounts/{accountId}/events`** | Log of LinkedIn login/logout events for that account. |
| **`/extensionOnline/{userId}`** | Team availability (Teams-style): one entry per extension user who is logged into the extension. Each has `displayName`, `clientId`, `lastSeenAt`. Updated every ~45s while logged in; removed on logout. Used by the popup "Team availability" list. |

**Optimizations:** The extension polls only **currentUser** every 10 seconds for “who’s using now,” and fetches **sessions** with a limit (e.g. last 500) when building the timeline, so reads stay small and current user stays fresh.
