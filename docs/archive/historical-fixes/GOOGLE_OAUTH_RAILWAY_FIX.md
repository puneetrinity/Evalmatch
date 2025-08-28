# Fixing Google OAuth on Railway Deployment

## Common Issues and Solutions

### 1. OAuth Redirect URI Mismatch

**Problem**: Google OAuth requires exact redirect URI matching. Railway deployments use a different domain than localhost.

**Solution**:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Authentication → Sign-in method → Google
4. Add authorized domains:
   - `web-production-392cc.up.railway.app`
   - Your custom domain (if any)

5. Go to [Google Cloud Console](https://console.cloud.google.com)
6. Select your project (same as Firebase project)
7. Go to APIs & Services → Credentials
8. Click on your OAuth 2.0 Client ID
9. Add Authorized JavaScript origins:
   ```
   https://web-production-392cc.up.railway.app
   ```
10. Add Authorized redirect URIs:
    ```
    https://web-production-392cc.up.railway.app/__/auth/handler
    https://evalmatch-production.firebaseapp.com/__/auth/handler
    ```

### 2. Environment Variables Not Set

**Problem**: Firebase config variables missing on Railway.

**Solution**: Set these in Railway dashboard:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. CORS/CSP Issues

**Problem**: Content Security Policy or CORS blocking OAuth popup.

**Solution**: Already implemented in the code with helmet configuration disabled for CSP.

### 4. Auth Domain Mismatch

**Problem**: `VITE_FIREBASE_AUTH_DOMAIN` doesn't match Firebase's expected domain.

**Solution**: Ensure `VITE_FIREBASE_AUTH_DOMAIN` is set to `your-project-id.firebaseapp.com` (NOT your Railway domain).

## Testing Steps

1. **Check Console Logs**:
   - Open browser DevTools
   - Look for Firebase config logs
   - Check for any auth errors

2. **Verify Popup Behavior**:
   - Click "Continue with Google"
   - Popup should open with Google accounts
   - After selection, should redirect back to app

3. **Common Error Messages**:
   - `auth/operation-not-allowed`: Enable Google sign-in in Firebase Console
   - `auth/unauthorized-domain`: Add Railway domain to authorized domains
   - `redirect_uri_mismatch`: Fix OAuth redirect URIs in Google Cloud Console

## Quick Debugging Script

Add this to test Google OAuth:

```javascript
// Run in browser console
const testGoogleAuth = async () => {
  console.log('Testing Google OAuth...');
  console.log('Current origin:', window.location.origin);
  console.log('Firebase auth domain:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
  
  try {
    const { authService } = await import('./src/lib/firebase');
    await authService.signInWithGoogle();
  } catch (error) {
    console.error('Google OAuth test failed:', error);
  }
};
testGoogleAuth();
```

## Railway-Specific Configuration

1. **Build Command**: Ensure `npm run prebuild` runs before `npm run build`
2. **Environment Variables**: Set all VITE_ variables in Railway dashboard
3. **Deploy Logs**: Check for "Missing environment variables" warning during build

## If Still Not Working

1. **Verify Firebase Project**:
   - Ensure Google sign-in is enabled
   - Check if project is on Spark (free) or Blaze plan
   - Verify OAuth consent screen is configured

2. **Browser Issues**:
   - Try different browser
   - Disable popup blockers
   - Clear cookies/cache for the domain

3. **Alternative Approach**:
   If popup continues to fail, implement redirect flow:
   ```javascript
   // In firebase.ts, replace signInWithPopup with:
   await signInWithRedirect(auth, googleProvider);
   ```
   Then handle redirect on app load:
   ```javascript
   // In App component or auth context
   useEffect(() => {
     authService.handleGoogleRedirectResult();
   }, []);
   ```

## Verification Checklist

- [ ] Railway domain added to Firebase authorized domains
- [ ] OAuth redirect URIs updated in Google Cloud Console
- [ ] All VITE_FIREBASE_* variables set in Railway
- [ ] Google sign-in enabled in Firebase Console
- [ ] Build logs show "All Firebase environment variables are available"
- [ ] No CORS/CSP errors in browser console
- [ ] Popup opens when clicking "Continue with Google"