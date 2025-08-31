import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  discardResponseBodies: true,
  thresholds: {
    http_req_failed: ['rate<0.05'],               // <5% errors
    http_req_duration: ['p(95)<3000'],           // p95 < 3s warm
  },
  scenarios: {
    steady: {
      executor: 'constant-vus',
      vus: 80,                                   // tune up/down
      duration: '6m',
    },
  },
};

const BASE = __ENV.BASE || 'https://evalmatch-ai-production-be7c.up.railway.app';
const TOKEN = __ENV.TOKEN || '';
const HEADERS = {
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};
const MATCH_URL = `${BASE}/api/v1/analysis/match`;

const payload = JSON.stringify({
  resumeText: "5y React, Node, Postgres, AWS",
  jobText: "Senior FE React, TypeScript, CI/CD, cloud",
});

export function setup() {
  // pre-warm cache
  http.post(MATCH_URL, payload, { headers: HEADERS });
}

export default function () {
  const r = http.post(MATCH_URL, payload, { headers: HEADERS, tags: { endpoint: 'match' }});
  check(r, { 'ok/accepted': (res) => res.status === 200 || res.status === 202 });
  sleep(1);
}