import fetch from 'node-fetch';

async function testRailwayAPI() {
  const baseUrl = 'https://evalmatch-production.up.railway.app';
  
  console.log('🚀 Testing Railway API endpoints...\n');

  // Test different endpoints
  const endpoints = [
    '/api/health',
    '/api/debug/status',
    '/api/debug/db-type',
    '/api/user/profile',
    '/api/resumes',
    '/api/job-descriptions'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Testing ${endpoint}...`);
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Test-Script'
        },
        timeout: 15000
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log(`   Response:`, JSON.stringify(data, null, 2));
        } else {
          const text = await response.text();
          console.log(`   Response: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
        }
      } else {
        const errorText = await response.text();
        console.log(`   Error: ${errorText.slice(0, 200)}${errorText.length > 200 ? '...' : ''}`);
      }
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    console.log('');
  }
}

testRailwayAPI().catch(console.error);