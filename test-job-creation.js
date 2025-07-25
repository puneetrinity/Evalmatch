import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function testJobCreation() {
  console.log('🧪 Testing Job Creation Flow...\n');
  
  console.log('❌ Cannot test job creation without Firebase auth token');
  console.log('');
  console.log('To test job creation:');
  console.log('1. Login at https://web-production-392cc.up.railway.app');
  console.log('2. Open browser console and run:');
  console.log('   const user = firebase.auth().currentUser;');
  console.log('   const token = await user.getIdToken();');
  console.log('   console.log("Token:", token);');
  console.log('3. Copy the token and use it below');
  console.log('');
  
  // We can check if there are any jobs at all
  console.log('🔍 Checking if any jobs exist...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/job-descriptions`);
    console.log(`Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('✅ Endpoint working, needs authentication');
    } else if (response.status === 404) {
      console.log('❌ Endpoint not found');
    }
    
    // Test the database directly by checking analysis results
    const analysisResponse = await fetch(`${BASE_URL}/api/analysis-results`);
    if (analysisResponse.ok) {
      const results = await analysisResponse.json();
      console.log(`Found ${results.length} analysis results in database`);
    }
    
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n💡 Likely Issues:');
  console.log('1. Job creation succeeds but analysis fails');
  console.log('2. Job is created but not properly saved to database');
  console.log('3. Database schema issue preventing job retrieval');
  console.log('4. Job created with wrong user ID');
  
  console.log('\n🔧 Debug Steps:');
  console.log('1. Create a job through the UI');
  console.log('2. Check browser Network tab for the POST response');
  console.log('3. Look for any error messages in the POST response');
  console.log('4. Check Railway logs during job creation');
}

testJobCreation();