import fetch from 'node-fetch';

const BASE_URL = 'https://evalmatch-production.up.railway.app';

async function testRoutes() {
  const routes = [
    '/',
    '/api',
    '/api/health',
    '/api/debug/db-type',
    '/api/debug/health',
    '/api/user/profile'
  ];

  console.log('🧪 Testing Railway routes...\n');

  for (const route of routes) {
    try {
      const response = await fetch(`${BASE_URL}${route}`, {
        method: 'GET',
        timeout: 10000
      });
      
      console.log(`✅ ${route}: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const text = await response.text();
        if (text.length < 200) {
          console.log(`   Response: ${text.slice(0, 100)}...`);
        } else {
          console.log(`   Response: ${text.slice(0, 100)}... (${text.length} chars)`);
        }
      }
    } catch (error) {
      console.log(`❌ ${route}: ${error.code} - ${error.message}`);
    }
    console.log('');
  }
}

testRoutes().catch(console.error);