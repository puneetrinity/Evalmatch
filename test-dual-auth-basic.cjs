#!/usr/bin/env node
/**
 * Basic Dual Authentication Test
 * Tests that endpoints reject unauthorized requests and have proper either-auth middleware
 */

// Using native fetch instead of axios

const config = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
  timeout: 5000
};

console.log('🔍 Basic Dual Auth Validation...\n');

const endpoints = [
  { method: 'GET', path: '/resumes', name: 'Resumes List' },
  { method: 'GET', path: '/credits/balance', name: 'Credits Balance' },
  { method: 'GET', path: '/health', name: 'Health Check', public: true },
];

async function testUnauthorizedAccess() {
  console.log(`Testing unauthorized access to: ${config.baseUrl}\n`);
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      const response = await fetch(`${config.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const expectedStatus = endpoint.public ? 200 : 401;
      const success = response.status === expectedStatus;
      const icon = success ? '✓' : '✗';
      
      console.log(`${icon} ${endpoint.name}: ${response.status} (expected ${expectedStatus})`);
      
      if (!success) {
        try {
          const data = await response.json();
          console.log(`  Response: ${JSON.stringify(data, null, 2)}`);
        } catch (e) {
          console.log(`  Response: ${await response.text()}`);
        }
      }
      
      // Check for either-auth behavior indicators
      if (response.status === 401) {
        try {
          const data = await response.json();
          const hasAuthMessage = data.message && 
            (data.message.includes('Firebase') || 
             data.message.includes('API token') ||
             data.message.includes('Authorization') ||
             data.message.includes('AUTHENTICATION_REQUIRED'));
          
          if (hasAuthMessage) {
            console.log(`  📝 Auth guidance: ✓`);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`✗ ${endpoint.name}: Timeout`);
      } else {
        console.log(`✗ ${endpoint.name}: Error - ${error.message}`);
      }
    }
  }
}

async function main() {
  try {
    await testUnauthorizedAccess();
    console.log('\n🎯 Basic validation complete!');
    console.log('Next: Run with valid tokens to test actual dual-auth functionality.');
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testUnauthorizedAccess };