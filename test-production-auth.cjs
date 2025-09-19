/**
 * Production Dual Authentication Test
 * Tests actual API token authentication against production endpoints
 */

const axios = require('axios');

const BASE_URL = 'https://evalmatch.app/api/v1';
const API_TOKEN = 'em_ac0c99756992deba95a8de27e50fa2a7_4e633ceeaee77e843f73e0103fc3f35f3cecab93e15370397d120fb4ea9e1277';

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    console.log(`✓ ${name}: ${response.status} - ${response.data.success ? 'SUCCESS' : 'ERROR'}`);
    
    if (response.data.data) {
      console.log(`  Data keys: ${Object.keys(response.data.data).join(', ')}`);
    }
    
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    if (error.response) {
      console.log(`✗ ${name}: ${error.response.status} - ${error.response.data.error || 'Unknown error'}`);
      return { success: false, status: error.response.status, error: error.response.data };
    } else {
      console.log(`✗ ${name}: Network error - ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

async function runProductionTests() {
  console.log('🚀 Production Dual Authentication Tests\n');
  console.log(`Testing with API Token: ${API_TOKEN.substring(0, 20)}...`);
  console.log(`Base URL: ${BASE_URL}\n`);
  
  const results = [];
  
  // Test user profile
  results.push(await testEndpoint('User Profile', 'GET', '/profile'));
  
  // Test credits endpoints
  results.push(await testEndpoint('Credits Balance', 'GET', '/credits/balance'));
  results.push(await testEndpoint('Credits History', 'GET', '/credits/history'));
  results.push(await testEndpoint('Credits Packages', 'GET', '/credits/packages'));
  
  // Test resumes
  results.push(await testEndpoint('Resumes List', 'GET', '/resumes'));
  
  // Test token status
  results.push(await testEndpoint('Token Status', 'GET', '/tokens/status/by-token'));
  
  // Test analyze-text (may fail due to circuit breaker)
  results.push(await testEndpoint('Analyze Text', 'POST', '/analysis/analyze-text', {
    resumeText: 'Software Engineer with React experience',
    jobDescriptionText: 'Looking for React developer'
  }));
  
  // Test health (public endpoint)
  results.push(await testEndpoint('Health Check', 'GET', '/health'));
  
  console.log('\n🎯 Test Summary:');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`📊 Total: ${results.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Dual authentication is fully operational.');
  } else {
    console.log('\n⚠️  Some tests failed - check individual results above.');
  }
}

runProductionTests().catch(console.error);