# 🐳 Testing Firebase Auth Locally with Docker

## Quick Start

1. **Copy environment template:**
   ```bash
   cp .env.docker .env
   ```

2. **Get your Firebase service account key:**
   - Go to [Firebase Console](https://console.firebase.google.com/project/ealmatch-railway/settings/serviceaccounts/adminsdk)
   - Click "Generate new private key"
   - Copy the entire JSON

3. **Edit `.env` file:**
   - Replace `FIREBASE_SERVICE_ACCOUNT_KEY` with your actual service account JSON
   - Add your `GROQ_API_KEY`
   - Verify all `VITE_FIREBASE_*` variables match your Firebase project

4. **Run the test script:**
   ```bash
   ./docker-test.sh
   ```

5. **Access the app:**
   - Open http://localhost:3000
   - Open browser DevTools (F12) → Console
   - Try to login and watch for errors

## Debugging Firebase Auth Issues

### Check Console Logs
When you click "Continue with Google", watch for:
- `[LOGIN] Starting Google login...`
- `Firebase config check:` - Shows if config is loaded
- `Current window origin:` - Should be http://localhost:3000
- Any error messages

### Common Issues

**1. "elamatch.firebase.app 404 error"**
- There's a typo in Firebase/Google Console configuration
- Check OAuth redirect URIs in Google Cloud Console

**2. "auth/unauthorized-domain"**
- Add `localhost` to Firebase authorized domains
- Already added by default, but double-check

**3. Hanging on redirect check**
- The timeout fix should prevent this
- Check console for "Redirect result timeout"

### Testing Different Scenarios

**Test Email/Password:**
```javascript
// In browser console:
// 1. Register new user
// 2. Try to login
// 3. Check for errors
```

**Test Google OAuth:**
```javascript
// Should redirect to Google
// Check Network tab for redirect URL
// Look for typos in domain
```

### Environment Variable Check
```bash
# Verify environment variables are loaded
docker-compose exec app env | grep FIREBASE
```

### View Logs
```bash
# Production logs
docker-compose logs -f app

# Development logs (if using dev mode)
docker-compose -f docker-compose.dev.yml logs -f dev
```

## Benefits of Local Docker Testing

1. **Isolated environment** - No conflicts with system packages
2. **Same as production** - Matches Railway deployment
3. **Easy debugging** - Full access to logs and console
4. **Quick iteration** - Test fixes immediately
5. **Network inspection** - See exact API calls

## Next Steps

After identifying the issue locally:
1. Fix the configuration
2. Test locally until working
3. Push changes to Railway
4. Verify on production

The local Docker environment will help us identify the exact Firebase authentication issue!