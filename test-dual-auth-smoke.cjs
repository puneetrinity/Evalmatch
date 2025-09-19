#!/usr/bin/env node
/**
 * Dual Authentication Smoke Tests
 * Validates that all either-auth endpoints work with both Firebase JWT and API tokens
 */

const axios = require('axios');

// Configuration
const config = {
  baseUrl: process.env.API_BASE_URL || 'https://evalmatch.app/api/v1',
  firebaseToken: process.env.FIREBASE_TEST_TOKEN || '',
  apiToken: process.env.API_TEST_TOKEN || '',
  timeout: 10000
};

console.log('🧪 Starting Dual Authentication Smoke Tests...\n');

// Test endpoints and expected auth behavior
const testEndpoints = [
  // Either-auth endpoints (should work with both)
  { method: 'GET', path: '/resumes', name: 'List Resumes', eitherAuth: true },
  { method: 'GET', path: '/credits/balance', name: 'Credits Balance', eitherAuth: true },
  { method: 'GET', path: '/credits/history', name: 'Credits History', eitherAuth: true },
  { method: 'GET', path: '/credits/packages', name: 'Credits Packages', eitherAuth: true },
  
  // Token-only endpoints
  { method: 'GET', path: '/tokens/status/by-token', name: 'Token Status', tokenOnly: true },
  
  // Health endpoints (no auth required)
  { method: 'GET', path: '/health', name: 'Health Check', noAuth: true },
];

// Helper function to make requests with different auth methods
async function testRequest(endpoint, authType) {
  const headers = {};
  
  if (authType === 'firebase' && config.firebaseToken) {
    headers.Authorization = `Bearer ${config.firebaseToken}`;
  } else if (authType === 'token' && config.apiToken) {
    headers.Authorization = `Bearer ${config.apiToken}`;
  }
  
  try {
    const response = await axios({
      method: endpoint.method,
      url: `${config.baseUrl}${endpoint.path}`,
      headers,
      timeout: config.timeout,
      validateStatus: () => true // Don't throw on 4xx/5xx
    });
    
    return {
      status: response.status,
      success: response.status >= 200 && response.status < 300,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    return {
      status: 0,
      success: false,
      error: error.message,
      timeout: error.code === 'ECONNABORTED'
    };
  }
}

// Test authentication matrix
async function runSmokeTests() {
  const results = {
    passed: 0,
    failed: 0,
    details: []
  };
  
  console.log('Auth Configuration:');
  console.log(`- Firebase Token: ${config.firebaseToken ? '✓ Provided' : '✗ Missing'}`);
  console.log(`- API Token: ${config.apiToken ? '✓ Provided' : '✗ Missing'}`);
  console.log(`- Base URL: ${config.baseUrl}\n`);
  
  for (const endpoint of testEndpoints) {
    console.log(`Testing: ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
    
    // Test 1: No authentication (should fail for protected endpoints)
    if (!endpoint.noAuth) {
      const noAuthResult = await testRequest(endpoint, 'none');
      const expectUnauthorized = noAuthResult.status === 401;
      
      console.log(`  ❌ No Auth: ${noAuthResult.status} ${expectUnauthorized ? '✓' : '✗'}`);
      
      if (!expectUnauthorized) {
        results.failed++;
        results.details.push({
          endpoint: endpoint.name,
          test: 'No Auth',
          expected: '401',
          actual: noAuthResult.status,
          passed: false
        });
      } else {
        results.passed++;
      }
    }
    
    // Test 2: Firebase JWT (should work for either-auth endpoints)
    if (config.firebaseToken && (endpoint.eitherAuth || endpoint.firebaseOnly)) {
      const fbResult = await testRequest(endpoint, 'firebase');
      const expectSuccess = fbResult.success;
      
      console.log(`  🔥 Firebase: ${fbResult.status} ${expectSuccess ? '✓' : '✗'}`);
      
      if (expectSuccess) {
        results.passed++;
        // Check for envelope pattern
        if (fbResult.data && typeof fbResult.data === 'object' && 'success' in fbResult.data) {
          console.log(`     📦 Envelope: ✓ (success: ${fbResult.data.success})`);
        }
      } else {
        results.failed++;
        results.details.push({
          endpoint: endpoint.name,
          test: 'Firebase Auth',
          expected: '2xx',
          actual: fbResult.status,
          passed: false,
          error: fbResult.error
        });
      }
    }
    
    // Test 3: API Token (should work for either-auth and token-only endpoints)
    if (config.apiToken && (endpoint.eitherAuth || endpoint.tokenOnly)) {
      const tokenResult = await testRequest(endpoint, 'token');
      const expectSuccess = tokenResult.success;
      
      console.log(`  🔑 API Token: ${tokenResult.status} ${expectSuccess ? '✓' : '✗'}`);
      
      if (expectSuccess) {
        results.passed++;
        // Check for envelope pattern
        if (tokenResult.data && typeof tokenResult.data === 'object' && 'success' in tokenResult.data) {
          console.log(`     📦 Envelope: ✓ (success: ${tokenResult.data.success})`);
        }
        // Check for token-specific data
        if (endpoint.tokenOnly && tokenResult.data && tokenResult.data.data) {
          console.log(`     🎯 Token Data: ✓ (${Object.keys(tokenResult.data.data).join(', ')})`);
        }
      } else {
        results.failed++;
        results.details.push({
          endpoint: endpoint.name,
          test: 'API Token Auth',
          expected: '2xx',
          actual: tokenResult.status,
          passed: false,
          error: tokenResult.error
        });
      }
    }
    
    // Test 4: No auth for public endpoints
    if (endpoint.noAuth) {
      const publicResult = await testRequest(endpoint, 'none');
      const expectSuccess = publicResult.success;
      
      console.log(`  🌐 Public: ${publicResult.status} ${expectSuccess ? '✓' : '✗'}`);
      
      if (expectSuccess) {
        results.passed++;
      } else {
        results.failed++;
        results.details.push({
          endpoint: endpoint.name,
          test: 'Public Access',
          expected: '2xx',
          actual: publicResult.status,
          passed: false
        });
      }
    }
    
    console.log('');
  }
  
  return results;
}

// Run tests and report results
async function main() {
  try {
    const results = await runSmokeTests();
    
    console.log('🎯 Smoke Test Results:');
    console.log(`✓ Passed: ${results.passed}`);
    console.log(`✗ Failed: ${results.failed}`);
    console.log(`📊 Total: ${results.passed + results.failed}\n`);
    
    if (results.failed > 0) {
      console.log('❌ Failed Tests:');
      results.details.forEach(detail => {
        if (!detail.passed) {
          console.log(`  - ${detail.endpoint} (${detail.test}): Expected ${detail.expected}, got ${detail.actual}`);
          if (detail.error) {
            console.log(`    Error: ${detail.error}`);
          }
        }
      });
      process.exit(1);
    } else {
      console.log('🎉 All smoke tests passed! Dual authentication is working correctly.');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('💥 Smoke test failed with error:', error.message);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  main();
}

module.exports = { runSmokeTests, testRequest };