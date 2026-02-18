# Firebase Troubleshooting Guide

## Issues Fixed

1. ✅ **Removed duplicate `showStatus` function** in `admin.js` (was causing conflicts)
2. ✅ **Added better error handling** for Firebase writes (now shows detailed error messages)
3. ✅ **Added console logging** to help debug Firebase connection issues

## Why Firebase Saves Might Fail

### 1. **Firebase URL Not Set Correctly**
Check that you've updated the Firebase URL in **THREE files**:
- `background.js` (line 3)
- `popup.js` (line 3)  
- `admin.js` (line 9)

The URL should look like:
```javascript
databaseURL: "https://your-project-id-default-rtdb.firebaseio.com"
```

**To get your Firebase URL:**
1. Go to Firebase Console → Your Project
2. Click **Build → Realtime Database**
3. Copy the URL shown at the top (e.g., `https://linkedin-rps-tracker-default-rtdb.firebaseio.com`)

### 2. **Firebase Security Rules Blocking Writes**
Your Firebase Realtime Database might have security rules that block writes.

**To fix:**
1. Go to Firebase Console → Realtime Database → **Rules** tab
2. Set rules to allow read/write (for internal use):
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
3. Click **Publish**

### 3. **Network/CORS Issues**
- Open browser DevTools (F12) → **Console** tab
- Try saving a user in Admin page
- Look for red error messages
- Common errors:
  - `Failed to fetch` → Network issue or Firebase URL wrong
  - `401 Unauthorized` → Security rules blocking
  - `404 Not Found` → Firebase URL incorrect

### 4. **Check Browser Console**
After clicking "Save User" in Admin:
- Open DevTools (F12) → **Console**
- You should see logs like:
  ```
  [Admin] Saving extension user to Firebase: https://...
  [Admin] Firebase response: {...}
  ```
- If you see errors, copy them and check the error message

## Understanding the Two Sections

### 1. **"Extension & Browser Identity"**
**Purpose:** Set a unique identifier for THIS browser/computer.

- **What it does:** Stores a `clientId` (e.g., "abc", "shahriyar-office-pc") locally in your browser
- **Where stored:** `chrome.storage.sync` (local, NOT Firebase)
- **Used for:** Every login/logout event sent to Firebase includes this `clientId` so you can see which machine/browser tracked the event
- **Example:** If you set `clientId = "office-pc-1"`, all events from this browser will show `"clientId": "office-pc-1"` in Firebase

### 2. **"LinkedIn RPS Account Configuration (Local)"**
**Purpose:** Configure which LinkedIn RPS account email to track.

- **What it does:** Stores a list of LinkedIn RPS account emails locally
- **Where stored:** `chrome.storage.sync` (local, NOT Firebase)
- **Used for:** When you log into LinkedIn, the extension checks if the detected email matches any account here. If it matches → tracking proceeds. If not → event ignored (personal account)
- **Important field:** The **"Shared Account ID"** (e.g., "linkedin-rps-main") is used as the key in Firebase under `/accounts/{accountId}`

**Example:**
- You add an account with:
  - Display Name: "Main RPS Account"
  - Shared Account ID: `linkedin-rps-main`
  - LinkedIn Email: `rps@company.com`
- When you log into LinkedIn with `rps@company.com`, the extension:
  1. Detects the email matches your configured account
  2. Writes events to Firebase under `/accounts/linkedin-rps-main/`

### 3. **"Extension Login Users (Firebase)"**
**Purpose:** Create accounts that can log into the extension (popup login).

- **What it does:** Stores extension user accounts (username, password, display name) in Firebase
- **Where stored:** Firebase Realtime Database under `/users`
- **Used for:** When someone opens the popup, they can log in with these credentials. Their name then appears in Firebase events as `currentExtensionUserName`

## Testing Steps

1. **Test Firebase Connection:**
   - Open Admin page
   - Open DevTools Console (F12)
   - Try to save a user
   - Check console for errors

2. **Test Firebase Write:**
   - Save a user in "Extension Login Users (Firebase)"
   - Go to Firebase Console → Realtime Database
   - Check if `/users` node appears with your user

3. **Test Live Tracking:**
   - Make sure you've:
     - Set `clientId` in "Extension & Browser Identity"
     - Added an RPS account and clicked "Use for Tracking"
     - Logged into the extension (popup login)
   - Log into LinkedIn with the RPS account
   - Check Firebase Console → `/accounts/{accountId}/events` for new events

## Common Error Messages

- **"Failed to save extension user to Firebase"**
  - Check Firebase URL is correct
  - Check Firebase security rules allow writes
  - Check browser console for detailed error

- **"Status not sent: no active account ID configured"**
  - Go to Admin → "LinkedIn RPS Account Configuration"
  - Add an account with a "Shared Account ID"
  - Click "✓ Use for Tracking"

- **"Failed to write status to Firebase"**
  - Check Firebase URL in `background.js`
  - Check Firebase security rules
  - Check browser console for detailed error
