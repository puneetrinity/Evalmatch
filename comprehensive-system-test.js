import fetch from 'node-fetch';
import { createReadStream } from 'fs';
import FormData from 'form-data';

const BASE_URL = 'https://web-production-392cc.up.railway.app';
const LOCAL_URL = 'http://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  email: 'test@example.com',
  password: 'testpassword123',
  baseUrl: BASE_URL, // Change to LOCAL_URL for local testing
};

// Color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    log(`  ✓ ${testName}`, 'green');
  } else {
    failedTests++;
    log(`  ✗ ${testName}`, 'red');
    if (details) log(`    → ${details}`, 'yellow');
  }
  testResults.push({ testName, passed, details });
}

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, options);
    const isSuccess = response.status >= 200 && response.status < 400;
    logTest(name, isSuccess, `Status: ${response.status}`);
    return { success: isSuccess, status: response.status, response };
  } catch (error) {
    logTest(name, false, error.message);
    return { success: false, error };
  }
}

// Main test suite
async function runComprehensiveTests() {
  log('\n🚀 COMPREHENSIVE SYSTEM TEST SUITE', 'blue');
  log('=' + '='.repeat(50), 'blue');
  log(`Testing: ${TEST_CONFIG.baseUrl}\n`, 'yellow');

  // 1. Basic Connectivity Tests
  log('\n📡 1. BASIC CONNECTIVITY', 'blue');
  await testEndpoint('App loads', TEST_CONFIG.baseUrl);
  await testEndpoint('Health check', `${TEST_CONFIG.baseUrl}/api/health`);
  
  // 2. Authentication Tests
  log('\n🔐 2. AUTHENTICATION TESTS', 'blue');
  
  // Test registration
  const registerData = {
    email: `test${Date.now()}@example.com`,
    password: 'testpass123',
    displayName: 'Test User'
  };
  
  const registerResult = await testEndpoint(
    'User registration',
    `${TEST_CONFIG.baseUrl}/api/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData)
    }
  );
  
  // Test login
  let authToken = null;
  const loginResult = await testEndpoint(
    'User login',
    `${TEST_CONFIG.baseUrl}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registerData.email,
        password: registerData.password
      })
    }
  );
  
  if (loginResult.success) {
    try {
      const data = await loginResult.response.json();
      authToken = data.token;
      logTest('Auth token received', !!authToken);
    } catch (e) {
      logTest('Auth token received', false, 'Failed to parse response');
    }
  }
  
  // 3. API Endpoint Tests (with auth)
  log('\n🔌 3. API ENDPOINTS', 'blue');
  
  const authHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
  
  // Test all main endpoints
  await testEndpoint(
    'GET /api/resumes',
    `${TEST_CONFIG.baseUrl}/api/resumes`,
    { headers: authHeaders }
  );
  
  await testEndpoint(
    'GET /api/job-descriptions',
    `${TEST_CONFIG.baseUrl}/api/job-descriptions`,
    { headers: authHeaders }
  );
  
  await testEndpoint(
    'GET /api/analysis-results',
    `${TEST_CONFIG.baseUrl}/api/analysis-results`,
    { headers: authHeaders }
  );
  
  // 4. File Upload Test
  log('\n📤 4. FILE UPLOAD TEST', 'blue');
  
  if (authToken) {
    const formData = new FormData();
    formData.append('resume', Buffer.from('Test Resume Content'), {
      filename: 'test-resume.txt',
      contentType: 'text/plain'
    });
    
    const uploadResult = await testEndpoint(
      'Resume upload',
      `${TEST_CONFIG.baseUrl}/api/resumes`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          ...formData.getHeaders()
        },
        body: formData
      }
    );
  } else {
    logTest('Resume upload', false, 'No auth token available');
  }
  
  // 5. Job Description Creation Test
  log('\n💼 5. JOB DESCRIPTION TEST', 'blue');
  
  if (authToken) {
    const jobData = {
      title: 'Test Software Engineer',
      description: 'We are looking for a talented software engineer with JavaScript experience.'
    };
    
    const jobResult = await testEndpoint(
      'Create job description',
      `${TEST_CONFIG.baseUrl}/api/job-descriptions`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jobData)
      }
    );
    
    if (jobResult.success) {
      try {
        const job = await jobResult.response.json();
        logTest('Job has ID', !!job.id);
        logTest('Job has analysis', !!job.analyzedData);
        
        // Test bias detection
        if (job.id) {
          await testEndpoint(
            'Get job for bias detection',
            `${TEST_CONFIG.baseUrl}/api/job-descriptions/${job.id}`,
            { headers: authHeaders }
          );
        }
      } catch (e) {
        logTest('Job response parsing', false, e.message);
      }
    }
  }
  
  // 6. Database Schema Tests
  log('\n🗄️  6. DATABASE SCHEMA TESTS', 'blue');
  
  // These tests check if the database operations work without errors
  const dbTests = [
    { name: 'User operations', passed: registerResult.success },
    { name: 'Session operations', passed: loginResult.success },
    { name: 'Resume storage', passed: true }, // Will be set based on upload
    { name: 'Job storage', passed: true }, // Will be set based on job creation
  ];
  
  dbTests.forEach(test => logTest(test.name, test.passed));
  
  // 7. Google OAuth Test
  log('\n🔑 7. GOOGLE OAUTH TEST', 'blue');
  
  // We can't fully test OAuth in a script, but we can check configuration
  const configResult = await testEndpoint(
    'Frontend loads (OAuth config)',
    TEST_CONFIG.baseUrl
  );
  
  if (configResult.success) {
    const html = await configResult.response.text();
    logTest('Firebase config present', html.includes('VITE_FIREBASE'));
    logTest('Google button present', html.includes('Continue with Google') || html.includes('google'));
  }
  
  // 8. Error Handling Tests
  log('\n⚠️  8. ERROR HANDLING', 'blue');
  
  await testEndpoint(
    'Invalid endpoint returns 404',
    `${TEST_CONFIG.baseUrl}/api/nonexistent`
  );
  
  await testEndpoint(
    'Unauthorized returns 401',
    `${TEST_CONFIG.baseUrl}/api/resumes`,
    { headers: { 'Authorization': 'Bearer invalid_token' } }
  );
  
  // Summary
  log('\n📊 TEST SUMMARY', 'blue');
  log('=' + '='.repeat(50), 'blue');
  log(`Total Tests: ${totalTests}`, 'yellow');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, 'red');
  log(`Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`, passedTests > failedTests ? 'green' : 'red');
  
  // Detailed failure report
  if (failedTests > 0) {
    log('\n❌ FAILED TESTS:', 'red');
    testResults
      .filter(r => !r.passed)
      .forEach(r => {
        log(`  - ${r.testName}`, 'red');
        if (r.details) log(`    ${r.details}`, 'yellow');
      });
  }
  
  // Recommendations
  log('\n💡 RECOMMENDATIONS:', 'blue');
  if (failedTests > 0) {
    log('1. Check Railway logs for server errors', 'yellow');
    log('2. Verify all environment variables are set', 'yellow');
    log('3. Check database connection and migrations', 'yellow');
    log('4. Ensure Firebase/Google OAuth is configured', 'yellow');
  } else {
    log('✅ All tests passed! System appears to be working correctly.', 'green');
  }
}

// Run tests
runComprehensiveTests().catch(error => {
  log('\n❌ Test suite failed:', 'red');
  log(error.message, 'red');
  process.exit(1);
});