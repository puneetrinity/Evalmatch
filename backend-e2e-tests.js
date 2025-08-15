import fetch from 'node-fetch';
import { createReadStream, writeFileSync } from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  baseUrl: BASE_URL,
  timeout: 30000,
};

// Color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
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

async function testEndpoint(name, url, options = {}, expectedStatus = null) {
  try {
    const response = await fetch(url, {
      ...options,
      timeout: TEST_CONFIG.timeout
    });
    
    const isSuccess = expectedStatus ? 
      response.status === expectedStatus : 
      response.status >= 200 && response.status < 400;
      
    logTest(name, isSuccess, `Status: ${response.status}`);
    return { success: isSuccess, status: response.status, response };
  } catch (error) {
    logTest(name, false, error.message);
    return { success: false, error };
  }
}

async function testEndpointWithBody(name, url, options = {}) {
  try {
    const result = await testEndpoint(name, url, options);
    if (result.success) {
      const contentType = result.response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const body = await result.response.json();
        return { ...result, body };
      }
    }
    return result;
  } catch (error) {
    logTest(`${name} (parse body)`, false, error.message);
    return { success: false, error };
  }
}

// Create test file
function createTestFile(filename, content) {
  try {
    writeFileSync(filename, content);
    return true;
  } catch (error) {
    return false;
  }
}

