import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

console.log('🔍 DIAGNOSING RAILWAY DEPLOYMENT ISSUES\n');

async function diagnoseIssues() {
  // 1. Check health endpoint
  console.log('1. Checking health endpoint...');
  try {
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health status:', healthData);
    
    // Check AI provider status
    if (healthData.providers) {
      console.log('\n2. AI Provider Status:');
      Object.entries(healthData.providers).forEach(([provider, status]) => {
        console.log(`   ${provider}:`, status);
      });
    }
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  // 2. Test with a real user (you mentioned you have users)
  console.log('\n3. Testing authenticated endpoints...');
  console.log('   Since Firebase client-side auth is used, you need to:');
  console.log('   a) Login at https://web-production-392cc.up.railway.app');
  console.log('   b) Open browser console and run:');
  console.log('      const user = firebase.auth().currentUser;');
  console.log('      const token = await user.getIdToken();');
  console.log('      console.log(token);');
  console.log('   c) Use that token to test API calls\n');

  // 3. Check specific issues
  console.log('4. Common Railway deployment issues:');
  console.log('   - Environment variables: Make sure NO quotes around values');
  console.log('   - Build logs: Check if "Missing environment variables" warning appears');
  console.log('   - Deployment: Ensure latest commit is deployed');
  
  // 4. Test unauthenticated endpoint
  console.log('\n5. Testing analysis results endpoint (should work without auth)...');
  try {
    const analysisResponse = await fetch(`${BASE_URL}/api/analysis-results`);
    console.log(`   Status: ${analysisResponse.status}`);
    if (analysisResponse.ok) {
      const data = await analysisResponse.json();
      console.log(`   Found ${data.length} analysis results`);
    }
  } catch (error) {
    console.log('❌ Analysis endpoint failed:', error.message);
  }

  // 5. Check for common configuration issues
  console.log('\n6. Configuration checklist:');
  console.log('   [ ] GROQ_API_KEY starts with "gsk_"');
  console.log('   [ ] PR_OPEN_API_KEY starts with "sk-"');
  console.log('   [ ] DATABASE_URL includes full connection string');
  console.log('   [ ] All VITE_FIREBASE_* variables are set');
  console.log('   [ ] No quotes around environment variable values');
  
  // 6. Test job creation flow
  console.log('\n7. To test job analysis:');
  console.log('   1. Login at the web UI');
  console.log('   2. Create a new job with this test data:');
  console.log('      Title: "Test Engineer"');
  console.log('      Description: "Need 5 years Python experience"');
  console.log('   3. Check browser network tab for API responses');
  console.log('   4. Look for /api/job-descriptions POST request');
  console.log('   5. Check if response has analyzedData field\n');

  // 7. Direct API test
  console.log('8. Testing if API is responding...');
  try {
    const response = await fetch(BASE_URL);
    console.log(`   Home page status: ${response.status}`);
    const html = await response.text();
    
    // Check if it's the React app
    if (html.includes('id="root"')) {
      console.log('   ✅ React app is loading');
    }
    
    // Check for Firebase config
    if (html.includes('firebase') || html.includes('VITE_FIREBASE')) {
      console.log('   ✅ Firebase references found');
    } else {
      console.log('   ⚠️  No Firebase references in HTML');
    }
  } catch (error) {
    console.log('❌ Failed to reach app:', error.message);
  }

  console.log('\n📋 NEXT STEPS:');
  console.log('1. Check Railway deployment logs for any errors');
  console.log('2. Verify all environment variables are set correctly');
  console.log('3. Test creating a job through the UI and check browser console');
  console.log('4. Share any error messages from Railway logs or browser console');
}

diagnoseIssues();