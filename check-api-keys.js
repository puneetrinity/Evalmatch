import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function checkApiKeys() {
  console.log('🔍 Checking API Keys Configuration on Railway...\n');
  
  try {
    // Check health endpoint for AI provider status
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('Health endpoint response:');
      console.log(JSON.stringify(healthData, null, 2));
      
      // Check AI providers specifically
      if (healthData.providers) {
        console.log('\n🤖 AI Provider Status:');
        Object.entries(healthData.providers).forEach(([provider, status]) => {
          console.log(`${provider}:`, status);
        });
      }
      
      // Check overall AI service status
      if (healthData.status) {
        console.log(`\n📊 Overall AI Status: ${healthData.status}`);
      }
    } else {
      console.log(`❌ Health endpoint failed: ${healthResponse.status}`);
    }
    
    // Test a simple endpoint to see server logs
    console.log('\n📋 Testing other endpoints...');
    
    // Check if job descriptions endpoint exists
    const jobsResponse = await fetch(`${BASE_URL}/api/job-descriptions`);
    console.log(`Job descriptions endpoint: ${jobsResponse.status}`);
    
    if (jobsResponse.status === 401) {
      console.log('✅ Endpoint exists but requires authentication (expected)');
    } else if (jobsResponse.status === 404) {
      console.log('❌ Endpoint not found - routing issue');
    }
    
  } catch (error) {
    console.log('❌ Error checking API keys:', error.message);
  }
}

checkApiKeys();