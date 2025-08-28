#!/usr/bin/env node

/**
 * Production Load Test for 100-120 Concurrent Users
 * Target: 88%+ success rate, <4s p95 latency, no OOM
 * 
 * Simulates realistic user behavior:
 * - User authentication
 * - Resume uploads
 * - Job description creation
 * - Match analysis requests
 * - Dashboard queries
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  baseUrl: process.env.TEST_URL || 'https://web-production-392cc.up.railway.app',
  authToken: process.env.AUTH_TOKEN || '', // Set this to a valid Firebase token for testing
  targetUsers: 100,
  rampUpSeconds: 30,
  testDurationSeconds: 300, // 5 minutes
  requestsPerUserPerMinute: 12, // Realistic usage pattern
};

// Metrics collection
const metrics = {
  requests: {
    total: 0,
    success: 0,
    failed: 0,
    byEndpoint: {}
  },
  latencies: [],
  errors: [],
  memorySnapshots: [],
  startTime: null,
  endTime: null
};

// Test data
const testData = {
  resumeContent: `John Doe
Software Engineer | john.doe@email.com | +1-555-0123

EXPERIENCE
Senior Software Engineer - Tech Corp (2020-Present)
• Led development of microservices architecture serving 1M+ users
• Implemented CI/CD pipelines reducing deployment time by 60%
• Mentored team of 5 junior developers

SKILLS
JavaScript, TypeScript, Python, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes

EDUCATION
BS Computer Science - University of Technology (2016)`,

  jobDescription: `Senior Full Stack Engineer
Tech Startup Inc.

We're looking for an experienced full stack engineer to join our team.

Requirements:
• 5+ years of software development experience
• Strong JavaScript/TypeScript skills
• Experience with React and Node.js
• Database design with PostgreSQL
• Knowledge of microservices and cloud platforms
• Experience with Redis and caching strategies

Nice to have:
• Kubernetes and Docker experience
• Python programming skills
• Team leadership experience`,

  endpoints: [
    { path: '/api/health', method: 'GET', weight: 5 },
    { path: '/api/health/detailed', method: 'GET', weight: 2 },
    { path: '/api/resumes', method: 'GET', weight: 8 },
    { path: '/api/job-descriptions', method: 'GET', weight: 8 },
    { path: '/api/analysis/history', method: 'GET', weight: 5 },
    { path: '/api/resumes/upload', method: 'POST', weight: 3, body: { type: 'resume' } },
    { path: '/api/job-descriptions', method: 'POST', weight: 3, body: { type: 'job' } },
    { path: '/api/analysis/match', method: 'POST', weight: 2, body: { type: 'analysis' } }
  ]
};

// Helper functions
function makeRequest(endpoint, authToken = null) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const url = new URL(CONFIG.baseUrl + endpoint.path);
    
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
      timeout: 30000
    };

    let body = null;
    if (endpoint.body) {
      if (endpoint.body.type === 'resume') {
        body = JSON.stringify({
          filename: `resume_${Date.now()}.txt`,
          content: Buffer.from(testData.resumeContent).toString('base64')
        });
      } else if (endpoint.body.type === 'job') {
        body = JSON.stringify({
          title: 'Senior Engineer',
          company: 'Test Corp',
          description: testData.jobDescription
        });
      } else if (endpoint.body.type === 'analysis') {
        body = JSON.stringify({
          resumeId: 'test-resume-id',
          jobDescriptionId: 'test-job-id'
        });
      }
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const latency = performance.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 400;
        
        resolve({
          endpoint: endpoint.path,
          method: endpoint.method,
          statusCode: res.statusCode,
          latency,
          success,
          timestamp: Date.now()
        });
      });
    });

    req.on('error', (error) => {
      const latency = performance.now() - startTime;
      resolve({
        endpoint: endpoint.path,
        method: endpoint.method,
        error: error.message,
        latency,
        success: false,
        timestamp: Date.now()
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const latency = performance.now() - startTime;
      resolve({
        endpoint: endpoint.path,
        method: endpoint.method,
        error: 'Request timeout',
        latency,
        success: false,
        timestamp: Date.now()
      });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// User simulation
async function simulateUser(userId) {
  const delayBetweenRequests = 60000 / CONFIG.requestsPerUserPerMinute;
  
  while (Date.now() - metrics.startTime < CONFIG.testDurationSeconds * 1000) {
    // Select random endpoint based on weights
    const totalWeight = testData.endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedEndpoint = null;
    
    for (const endpoint of testData.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        selectedEndpoint = endpoint;
        break;
      }
    }
    
    if (selectedEndpoint) {
      const result = await makeRequest(selectedEndpoint, CONFIG.authToken);
      
      // Update metrics
      metrics.requests.total++;
      if (result.success) {
        metrics.requests.success++;
      } else {
        metrics.requests.failed++;
        metrics.errors.push({
          endpoint: result.endpoint,
          error: result.error || `HTTP ${result.statusCode}`,
          timestamp: result.timestamp
        });
      }
      
      metrics.latencies.push(result.latency);
      
      const key = `${result.method} ${result.endpoint}`;
      if (!metrics.requests.byEndpoint[key]) {
        metrics.requests.byEndpoint[key] = { total: 0, success: 0, failed: 0 };
      }
      metrics.requests.byEndpoint[key].total++;
      if (result.success) {
        metrics.requests.byEndpoint[key].success++;
      } else {
        metrics.requests.byEndpoint[key].failed++;
      }
    }
    
    // Random delay to simulate real user behavior
    const jitter = (Math.random() - 0.5) * delayBetweenRequests * 0.5;
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests + jitter));
  }
}

// Check system health
async function checkSystemHealth() {
  try {
    const result = await makeRequest({ path: '/api/health/detailed', method: 'GET' });
    if (result.success) {
      const health = JSON.parse(result.data || '{}');
      metrics.memorySnapshots.push({
        timestamp: Date.now(),
        memoryUsedMB: health.system?.memory?.usedMB,
        cpuPercent: health.system?.cpu?.percentage,
        healthScore: health.healthScore
      });
    }
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

// Main load test function
async function runLoadTest() {
  console.log('🚀 Starting Load Test for 100-120 Concurrent Users');
  console.log(`📍 Target: ${CONFIG.baseUrl}`);
  console.log(`👥 Users: ${CONFIG.targetUsers}`);
  console.log(`⏱️  Duration: ${CONFIG.testDurationSeconds}s`);
  console.log(`📊 Requests per user per minute: ${CONFIG.requestsPerUserPerMinute}`);
  console.log('');
  
  metrics.startTime = Date.now();
  
  // Start health monitoring
  const healthInterval = setInterval(checkSystemHealth, 10000);
  
  // Ramp up users gradually
  const users = [];
  const usersPerSecond = CONFIG.targetUsers / CONFIG.rampUpSeconds;
  
  console.log(`📈 Ramping up ${CONFIG.targetUsers} users over ${CONFIG.rampUpSeconds} seconds...`);
  
  for (let i = 0; i < CONFIG.targetUsers; i++) {
    users.push(simulateUser(i));
    
    if (i < CONFIG.targetUsers - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 / usersPerSecond));
    }
    
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`Users: ${i + 1}/${CONFIG.targetUsers}\r`);
    }
  }
  
  console.log(`\n✅ All ${CONFIG.targetUsers} users active`);
  console.log('🔄 Running test...\n');
  
  // Progress updates
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - metrics.startTime) / 1000);
    const successRate = metrics.requests.total > 0 
      ? (metrics.requests.success / metrics.requests.total * 100).toFixed(2)
      : 0;
    
    process.stdout.write(
      `Time: ${elapsed}s | Requests: ${metrics.requests.total} | ` +
      `Success: ${successRate}% | Failed: ${metrics.requests.failed}\r`
    );
  }, 1000);
  
  // Wait for all users to complete
  await Promise.all(users);
  
  clearInterval(healthInterval);
  clearInterval(progressInterval);
  
  metrics.endTime = Date.now();
  
  // Calculate final metrics
  const successRate = (metrics.requests.success / metrics.requests.total * 100).toFixed(2);
  const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  const p95Latency = metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.95)];
  const p99Latency = metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.99)];
  const maxLatency = Math.max(...metrics.latencies);
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const requestsPerSecond = metrics.requests.total / duration;
  
  // Print results
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 LOAD TEST RESULTS');
  console.log('='.repeat(70));
  
  console.log('\n📈 Overall Performance:');
  console.log(`   Total Requests: ${metrics.requests.total}`);
  console.log(`   Successful: ${metrics.requests.success} (${successRate}%)`);
  console.log(`   Failed: ${metrics.requests.failed}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Requests/sec: ${requestsPerSecond.toFixed(2)}`);
  
  console.log('\n⏱️  Latency Statistics:');
  console.log(`   Average: ${avgLatency.toFixed(0)}ms`);
  console.log(`   P95: ${p95Latency.toFixed(0)}ms`);
  console.log(`   P99: ${p99Latency.toFixed(0)}ms`);
  console.log(`   Max: ${maxLatency.toFixed(0)}ms`);
  
  console.log('\n🔗 Endpoint Breakdown:');
  for (const [endpoint, stats] of Object.entries(metrics.requests.byEndpoint)) {
    const epSuccessRate = (stats.success / stats.total * 100).toFixed(1);
    console.log(`   ${endpoint}:`);
    console.log(`      Requests: ${stats.total} | Success: ${epSuccessRate}% | Failed: ${stats.failed}`);
  }
  
  if (metrics.memorySnapshots.length > 0) {
    const avgMemory = metrics.memorySnapshots.reduce((a, b) => a + (b.memoryUsedMB || 0), 0) / metrics.memorySnapshots.length;
    const maxMemory = Math.max(...metrics.memorySnapshots.map(s => s.memoryUsedMB || 0));
    const minHealthScore = Math.min(...metrics.memorySnapshots.map(s => s.healthScore || 100));
    
    console.log('\n💾 System Health:');
    console.log(`   Avg Memory: ${avgMemory.toFixed(0)}MB`);
    console.log(`   Max Memory: ${maxMemory.toFixed(0)}MB`);
    console.log(`   Min Health Score: ${minHealthScore}`);
  }
  
  console.log('\n' + '='.repeat(70));
  
  // Success criteria check
  const success = successRate >= 88 && p95Latency < 4000;
  
  if (success) {
    console.log('✅ TEST PASSED! All success criteria met:');
    console.log(`   ✓ Success rate: ${successRate}% (target: ≥88%)`);
    console.log(`   ✓ P95 latency: ${p95Latency.toFixed(0)}ms (target: <4000ms)`);
  } else {
    console.log('❌ TEST FAILED! Success criteria not met:');
    if (successRate < 88) {
      console.log(`   ✗ Success rate: ${successRate}% (target: ≥88%)`);
    }
    if (p95Latency >= 4000) {
      console.log(`   ✗ P95 latency: ${p95Latency.toFixed(0)}ms (target: <4000ms)`);
    }
  }
  
  console.log('='.repeat(70));
  
  // Save detailed results
  const resultsFile = `load-test-results-${Date.now()}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(metrics, null, 2));
  console.log(`\n📄 Detailed results saved to: ${resultsFile}`);
  
  process.exit(success ? 0 : 1);
}

// Run the test
runLoadTest().catch(error => {
  console.error('❌ Load test failed:', error);
  process.exit(1);
});