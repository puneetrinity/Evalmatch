// Check Google OAuth configuration for Railway deployment
const https = require('https');

console.log('Checking Google OAuth configuration for Railway deployment...\n');

// Railway domain
const railwayDomain = 'web-production-392cc.up.railway.app';

// Check 1: Verify environment variables are set on Railway
console.log('1. Environment Variables Check:');
console.log('   - Make sure these are set in Railway dashboard:');
console.log('     VITE_FIREBASE_API_KEY');
console.log('     VITE_FIREBASE_AUTH_DOMAIN (should be: ealmatch-railway.firebaseapp.com)');
console.log('     VITE_FIREBASE_PROJECT_ID (should be: ealmatch-railway)');
console.log('     VITE_FIREBASE_STORAGE_BUCKET');
console.log('     VITE_FIREBASE_MESSAGING_SENDER_ID');
console.log('     VITE_FIREBASE_APP_ID\n');

// Check 2: Firebase Console settings
console.log('2. Firebase Console Settings:');
console.log('   Go to: https://console.firebase.google.com/project/ealmatch-railway/authentication/providers');
console.log('   - Ensure Google sign-in is ENABLED');
console.log('   - Click on Google provider and check configuration\n');

// Check 3: Authorized domains
console.log('3. Authorized Domains:');
console.log('   Go to: https://console.firebase.google.com/project/ealmatch-railway/authentication/settings');
console.log('   - Add these domains to Authorized domains:');
console.log(`     • ${railwayDomain}`);
console.log('     • localhost (for local testing)');
console.log('     • ealmatch-railway.firebaseapp.com (default)\n');

// Check 4: Google Cloud Console OAuth settings
console.log('4. Google Cloud Console OAuth Configuration:');
console.log('   Go to: https://console.cloud.google.com/apis/credentials?project=ealmatch-railway');
console.log('   - Find your OAuth 2.0 Client ID (Web application)');
console.log('   - Add to Authorized JavaScript origins:');
console.log(`     • https://${railwayDomain}`);
console.log('     • http://localhost:5173 (for local dev)');
console.log('   - Add to Authorized redirect URIs:');
console.log(`     • https://${railwayDomain}/__/auth/handler`);
console.log('     • https://ealmatch-railway.firebaseapp.com/__/auth/handler\n');

// Check 5: OAuth consent screen
console.log('5. OAuth Consent Screen:');
console.log('   Go to: https://console.cloud.google.com/apis/credentials/consent?project=ealmatch-railway');
console.log('   - Ensure it\'s configured with:');
console.log('     • App name');
console.log('     • User support email');
console.log('     • Developer contact email');
console.log('     • Publishing status (can be Testing for now)\n');

// Check 6: Common issues
console.log('6. Common Issues and Fixes:');
console.log('   - "redirect_uri_mismatch": Update OAuth redirect URIs in Google Cloud Console');
console.log('   - "auth/operation-not-allowed": Enable Google sign-in in Firebase Console');
console.log('   - "auth/unauthorized-domain": Add Railway domain to Firebase authorized domains');
console.log('   - Popup closes immediately: Check for duplicate auth state listeners or loading conflicts\n');

// Check 7: Quick test
console.log('7. Quick Test:');
console.log('   1. Visit: https://' + railwayDomain);
console.log('   2. Open browser console (F12)');
console.log('   3. Check for any errors when clicking "Continue with Google"');
console.log('   4. Look for Firebase config in console logs\n');

console.log('If Google OAuth still fails after these checks:');
console.log('- Try clearing browser cache and cookies');
console.log('- Test in incognito/private browsing mode');
console.log('- Check Railway build logs for missing environment variables');
console.log('- Ensure Railway deployment completed successfully\n');