# Quick Fix for Firebase Connection Issues

## Your Current Firebase URL
```
https://linkedin-rps-tracker-default-rtdb.asia-southeast1.firebasedatabase.app/
```

## Step-by-Step Fix

### 1. Verify Database Exists
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `linkedin-rps-tracker`
3. Click **Build → Realtime Database**
4. **IMPORTANT:** Make sure you see "Realtime Database" (NOT Firestore)
5. If you see "Create Database" button, click it and create the database

### 2. Check Security Rules
1. In Firebase Console → Realtime Database → **Rules** tab
2. Make sure rules are set to:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
3. Click **Publish**

### 3. Verify URL Format
Your URL should be exactly:
```
https://linkedin-rps-tracker-default-rtdb.asia-southeast1.firebasedatabase.app
```
(No trailing slash, no .json)

### 4. Test Direct Access
Open this URL in your browser:
```
https://linkedin-rps-tracker-default-rtdb.asia-southeast1.firebasedatabase.app/.json
```

**Expected results:**
- ✅ `null` or `{}` = Database exists and is accessible
- ❌ Error page = Database doesn't exist or URL is wrong
- ❌ Permission denied = Security rules blocking access

### 5. Reload Extension
1. Go to `chrome://extensions` or `edge://extensions`
2. Find "LinkedIn RPS Login Tracker"
3. Click **Reload** button
4. Open Admin page → Test connection again

## Common Issues

### "Network error"
- **Cause:** Database doesn't exist or security rules blocking
- **Fix:** Create database and set security rules (see steps 1-2)

### "Permission denied" or "401"
- **Cause:** Security rules blocking access
- **Fix:** Update security rules (see step 2)

### "404 Not Found"
- **Cause:** Database doesn't exist or wrong URL
- **Fix:** Create database in Firebase Console

### URL shows "Not configured"
- **Cause:** Code not detecting your URL
- **Fix:** Make sure URL in code matches exactly (no extra spaces, correct format)

## Still Not Working?

1. **Open browser console (F12)** → Check for detailed error messages
2. **Check Firebase Console** → Realtime Database → Data tab → Should be empty but accessible
3. **Try creating a test entry manually** in Firebase Console to verify database works
