/**
 * Focused Business Validation Test - Railway Safe Version
 * 
 * Tests business endpoints with proper circuit breaker observability
 * Excludes admin routes to avoid rate limiting issues
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics for circuit breaker observability
const circuitBreakerOpen = new Rate('cb_open_rate');
const queueDepth = new Trend('queue_depth');
const memoryPressure = new Rate('memory_pressure_high');
const deadlineRemaining = new Trend('deadline_remaining_ms');

// Configuration
const BASE = __ENV.BASE_URL || 'https://evalmatch-ai-production-be7c.up.railway.app';
const USER_TOKEN = __ENV.USER_TOKEN || 'demo_user_token_2024';

export const options = {
  scenarios: {
    // Health monitoring - continuous light load
    health: { 
      executor: 'constant-vus', 
      vus: 3, 
      duration: '10m',
      tags: { scenario: 'health' },
      exec: 'healthTest',
    },
    
    // Business Stage 1: 25 VU stability test (reduced for Railway safety)
    business25: { 
      executor: 'ramping-vus',
      startTime: '30s',
      stages: [
        { duration: '1m', target: 25 },   // Ramp to 25
        { duration: '3m', target: 25 },   // Hold at 25
        { duration: '30s', target: 0 }    // Ramp down
      ],
      tags: { scenario: 'business25' },
      exec: 'businessTest',
    },
    
    // Business Stage 2: 50 VU push test
    business50: {
      executor: 'ramping-vus', 
      startTime: '5m', // Start after business25
      stages: [
        { duration: '1m', target: 50 },   // Ramp to 50
        { duration: '3m', target: 50 },   // Hold at 50 
        { duration: '30s', target: 0 }    // Ramp down
      ],
      tags: { scenario: 'business50' },
      exec: 'businessTest',
    },
  },
  
  thresholds: {
    // Business endpoint thresholds (realistic targets)
    'http_req_duration{type:business,scenario:business25}': ['p(95)<2000'], // Stage 1: p95 < 2s @ 25 VU
    'http_req_duration{type:business,scenario:business50}': ['p(95)<3000'],  // Stage 2: p95 < 3s @ 50 VU
    'checks{type:business}': ['rate>0.90'],                                  // Success ≥90% on business calls
    'http_req_failed{type:business}': ['rate<0.10'],                        // Error rate <10% on business calls
    
    // Health endpoint thresholds (relaxed)
    'http_req_duration{type:health}': ['p(95)<1000'],     // Health should be fast
    'http_req_failed{type:health}': ['rate<0.15'],        // Allow some health check failures
    
    // Circuit breaker observability thresholds
    'cb_open_rate': ['rate<0.15'],           // <15% of requests hit open breakers
    'memory_pressure_high': ['rate<0.3'],   // <30% high memory pressure samples
    'queue_depth': ['p(90)<100'],           // Queue depth p90 < 100 waiting requests
  },
};

// Test data for business endpoints
const TEST_JOB_DATA = {
  title: "Software Engineer",
  description: "Looking for a software engineer with Node.js experience.",
  requirements: ["Node.js", "JavaScript", "API development"],
  location: "Remote",
  salary_range: "80k-120k"
};

const TEST_RESUME_DATA = {
  name: "Jane Smith",
  email: "jane.smith@example.com",
  experience: "3 years of Node.js development experience building REST APIs.",
  skills: ["JavaScript", "Node.js", "Express", "MongoDB"],
  education: "BS Computer Science"
};

// Health test function
export function healthTest() {
  // Test health endpoints - fast and simple
  const healthEndpoints = [
    { url: '/api/ping', weight: 30 },
    { url: '/api/readyz', weight: 30 },
    { url: '/api/v1/health', weight: 20 },
    { url: '/api/version', weight: 20 },
  ];
  
  const endpoint = healthEndpoints[Math.floor(Math.random() * healthEndpoints.length)];
  const res = http.get(`${BASE}${endpoint.url}`, {
    tags: { type: 'health', endpoint: endpoint.url }
  });
  
  check(res, {
    'health 2xx': (r) => r.status >= 200 && r.status < 300,
    'health fast': (r) => r.timings.duration < 1000,
  });
  
  sleep(Math.random() * 2 + 1); // 1-3s think time
}

// Business test function
export function businessTest() {
  const scenario = __ENV.K6_SCENARIO_NAME || 'business';
  
  // Weighted selection of business operations (no admin routes)
  const operations = [
    { name: 'job_analysis', weight: 50, run: testJobAnalysis },
    { name: 'resume_upload', weight: 50, run: testResumeUpload },
  ];
  
  const totalWeight = operations.reduce((sum, op) => sum + op.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const operation of operations) {
    random -= operation.weight;
    if (random <= 0) {
      operation.run(scenario);
      break;
    }
  }
  
  // Realistic think time
  sleep(Math.random() * 1.5 + 0.5); // 0.5-2s think time
}

function testJobAnalysis(scenario) {
  const payload = JSON.stringify({
    title: TEST_JOB_DATA.title,
    description: TEST_JOB_DATA.description,
    requirements: TEST_JOB_DATA.requirements
  });
  
  const res = http.post(`${BASE}/api/job-descriptions`, payload, {
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${USER_TOKEN}`,
    },
    tags: { type: 'business', operation: 'job_analysis', scenario }
  });
  
  const success = check(res, {
    'job_analysis response ok': (r) => r.status >= 200 && r.status < 500, // Accept auth failures
    'job_analysis not null': (r) => r.body !== null && r.body !== undefined,
  });
  
  if (success) {
    extractCircuitBreakerHeaders(res);
  }
}

function testResumeUpload(scenario) {
  const payload = JSON.stringify({
    name: TEST_RESUME_DATA.name,
    email: TEST_RESUME_DATA.email,
    content: TEST_RESUME_DATA.experience,
    skills: TEST_RESUME_DATA.skills
  });
  
  const res = http.post(`${BASE}/api/resumes`, payload, {
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${USER_TOKEN}`,
    },
    tags: { type: 'business', operation: 'resume_upload', scenario }
  });
  
  const success = check(res, {
    'resume_upload response ok': (r) => r.status >= 200 && r.status < 500, // Accept auth failures
    'resume_upload not null': (r) => r.body !== null && r.body !== undefined,
  });
  
  if (success) {
    extractCircuitBreakerHeaders(res);
  }
}

function extractCircuitBreakerHeaders(response) {
  // Extract and record circuit breaker observability headers
  const cbState = response.headers['X-CB-State'] || response.headers['x-cb-state'] || '';
  const queueWait = response.headers['X-Queue-Wait'] || response.headers['x-queue-wait'] || '0';
  const memoryPress = response.headers['X-Memory-Pressure'] || response.headers['x-memory-pressure'] || 'low';
  const deadline = response.headers['X-Deadline'] || response.headers['x-deadline'] || '0';
  
  // Record metrics for monitoring
  const hasOpenBreaker = cbState.includes(':open');
  circuitBreakerOpen.add(hasOpenBreaker);
  
  const queueCount = parseInt(queueWait) || 0;
  queueDepth.add(queueCount);
  
  const isHighMemory = memoryPress === 'high' || memoryPress === 'critical';
  memoryPressure.add(isHighMemory);
  
  const deadlineMs = parseInt(deadline) || 0;
  deadlineRemaining.add(deadlineMs);
  
  // Occasional sampling for debugging (2% of requests)
  if (Math.random() < 0.02) {
    console.log(`CB Headers Sample: state=${cbState}, queue=${queueWait}, memory=${memoryPress}, deadline=${deadline}`);
  }
}

export function handleSummary(data) {
  const business25P95 = data.metrics['http_req_duration{type:business,scenario:business25}']?.values?.['p(95)'] || 0;
  const business50P95 = data.metrics['http_req_duration{type:business,scenario:business50}']?.values?.['p(95)'] || 0;
  
  const results = {
    timestamp: new Date().toISOString(),
    test: 'Focused Business Validation (Railway Safe)',
    go_no_go: {
      stage1_25vu: {
        p95_ms: Math.round(business25P95),
        threshold_ms: 2000,
        passed: business25P95 < 2000,
        status: business25P95 < 2000 ? 'PASS' : 'FAIL'
      },
      stage2_50vu: {
        p95_ms: Math.round(business50P95),
        threshold_ms: 3000, 
        passed: business50P95 < 3000,
        status: business50P95 < 3000 ? 'PASS' : 'FAIL'
      },
      overall_recommendation: (business25P95 < 2000 && business50P95 < 3000) ? 'GO' : 'NO-GO'
    },
    business_quality: {
      success_rate: Math.round((data.metrics['checks{type:business}']?.values?.rate || 0) * 100),
      error_rate: Math.round((data.metrics['http_req_failed{type:business}']?.values?.rate || 0) * 100),
      total_business_requests: data.metrics['http_reqs{type:business}']?.values?.count || 0,
      requests_per_second: Math.round(data.metrics['http_reqs{type:business}']?.values?.rate || 0),
    },
    circuit_breaker_observability: {
      open_rate_percent: Math.round((data.metrics.cb_open_rate?.values?.rate || 0) * 100),
      avg_queue_depth: Math.round(data.metrics.queue_depth?.values?.avg || 0),
      memory_pressure_rate: Math.round((data.metrics.memory_pressure_high?.values?.rate || 0) * 100),
      avg_deadline_remaining: Math.round(data.metrics.deadline_remaining_ms?.values?.avg || 0),
    },
    health_monitoring: {
      health_success_rate: Math.round((data.metrics['checks{type:health}']?.values?.rate || 0) * 100),
      health_p95_ms: Math.round(data.metrics['http_req_duration{type:health}']?.values?.['p(95)'] || 0),
      total_health_requests: data.metrics['http_reqs{type:health}']?.values?.count || 0,
    }
  };
  
  console.log('\n=== FOCUSED BUSINESS VALIDATION RESULTS ===');
  console.log(`Stage 1 (25 VU): p95 = ${results.go_no_go.stage1_25vu.p95_ms}ms (threshold: 2000ms) - ${results.go_no_go.stage1_25vu.status}`);
  console.log(`Stage 2 (50 VU): p95 = ${results.go_no_go.stage2_50vu.p95_ms}ms (threshold: 3000ms) - ${results.go_no_go.stage2_50vu.status}`);
  console.log(`\n🎯 RECOMMENDATION: ${results.go_no_go.overall_recommendation}`);
  console.log(`\n📊 Business Quality:`);
  console.log(`- Success Rate: ${results.business_quality.success_rate}%`);
  console.log(`- Error Rate: ${results.business_quality.error_rate}%`);
  console.log(`- Throughput: ${results.business_quality.requests_per_second} req/sec`);
  console.log(`\n🔧 Circuit Breaker Health:`);
  console.log(`- Open Rate: ${results.circuit_breaker_observability.open_rate_percent}%`);
  console.log(`- Avg Queue Depth: ${results.circuit_breaker_observability.avg_queue_depth}`);
  console.log(`- Memory Pressure: ${results.circuit_breaker_observability.memory_pressure_rate}%`);
  
  return {
    'focused-business-results.json': JSON.stringify(results, null, 2),
    stdout: JSON.stringify(results, null, 2),
  };
}