// Main test suite
async function runBackendE2ETests() {
  log('\n🚀 COMPREHENSIVE BACKEND E2E TEST SUITE', 'blue');
  log('=' + '='.repeat(60), 'blue');
  log(`Testing: ${TEST_CONFIG.baseUrl}\n`, 'yellow');

  // 1. Health and System Routes
  log('\n💓 1. HEALTH & SYSTEM ROUTES', 'blue');
  
  await testEndpoint('Health check', `${BASE_URL}/api/health`);
  await testEndpoint('Health check (v1)', `${BASE_URL}/api/v1/health`);
  await testEndpoint('Routes info', `${BASE_URL}/api/routes-info`);
  await testEndpoint('Version info', `${BASE_URL}/api/version`);
  await testEndpoint('Version info (v1)', `${BASE_URL}/api/v1/version`);

  // 2. Monitoring Routes
  log('\n📊 2. MONITORING ROUTES', 'blue');
  
  await testEndpoint('Monitoring health', `${BASE_URL}/api/monitoring/health`);
  await testEndpoint('Monitoring metrics', `${BASE_URL}/api/monitoring/metrics`);
  await testEndpoint('Monitoring embeddings', `${BASE_URL}/api/monitoring/embeddings`);
  await testEndpoint('Monitoring system', `${BASE_URL}/api/monitoring/system`);

  // 3. User Authentication Routes
  log('\n🔐 3. USER AUTHENTICATION', 'blue');
  
  // Test user registration with test mode bypass
  const testUser = {
    email: `test${Date.now()}@example.com`,
    password: 'testpass123',
    displayName: 'Test User'
  };

  const registerResult = await testEndpointWithBody(
    'User registration',
    `${BASE_URL}/api/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    }
  );

  // Test user login
  let authToken = null;
  const loginResult = await testEndpointWithBody(
    'User login',
    `${BASE_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    }
  );

  if (loginResult.success && loginResult.body) {
    authToken = loginResult.body.token || loginResult.body.sessionToken;
    logTest('Auth token received', !!authToken);
  }

  // Test protected routes without auth
  await testEndpoint('Protected route without auth', `${BASE_URL}/api/user/profile`, {}, 401);

  // 4. Resume Routes
  log('\n📄 4. RESUME MANAGEMENT', 'blue');
  
  const authHeaders = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};

  // Test getting resumes
  await testEndpoint('GET resumes', `${BASE_URL}/api/resumes`, { headers: authHeaders });
  await testEndpoint('GET resumes (v1)', `${BASE_URL}/api/v1/resumes`, { headers: authHeaders });

  // Test resume upload
  if (authToken) {
    // Create a test resume file
    const testResumeContent = `
John Doe Resume
Software Engineer
Skills: JavaScript, TypeScript, React, Node.js
Experience: 5 years in web development
Education: BS Computer Science
    `;
    
    if (createTestFile('test-resume.txt', testResumeContent)) {
      const formData = new FormData();
      formData.append('resume', Buffer.from(testResumeContent), {
        filename: 'test-resume.txt',
        contentType: 'text/plain'
      });

      await testEndpoint(
        'Resume upload',
        `${BASE_URL}/api/resumes`,
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
      logTest('Resume upload', false, 'Could not create test file');
    }
  }

  // 5. Batch Management Routes
  log('\n📦 5. BATCH MANAGEMENT', 'blue');
  
  await testEndpoint('GET batches', `${BASE_URL}/api/batches`, { headers: authHeaders });
  await testEndpoint('GET batches (v1)', `${BASE_URL}/api/v1/batches`, { headers: authHeaders });

  // Create a test batch
  if (authToken) {
    const batchData = {
      name: `Test Batch ${Date.now()}`,
      description: 'Test batch for E2E testing'
    };

    const createBatchResult = await testEndpointWithBody(
      'Create batch',
      `${BASE_URL}/api/batches`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batchData)
      }
    );

    if (createBatchResult.success && createBatchResult.body) {
      const batchId = createBatchResult.body.id;
      await testEndpoint(
        'GET specific batch',
        `${BASE_URL}/api/batches/${batchId}`,
        { headers: authHeaders }
      );
    }
  }

  // 6. Job Description Routes
  log('\n💼 6. JOB DESCRIPTIONS', 'blue');

  await testEndpoint('GET job descriptions', `${BASE_URL}/api/job-descriptions`, { headers: authHeaders });
  await testEndpoint('GET job descriptions (v1)', `${BASE_URL}/api/v1/job-descriptions`, { headers: authHeaders });

  // Create a test job description
  if (authToken) {
    const jobData = {
      title: `Test Software Engineer ${Date.now()}`,
      description: 'We are looking for a skilled software engineer with experience in JavaScript, React, and Node.js. The candidate should have strong problem-solving skills and experience with agile development.',
      requirements: ['JavaScript', 'React', 'Node.js', '3+ years experience'],
      department: 'Engineering',
      location: 'Remote'
    };

    const createJobResult = await testEndpointWithBody(
      'Create job description',
      `${BASE_URL}/api/job-descriptions`,
      {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jobData)
      }
    );

    if (createJobResult.success && createJobResult.body) {
      const jobId = createJobResult.body.id;
      logTest('Job has ID', !!jobId);
      logTest('Job has analysis', !!createJobResult.body.analyzedData);

      // Test getting specific job
      await testEndpoint(
        'GET specific job',
        `${BASE_URL}/api/job-descriptions/${jobId}`,
        { headers: authHeaders }
      );

      // Test updating job
      await testEndpoint(
        'UPDATE job description',
        `${BASE_URL}/api/job-descriptions/${jobId}`,
        {
          method: 'PUT',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...jobData,
            title: 'Updated ' + jobData.title
          })
        }
      );
    }
  }

  // 7. Analysis Routes
  log('\n🔍 7. ANALYSIS & MATCHING', 'blue');

  await testEndpoint('GET analysis results', `${BASE_URL}/api/analysis`, { headers: authHeaders });
  await testEndpoint('GET analysis results (v1)', `${BASE_URL}/api/v1/analysis`, { headers: authHeaders });

  // Test analysis endpoints
  if (authToken) {
    await testEndpoint(
      'Analysis status',
      `${BASE_URL}/api/analysis/status`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'Analysis statistics',
      `${BASE_URL}/api/analysis/stats`,
      { headers: authHeaders }
    );
  }

  // 8. Debug Routes
  log('\n🔧 8. DEBUG & SYSTEM STATUS', 'blue');

  await testEndpoint('Debug info', `${BASE_URL}/api/debug`, { headers: authHeaders });
  await testEndpoint('Debug info (v1)', `${BASE_URL}/api/v1/debug`, { headers: authHeaders });
  await testEndpoint('DB check', `${BASE_URL}/api/debug/db-check`);
  await testEndpoint('System info', `${BASE_URL}/api/debug/system`);

  // 9. Admin Routes (if available)
  log('\n👑 9. ADMIN ROUTES', 'blue');

  await testEndpoint('Admin status', `${BASE_URL}/api/admin/status`, { headers: authHeaders });
  await testEndpoint('Admin users', `${BASE_URL}/api/admin/users`, { headers: authHeaders });
  await testEndpoint('Admin system', `${BASE_URL}/api/admin/system`, { headers: authHeaders });

  // 10. Error Handling Tests
  log('\n⚠️  10. ERROR HANDLING', 'blue');

  await testEndpoint('404 for invalid endpoint', `${BASE_URL}/api/nonexistent`, {}, 404);
  await testEndpoint('401 for invalid auth', `${BASE_URL}/api/resumes`, {
    headers: { 'Authorization': 'Bearer invalid_token' }
  }, 401);

  // Test malformed JSON
  await testEndpoint(
    'Bad JSON request',
    `${BASE_URL}/api/job-descriptions`,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: 'invalid json'
    },
    400
  );

  // 11. Rate Limiting and Security Tests
  log('\n🛡️  11. SECURITY & VALIDATION', 'blue');

  // Test CORS headers
  const corsResult = await testEndpoint('CORS headers', `${BASE_URL}/api/health`);
  if (corsResult.success) {
    const corsHeaders = corsResult.response.headers.get('access-control-allow-origin');
    logTest('CORS configured', !!corsHeaders);
  }

  // Test content type validation
  await testEndpoint(
    'Content-Type validation',
    `${BASE_URL}/api/job-descriptions`,
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Test' })
    },
    400
  );

  // 12. Performance Tests
  log('\n⚡ 12. PERFORMANCE TESTS', 'blue');

  // Test response times
  const startTime = Date.now();
  const perfResult = await testEndpoint('Response time test', `${BASE_URL}/api/health`);
  const responseTime = Date.now() - startTime;
  
  logTest('Fast response (<1000ms)', responseTime < 1000, `${responseTime}ms`);
  logTest('Reasonable response (<5000ms)', responseTime < 5000, `${responseTime}ms`);

  // Summary
  log('\n📊 TEST SUMMARY', 'blue');
  log('=' + '='.repeat(60), 'blue');
  log(`Total Tests: ${totalTests}`, 'yellow');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, 'red');
  
  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  log(`Success Rate: ${successRate}%`, passedTests > failedTests ? 'green' : 'red');

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
  log('\n💡 RECOMMENDATIONS:', 'cyan');
  if (failedTests === 0) {
    log('✅ All tests passed! Backend API is working correctly.', 'green');
  } else if (successRate >= 80) {
    log('✅ Most tests passed. Minor issues detected:', 'yellow');
    log('1. Check authentication flow for failed auth tests', 'yellow');
    log('2. Verify database connections for data-related failures', 'yellow');
  } else {
    log('❌ Significant issues detected:', 'red');
    log('1. Check server logs for detailed error information', 'yellow');
    log('2. Verify environment variables and configuration', 'yellow');
    log('3. Ensure database and Redis are running', 'yellow');
    log('4. Check network connectivity and firewall settings', 'yellow');
  }

  // Clean up test files
  try {
    require('fs').unlinkSync('test-resume.txt');
  } catch (e) {
    // Ignore cleanup errors
  }

  log('\n🏁 Test suite completed!', 'blue');
  return { totalTests, passedTests, failedTests, successRate: parseFloat(successRate) };
}

// Run tests
runBackendE2ETests().catch(error => {
  log('\n❌ Test suite failed:', 'red');
  log(error.message, 'red');
  console.error(error);
  process.exit(1);
});