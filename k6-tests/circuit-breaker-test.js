import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  discardResponseBodies: true,
  thresholds: {
    http_req_failed: ['rate<0.1'],                // <10% errors
    http_req_duration: ['p(95)<4000'],           // p95 < 4s
  },
  scenarios: {
    burst: {
      executor: 'ramping-vus',
      stages: [
        { duration: '15s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 150 },        // Test 150 concurrent users
        { duration: '15s', target: 0 },
      ],
    },
  },
};

const BASE = __ENV.BASE || 'https://evalmatch-ai-production-be7c.up.railway.app';
const ADMIN_TOKEN = 'f120bc8f0bf050a555cf501b6256c2efaad5cd50be2db8ecd82ba38fc8b0671f';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ADMIN_TOKEN}`,
};

export default function () {
  // Test health endpoints (no auth needed)
  const r1 = http.get(`${BASE}/api/ping`, { tags: { endpoint: 'ping' }});
  check(r1, { 
    'ping 200': (r) => r.status === 200,
    'ping has uptime': (r) => r.json('uptime') > 0
  });

  // Test readyz health snapshot (should never 502 with our timeouts)
  const r2 = http.get(`${BASE}/api/readyz`, { tags: { endpoint: 'readyz' }});
  check(r2, { 
    'readyz 200': (r) => r.status === 200,
    'readyz healthy': (r) => r.json('status') === 'healthy',
    'readyz has runtime': (r) => r.json('data.runtime') !== null,
    'readyz cached': (r) => r.json('cached') === true || r.json('cached') === false
  });

  // Test admin metrics endpoint (circuit breaker status)
  const r3 = http.get(`${BASE}/api/v1/admin/metrics`, { 
    headers: HEADERS,
    tags: { endpoint: 'admin-metrics' }
  });
  check(r3, { 
    'admin metrics 200': (r) => r.status === 200,
    'has circuit breakers': (r) => r.json('circuitBreakers') !== undefined,
    'has queue depths': (r) => r.json('queueDepths') !== undefined,
  });

  // Test system health (exercises more complex logic)
  const r4 = http.get(`${BASE}/api/system-health/providers`, { 
    headers: HEADERS,
    tags: { endpoint: 'providers' }
  });
  check(r4, { 
    'providers health ok': (r) => r.status === 200 || r.status === 503 // Allow degraded
  });

  sleep(0.8);
}