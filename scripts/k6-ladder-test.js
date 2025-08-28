import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// LADDER TEST: Progressive load to validate surgical fixes
export const options = {
  stages: [
    // Ladder progression: 10→25→50 VU
    { duration: '1m', target: 10 },   // Start: 10 users
    { duration: '2m', target: 10 },   // Hold: 10 users
    { duration: '30s', target: 25 },  // Ramp: 10→25 users  
    { duration: '2m', target: 25 },   // Hold: 25 users
    { duration: '30s', target: 50 },  // Ramp: 25→50 users
    { duration: '2m', target: 50 },   // Hold: 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // SURGICAL TARGET: 95% under 2s (was 4s)
    'http_req_failed': ['rate<0.05'],    // SURGICAL TARGET: <5% failures (was 12%)
    'errors': ['rate<0.05'],
  },
};

// Railway production URL
const BASE_URL = 'https://evalmatch-ai-production-be7c.up.railway.app';

export default function () {
  // SURGICAL FIX VALIDATION: Test fast-path endpoints heavily
  const endpoints = [
    // Fast-path endpoints (should bypass all middleware)
    { url: `${BASE_URL}/api/healthz`, weight: 20, name: 'fast_healthz', expected: '<200ms' },
    { url: `${BASE_URL}/api/version`, weight: 15, name: 'fast_version', expected: '<200ms' },
    { url: `${BASE_URL}/api/readyz`, weight: 15, name: 'fast_readyz', expected: '<200ms' },
    { url: `${BASE_URL}/api/ping`, weight: 10, name: 'fast_ping', expected: '<100ms' },
    
    // Cached health endpoints (should serve static snapshots)
    { url: `${BASE_URL}/api/health`, weight: 15, name: 'cached_health', expected: '<500ms' },
    { url: `${BASE_URL}/api/health/detailed`, weight: 10, name: 'cached_detailed', expected: '<1000ms' },
    
    // Regular endpoints (should benefit from static rate limits)
    { url: `${BASE_URL}/api/debug/status`, weight: 8, name: 'debug_status', expected: '<2000ms' },
    { url: `${BASE_URL}/api/monitoring/metrics`, weight: 7, name: 'metrics', expected: '<2000ms' },
  ];

  // Randomly select endpoint based on weights (favor fast-path endpoints)
  const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
  const random = Math.random() * totalWeight;
  let cumulativeWeight = 0;
  let selectedEndpoint;
  
  for (const endpoint of endpoints) {
    cumulativeWeight += endpoint.weight;
    if (random <= cumulativeWeight) {
      selectedEndpoint = endpoint;
      break;
    }
  }

  // Make HTTP request with surgical fix validation
  const startTime = Date.now();
  const response = http.get(selectedEndpoint.url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'k6-surgical-validation/1.0',
    },
    timeout: '5s', // Reduced from 10s - surgical fixes should be faster
  });

  const requestTime = Date.now() - startTime;

  // Record custom metrics
  responseTime.add(requestTime);
  errorRate.add(response.status !== 200);

  // SURGICAL FIX VALIDATIONS
  const validations = {
    [`${selectedEndpoint.name}: status is 200`]: (r) => r.status === 200,
    [`${selectedEndpoint.name}: has response body`]: (r) => r.body.length > 0,
  };

  // Fast-path specific validations
  if (selectedEndpoint.name.startsWith('fast_')) {
    validations[`${selectedEndpoint.name}: FAST PATH under 200ms`] = (r) => requestTime < 200;
    validations[`${selectedEndpoint.name}: has X-Fast-Path header`] = (r) => r.headers['X-Fast-Path'] === 'true';
  }

  // Cached health specific validations
  if (selectedEndpoint.name.startsWith('cached_')) {
    validations[`${selectedEndpoint.name}: CACHED under 1000ms`] = (r) => requestTime < 1000;
    validations[`${selectedEndpoint.name}: has X-Health-Cache header`] = (r) => r.headers['X-Health-Cache'] === 'true';
  }

  // Route timeout validations
  validations[`${selectedEndpoint.name}: has X-Route-Timeout header`] = (r) => !!r.headers['X-Route-Timeout'];

  // Run all validations
  const success = check(response, validations);

  // Enhanced error reporting for surgical fix validation
  if (response.status !== 200) {
    console.log(`❌ ${selectedEndpoint.name} FAILED: ${response.status} ${response.status_text} (${requestTime}ms)`);
  } else if (selectedEndpoint.name.startsWith('fast_') && requestTime > 200) {
    console.log(`⚠️ ${selectedEndpoint.name} SLOW: ${requestTime}ms > 200ms (fast-path not working)`);
  } else if (selectedEndpoint.name.startsWith('cached_') && requestTime > 1000) {
    console.log(`⚠️ ${selectedEndpoint.name} SLOW: ${requestTime}ms > 1000ms (caching not working)`);
  }

  // JSON response validation for API endpoints
  if (selectedEndpoint.url.includes('/api/') && response.status === 200) {
    check(response, {
      [`${selectedEndpoint.name}: response is valid JSON`]: (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      },
    });
  }

  // Variable sleep based on endpoint type (simulate real usage)
  if (selectedEndpoint.name.startsWith('fast_')) {
    sleep(Math.random() * 0.5 + 0.1); // 0.1-0.6s for fast endpoints
  } else if (selectedEndpoint.name.startsWith('cached_')) {
    sleep(Math.random() * 1 + 0.5); // 0.5-1.5s for cached endpoints  
  } else {
    sleep(Math.random() * 2 + 1); // 1-3s for regular endpoints
  }
}

