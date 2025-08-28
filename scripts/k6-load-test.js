import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Load test configuration
export const options = {
  stages: [
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '2m', target: 50 }, // Ramp up to 50 users  
    { duration: '3m', target: 100 }, // Target load: 100 users
    { duration: '2m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 50 }, // Ramp down to 50
    { duration: '1m', target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<4000'], // 95% of requests must be below 4s
    'http_req_failed': ['rate<0.12'], // Error rate must be below 12% (target: ≥88% success)
    'errors': ['rate<0.12'],
  },
};

// Railway production URL
const BASE_URL = 'https://web-production-392cc.up.railway.app';

export default function () {
  // Test different endpoints to simulate real usage
  const endpoints = [
    { url: `${BASE_URL}/health`, weight: 10, name: 'health_check' },
    { url: `${BASE_URL}/api/v1/health`, weight: 15, name: 'api_health' },
    { url: `${BASE_URL}/ping`, weight: 20, name: 'ping' },
    { url: `${BASE_URL}/api/v1/monitoring/health`, weight: 10, name: 'monitoring_health' },
    { url: `${BASE_URL}/api/v1/db-status`, weight: 5, name: 'db_status' },
  ];

  // Randomly select endpoint based on weights
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

  // Make HTTP request
  const response = http.get(selectedEndpoint.url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
    },
    timeout: '10s',
  });

  // Record custom metrics
  responseTime.add(response.timings.duration);
  errorRate.add(response.status !== 200);

  // Validation checks
  const success = check(response, {
    [`${selectedEndpoint.name}: status is 200`]: (r) => r.status === 200,
    [`${selectedEndpoint.name}: response time < 4s`]: (r) => r.timings.duration < 4000,
    [`${selectedEndpoint.name}: response has body`]: (r) => r.body.length > 0,
  });

  // Additional checks for JSON endpoints
  if (selectedEndpoint.url.includes('/api/') || selectedEndpoint.url.includes('/health')) {
    check(response, {
      [`${selectedEndpoint.name}: response is JSON`]: (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      },
    });
  }

  // Log errors for debugging
  if (response.status !== 200) {
    console.log(`❌ ${selectedEndpoint.name} failed: ${response.status} ${response.status_text}`);
  }

  // Wait between requests (simulate real user behavior)
  sleep(Math.random() * 2 + 0.5); // Random delay 0.5-2.5 seconds
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test_duration: data.metrics.iteration_duration.values.max / 1000,
    virtual_users: data.metrics.vus.values.max,
    total_requests: data.metrics.http_reqs.values.count,
    success_rate: ((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2),
    avg_response_time: data.metrics.http_req_duration.values.avg.toFixed(2),
    p95_response_time: data.metrics.http_req_duration.values['p(95)'].toFixed(2),
    p99_response_time: data.metrics.http_req_duration.values['p(99)'].toFixed(2),
    error_rate: (data.metrics.http_req_failed.values.rate * 100).toFixed(2),
    requests_per_second: data.metrics.http_req_rate.values.rate.toFixed(2),
  };

  console.log('\n🎯 LOAD TEST RESULTS SUMMARY:');
  console.log('=====================================');
  console.log(`📊 Virtual Users: ${summary.virtual_users}`);
  console.log(`📈 Total Requests: ${summary.total_requests}`);
  console.log(`✅ Success Rate: ${summary.success_rate}% (Target: ≥88%)`);
  console.log(`⚡ Avg Response Time: ${summary.avg_response_time}ms`);
  console.log(`🎯 P95 Response Time: ${summary.p95_response_time}ms (Target: <4000ms)`);
  console.log(`🔺 P99 Response Time: ${summary.p99_response_time}ms`);
  console.log(`❌ Error Rate: ${summary.error_rate}%`);
  console.log(`🚀 Requests/Second: ${summary.requests_per_second}`);

  // Determine test result
  const successRatePassed = parseFloat(summary.success_rate) >= 88;
  const p95Passed = parseFloat(summary.p95_response_time) < 4000;
  
  console.log('\n🏆 TEST CRITERIA EVALUATION:');
  console.log(`${successRatePassed ? '✅' : '❌'} Success Rate: ${summary.success_rate}% ${successRatePassed ? 'PASSED' : 'FAILED'} (≥88% required)`);
  console.log(`${p95Passed ? '✅' : '❌'} P95 Response Time: ${summary.p95_response_time}ms ${p95Passed ? 'PASSED' : 'FAILED'} (<4000ms required)`);

  const overallPass = successRatePassed && p95Passed;
  console.log(`\n🎖️  OVERALL RESULT: ${overallPass ? '✅ PASSED' : '❌ FAILED'}`);

  return {
    'load-test-summary.json': JSON.stringify(summary, null, 2),
    stdout: '', // Suppress default k6 output for cleaner results
  };
}