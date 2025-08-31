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
        { duration: '15s', target: 0 },
      ],
    },
  },
};

const BASE = __ENV.BASE || 'https://evalmatch-ai-production-be7c.up.railway.app';
const TOKEN = __ENV.TOKEN || ''; // optional
const HEADERS = {
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// representative "heavy" route (adjust if yours differs)
const MATCH_URL = `${BASE}/api/v1/analysis/match`;

const payload = JSON.stringify({
  resumeText: "5y React, Node, Postgres, AWS",
  jobText: "Senior FE React, TypeScript, CI/CD, cloud",
});

export default function () {
  // hit a fast-path to verify health
  const r1 = http.get(`${BASE}/api/ping`, { headers: HEADERS });
  check(r1, { 'ping 200': (r) => r.status === 200 });

  // main heavy call (same body each time => helps SWR later)
  const r2 = http.post(MATCH_URL, payload, { headers: HEADERS, tags: { endpoint: 'match' }});
  check(r2, {
    'match ok/accepted': (r) => r.status === 200 || r.status === 202,
  });

  // light health snapshot (should never 502)
  const r3 = http.get(`${BASE}/api/readyz`, { headers: HEADERS });
  check(r3, { 'readyz 200': (r) => r.status === 200 });

  sleep(1);
}