export function handleSummary(data) {
  const summary = {
    testType: 'SURGICAL_FIXES_VALIDATION',
    timestamp: new Date().toISOString(),
    testDuration: Math.round(data.metrics.iteration_duration.values.max / 1000),
    peakVirtualUsers: data.metrics.vus.values.max,
    totalRequests: data.metrics.http_reqs.values.count,
    successRate: ((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2),
    avgResponseTime: data.metrics.http_req_duration.values.avg.toFixed(2),
    p95ResponseTime: data.metrics.http_req_duration.values['p(95)'].toFixed(2),
    p99ResponseTime: data.metrics.http_req_duration.values['p(99)'].toFixed(2),
    errorRate: (data.metrics.http_req_failed.values.rate * 100).toFixed(2),
    requestsPerSecond: data.metrics.http_req_rate.values.rate.toFixed(2),
  };

  console.log('\n🎯 SURGICAL FIXES VALIDATION RESULTS:');
  console.log('=============================================');
  console.log(`🔬 Test Type: ${summary.testType}`);
  console.log(`⏱️  Duration: ${summary.testDuration}s`);
  console.log(`👥 Peak Virtual Users: ${summary.peakVirtualUsers}`);
  console.log(`📊 Total Requests: ${summary.totalRequests}`);
  console.log(`✅ Success Rate: ${summary.successRate}% (Target: ≥95%)`);
  console.log(`⚡ Avg Response: ${summary.avgResponseTime}ms`);
  console.log(`🎯 P95 Response: ${summary.p95ResponseTime}ms (Target: <2000ms)`);
  console.log(`🔺 P99 Response: ${summary.p99ResponseTime}ms`);
  console.log(`❌ Error Rate: ${summary.errorRate}%`);
  console.log(`🚀 Req/Second: ${summary.requestsPerSecond}`);

  // SURGICAL FIX VALIDATION CRITERIA
  const successRatePassed = parseFloat(summary.successRate) >= 95;
  const p95Passed = parseFloat(summary.p95ResponseTime) < 2000;
  const errorRatePassed = parseFloat(summary.errorRate) < 5;
  
  console.log('\n🔍 SURGICAL FIX VALIDATION:');
  console.log(`${successRatePassed ? '✅' : '❌'} Success Rate: ${summary.successRate}% ${successRatePassed ? 'PASSED' : 'FAILED'} (≥95% required)`);
  console.log(`${p95Passed ? '✅' : '❌'} P95 Response: ${summary.p95ResponseTime}ms ${p95Passed ? 'PASSED' : 'FAILED'} (<2000ms required)`);
  console.log(`${errorRatePassed ? '✅' : '❌'} Error Rate: ${summary.errorRate}% ${errorRatePassed ? 'PASSED' : 'FAILED'} (<5% required)`);

  const allFixesWorking = successRatePassed && p95Passed && errorRatePassed;
  console.log(`\n🏆 SURGICAL FIXES: ${allFixesWorking ? '✅ VALIDATED' : '❌ FAILED'}`);
  
  if (allFixesWorking) {
    console.log('🎉 Ready to proceed to Phase 2.1 (Circuit Breaker Implementation)');
  } else {
    console.log('⚠️  Need to investigate and fix remaining middleware chokepoints');
  }

  return {
    'surgical-fixes-validation.json': JSON.stringify(summary, null, 2),
    stdout: '', // Suppress default k6 output for cleaner results
  };
}