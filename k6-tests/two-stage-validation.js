/**
 * Two-Stage K6 Validation Test
 * 
 * Stage 1: Stability Test (50 VU) - p95 < 2.5s
 * Stage 2: Push Test (100 VU) - p95 < 4s
 * 
 * Tests the circuit breaker observability and system stability under load
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const circuitBreakerErrors = new Rate('circuit_breaker_errors');
const deadlineExceeded = new Rate('deadline_exceeded');
const nullResponses = new Rate('null_responses');
const headerValidation = new Rate('header_validation_passed');
const p95ResponseTime = new Trend('p95_response_time');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://evalmatch-ai-production-be7c.up.railway.app';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'evalmatch_admin_2024_secure_key_v2';

// Test scenarios configuration
export const options = {
  stages: [
    // Stage 1: Stability Test (50 VU)
    { duration: '30s', target: 50 },    // Ramp up to 50 VU
    { duration: '60s', target: 50 },    // Hold at 50 VU for 60s
    { duration: '10s', target: 100 },   // Quick ramp to 100 VU
    
    // Stage 2: Push Test (100 VU)  
    { duration: '60s', target: 100 },   // Hold at 100 VU for 60s
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    // Go/No-Go Criteria
    'http_req_duration{stage:stability}': ['p(95)<2500'], // Stage 1: p95 < 2.5s @ 50 VU
    'http_req_duration{stage:push}': ['p(95)<4000'],      // Stage 2: p95 < 4s @ 100 VU
    
    // Quality gates
    'http_req_failed': ['rate<0.1'],           // < 10% error rate
    'circuit_breaker_errors': ['rate<0.05'],  // < 5% circuit breaker errors
    'deadline_exceeded': ['rate<0.02'],       // < 2% deadline exceeded
    'null_responses': ['rate<0.01'],          // < 1% null responses
    'header_validation_passed': ['rate>0.95'], // > 95% header validation success
    
    // Basic performance
    'http_req_duration': ['p(50)<1000', 'p(90)<3000'], // Median < 1s, p90 < 3s
    'http_reqs': ['rate>5'],                           // Min 5 req/s throughput
  },
  ext: {
    loadimpact: {
      // Track stages for conditional thresholds
      apm: [
        {
          includeDefaultMetrics: true,
          includeTestRunId: true,
        },
      ],
    },
  },
};

// Helper to determine current stage
function getCurrentStage() {
  const elapsed = (__ITER * __ENV.K6_DURATION_SECONDS) / 1000;
  
  if (elapsed <= 90) return 'stability';      // First 90s (ramp + hold at 50 VU)
  if (elapsed <= 160) return 'push';         // Next 70s (ramp + hold at 100 VU) 
  return 'rampdown';
}

// Test endpoints with different patterns
const ENDPOINTS = [
  {
    name: 'health_fast',
    url: '/api/v1/health',
    method: 'GET',
    weight: 20,
    expectedTimeout: 2,
  },
  {
    name: 'admin_metrics',
    url: '/api/v1/admin/metrics',
    method: 'GET',
    weight: 30,
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    expectedTimeout: 10,
  },
  {
    name: 'circuit_breakers',
    url: '/api/v1/admin/circuit-breakers',
    method: 'GET', 
    weight: 30,
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    expectedTimeout: 5,
  },
  {
    name: 'version_check',
    url: '/api/v1/version',
    method: 'GET',
    weight: 10,
    expectedTimeout: 1,
  },
  {
    name: 'monitoring',
    url: '/api/v1/monitoring',
    method: 'GET',
    weight: 10,
    expectedTimeout: 5,
  },
];

// Weighted random endpoint selection
function selectEndpoint() {
  const totalWeight = ENDPOINTS.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of ENDPOINTS) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }
  
  return ENDPOINTS[0]; // Fallback
}

export default function () {
  const stage = getCurrentStage();
  const endpoint = selectEndpoint();
  
  // Build request
  const url = `${BASE_URL}${endpoint.url}`;
  const params = {
    headers: {
      'User-Agent': 'k6-load-test/1.0',
      'Accept': 'application/json',
      ...(endpoint.headers || {}),
    },
    timeout: '30s', // Overall K6 timeout
    tags: {
      stage: stage,
      endpoint: endpoint.name,
    },
  };
  
  const startTime = Date.now();
  const response = http.request(endpoint.method, url, null, params);
  const duration = Date.now() - startTime;
  
  // Record p95 metric with stage tag
  p95ResponseTime.add(duration, { stage: stage });
  
  // Validate response structure
  const isValidResponse = check(response, {
    'status is not 0': (r) => r.status !== 0,
    'response is not null': (r) => r !== null && r !== undefined,
    'has response body': (r) => r.body && r.body.length > 0,
    'is JSON response': (r) => {
      try {
        const contentType = r.headers['Content-Type'] || r.headers['content-type'] || '';
        return contentType.includes('application/json');
      } catch {
        return false;
      }
    },
  });
  
  // Track null responses
  nullResponses.add(response === null || response === undefined);
  
  if (!isValidResponse) {
    console.error(`Invalid response for ${endpoint.name}: status=${response?.status}, body=${response?.body?.substring(0, 100)}`);
    return;
  }
  
  // Parse response for detailed validation
  let responseData;
  try {
    responseData = JSON.parse(response.body);
  } catch (e) {
    console.error(`JSON parse error for ${endpoint.name}: ${e.message}`);
    return;
  }
  
  // Check for specific error conditions
  const isCircuitBreakerError = check(response, {
    'not circuit breaker error': (r) => !r.body.includes('ERR_BREAKER_OPEN') && !r.body.includes('Circuit breaker'),
  });
  circuitBreakerErrors.add(!isCircuitBreakerError);
  
  const isDeadlineError = check(response, {
    'not deadline exceeded': (r) => !r.body.includes('DEADLINE_EXCEEDED') && !r.body.includes('deadline exceeded'),
  });
  deadlineExceeded.add(!isDeadlineError);
  
  // Validate observability headers
  const headerValidationPassed = check(response, {
    'has circuit breaker state header': (r) => r.headers['X-CB-State'] || r.headers['x-cb-state'],
    'has memory pressure header': (r) => r.headers['X-Memory-Pressure'] || r.headers['x-memory-pressure'],
    'has queue wait header': (r) => r.headers['X-Queue-Wait'] || r.headers['x-queue-wait'],
    'has deadline header': (r) => r.headers['X-Deadline'] || r.headers['x-deadline'],
  });
  headerValidation.add(headerValidationPassed);
  
  // Log sample headers for debugging (only occasionally)
  if (Math.random() < 0.01) { // 1% sampling
    console.log(`Sample headers for ${endpoint.name}:`, {
      cbState: response.headers['X-CB-State'] || response.headers['x-cb-state'],
      memoryPressure: response.headers['X-Memory-Pressure'] || response.headers['x-memory-pressure'], 
      queueWait: response.headers['X-Queue-Wait'] || response.headers['x-queue-wait'],
      deadline: response.headers['X-Deadline'] || response.headers['x-deadline'],
    });
  }
  
  // Basic response validation
  check(response, {
    [`${endpoint.name}: status 200 or acceptable error`]: (r) => {
      return r.status === 200 || 
             r.status === 401 ||  // Auth errors are acceptable for some endpoints
             r.status === 429 ||  // Rate limits are expected under load
             r.status === 503;    // Service unavailable is acceptable (circuit breakers)
    },
    [`${endpoint.name}: response time under ${endpoint.expectedTimeout * 2}s`]: (r) => {
      return r.timings.duration < (endpoint.expectedTimeout * 2000);
    },
  });
  
  // Short random sleep to simulate realistic user behavior
  sleep(Math.random() * 0.5 + 0.1); // 0.1-0.6 seconds
}

export function handleSummary(data) {
  const stage1P95 = data.metrics['http_req_duration{stage:stability}']?.values?.['p(95)'] || 0;
  const stage2P95 = data.metrics['http_req_duration{stage:push}']?.values?.['p(95)'] || 0;
  
  const results = {
    timestamp: new Date().toISOString(),
    test: 'Two-Stage Validation',
    stages: {
      stability: {
        target_vu: 50,
        p95_ms: Math.round(stage1P95),
        threshold_ms: 2500,
        passed: stage1P95 < 2500,
      },
      push: {
        target_vu: 100,
        p95_ms: Math.round(stage2P95),
        threshold_ms: 4000,
        passed: stage2P95 < 4000,
      },
    },
    quality_gates: {
      error_rate: (data.metrics.http_req_failed?.values?.rate || 0) * 100,
      circuit_breaker_errors: (data.metrics.circuit_breaker_errors?.values?.rate || 0) * 100,
      deadline_exceeded: (data.metrics.deadline_exceeded?.values?.rate || 0) * 100,
      null_responses: (data.metrics.null_responses?.values?.rate || 0) * 100,
      header_validation: (data.metrics.header_validation_passed?.values?.rate || 0) * 100,
    },
    performance: {
      median_ms: Math.round(data.metrics.http_req_duration?.values?.['p(50)'] || 0),
      p90_ms: Math.round(data.metrics.http_req_duration?.values?.['p(90)'] || 0),
      p95_ms: Math.round(data.metrics.http_req_duration?.values?.['p(95)'] || 0),
      p99_ms: Math.round(data.metrics.http_req_duration?.values?.['p(99)'] || 0),
      requests_per_second: Math.round(data.metrics.http_reqs?.values?.rate || 0),
      total_requests: data.metrics.http_reqs?.values?.count || 0,
    },
    go_no_go: {
      stability_passed: stage1P95 < 2500,
      push_passed: stage2P95 < 4000,
      overall_passed: stage1P95 < 2500 && stage2P95 < 4000,
      recommendation: (stage1P95 < 2500 && stage2P95 < 4000) ? 'GO' : 'NO-GO',
    },
  };
  
  console.log('\n=== Two-Stage Validation Results ===');
  console.log(`Stage 1 (50 VU): p95 = ${results.stages.stability.p95_ms}ms (threshold: 2500ms) - ${results.stages.stability.passed ? 'PASS' : 'FAIL'}`);
  console.log(`Stage 2 (100 VU): p95 = ${results.stages.push.p95_ms}ms (threshold: 4000ms) - ${results.stages.push.passed ? 'PASS' : 'FAIL'}`);
  console.log(`\nRecommendation: ${results.go_no_go.recommendation}`);
  console.log('\nQuality Gates:');
  console.log(`- Error Rate: ${results.quality_gates.error_rate.toFixed(1)}%`);
  console.log(`- Circuit Breaker Errors: ${results.quality_gates.circuit_breaker_errors.toFixed(1)}%`);
  console.log(`- Deadline Exceeded: ${results.quality_gates.deadline_exceeded.toFixed(1)}%`);
  console.log(`- Null Responses: ${results.quality_gates.null_responses.toFixed(1)}%`);
  console.log(`- Header Validation: ${results.quality_gates.header_validation.toFixed(1)}%`);
  
  return {
    'two-stage-results.json': JSON.stringify(results, null, 2),
    stdout: JSON.stringify(results, null, 2),
  };
}