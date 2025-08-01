# Railway Environment Variable Fixes

## Critical Issues Fixed

### 1. Firebase Storage Bucket Format

**❌ INCORRECT FORMAT:**
```
VITE_FIREBASE_STORAGE_BUCKET=your-project-id
```

**✅ CORRECT FORMAT:**
```
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

### 2. SESSION_SECRET Configuration

**❌ MISSING:**
```
SESSION_SECRET is not set
```

**✅ REQUIRED:**
```
SESSION_SECRET=your-very-secure-random-string-32-chars-minimum
```

## How to Fix in Railway

### Step 1: Fix Firebase Storage Bucket
1. Go to your Railway project dashboard
2. Navigate to Variables tab
3. Find `VITE_FIREBASE_STORAGE_BUCKET`
4. Update the value to include `.appspot.com` suffix
   - Example: `evalmatch-railway.appspot.com`

### Step 2: Add SESSION_SECRET
1. In Railway Variables tab, click "Add Variable"
2. Name: `SESSION_SECRET`
3. Value: Generate a secure random string (32+ characters)
   - You can use: `openssl rand -base64 32`
   - Or online generator: https://generate-secret.vercel.app/32

### Step 3: Example Correct Configuration
```env
# Firebase Storage Bucket (MUST include .appspot.com)
VITE_FIREBASE_STORAGE_BUCKET=evalmatch-railway.appspot.com

# Session Secret (32+ characters)
SESSION_SECRET=AbCdEf123456789SecureRandomString32Plus

# Other Firebase vars should remain unchanged
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=evalmatch-railway.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=evalmatch-railway
```

## Verification

After updating these variables:
1. Redeploy your Railway service
2. Check logs for these confirmations:
   - ✅ "Firebase Admin SDK initialized successfully"
   - ✅ "Environment validation completed successfully" 
   - ❌ No more "Invalid format for VITE_FIREBASE_STORAGE_BUCKET" errors
   - ❌ No more "Required environment variable missing: SESSION_SECRET" errors

## Quick Generate SESSION_SECRET

Run this command to generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```