import fetch from 'node-fetch';

// This script is for development debugging only
if (process.env.NODE_ENV === 'production') {
  console.error('❌ This debug script should not be run in production!');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || 'https://web-production-392cc.up.railway.app';

async function debugAuthFlow() {
  console.log('🔍 DEBUGGING AUTHENTICATION FLOW (Development Only)\n');
  console.log(`🌍 Testing against: ${BASE_URL}\n`);
  
  // 1. Check if the app uses Firebase client-side auth or server-side auth
  console.log('1. Checking authentication setup...');
  
  try {
    // Test registration endpoint
    const testEmail = `test${Date.now()}@example.com`;
    console.log(`\n📧 Testing with email: ${testEmail}`);
    
    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'testpass123',
        displayName: 'Test User'
      })
    });
    
    console.log(`\nRegistration response status: ${registerResponse.status}`);
    const registerText = await registerResponse.text();
    console.log('Registration response:', registerText);
    
    // Try to parse as JSON
    try {
      const registerData = JSON.parse(registerText);
      console.log('Parsed registration data:', JSON.stringify(registerData, null, 2));
    } catch (e) {
      console.log('Response is not JSON');
    }
    
    // Test login endpoint
    console.log('\n2. Testing login endpoint...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'testpass123'
      })
    });
    
    console.log(`Login response status: ${loginResponse.status}`);
    const loginText = await loginResponse.text();
    console.log('Login response:', loginText);
    
    // Check response headers
    console.log('\nResponse headers:');
    loginResponse.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // 3. Check if it's using Firebase client-side auth
    console.log('\n3. Checking for Firebase client-side auth...');
    const homeResponse = await fetch(BASE_URL);
    const homeHtml = await homeResponse.text();
    
    // Look for Firebase configuration
    const hasFirebaseConfig = homeHtml.includes('firebaseConfig') || 
                            homeHtml.includes('firebase/app') ||
                            homeHtml.includes('initializeApp');
    
    console.log(`Firebase client-side auth detected: ${hasFirebaseConfig}`);
    
    // Look for auth-related UI elements
    const hasGoogleButton = homeHtml.includes('Continue with Google') ||
                          homeHtml.includes('Sign in with Google') ||
                          homeHtml.includes('google');
    
    console.log(`Google OAuth button detected: ${hasGoogleButton}`);
    
    // 4. Test API endpoints without auth
    console.log('\n4. Testing API endpoints without authentication...');
    const endpoints = [
      '/api/resumes',
      '/api/job-descriptions',
      '/api/analysis-results',
      '/api/health'
    ];
    
    for (const endpoint of endpoints) {
      const response = await fetch(`${BASE_URL}${endpoint}`);
      console.log(`  ${endpoint}: ${response.status} ${response.statusText}`);
    }
    
    // 5. Check for session-based auth
    console.log('\n5. Checking for session-based authentication...');
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
      credentials: 'include'
    });
    console.log(`Session endpoint: ${sessionResponse.status}`);
    
    // 6. Summary
    console.log('\n📊 AUTHENTICATION FLOW SUMMARY:');
    console.log('='.repeat(50));
    
    if (registerResponse.status === 404 && loginResponse.status === 404) {
      console.log('❌ Server-side auth endpoints not found');
      console.log('→ App likely uses Firebase client-side authentication only');
      console.log('→ API calls need Firebase ID tokens in Authorization header');
      console.log('→ Login through the web UI, not API endpoints');
    } else if (registerResponse.status >= 200 && registerResponse.status < 300) {
      console.log('✅ Server-side auth endpoints exist');
      console.log('→ But response format may not include auth tokens');
      console.log('→ Check if using session cookies or JWT tokens');
    }
    
    console.log('\n💡 NEXT STEPS:');
    console.log('1. If using Firebase client-side auth:');
    console.log('   - Login through the web UI');
    console.log('   - Get Firebase ID token from browser console');
    console.log('   - Use token in Authorization: Bearer <token> header');
    console.log('2. Check Railway logs for any server errors');
    console.log('3. Verify Firebase environment variables are set correctly');
    
  } catch (error) {
    console.error('\n❌ Error during auth flow debug:', error.message);
    console.error('\n🔧 Troubleshooting Tips:');
    console.error('1. Check if the server is running');
    console.error('2. Verify the BASE_URL is correct');
    console.error('3. Check network connectivity');
    console.error('4. Review server logs for errors');
  }
}

// Warn about sensitive operations
console.warn('⚠️  WARNING: This script performs test operations that may affect your database.');
console.warn('⚠️  Only run this in development environments!');
console.warn('⚠️  Press Ctrl+C to cancel within 3 seconds if this is not intended.\n');

// Give user a chance to cancel
setTimeout(() => {
  debugAuthFlow();
}, 3000);