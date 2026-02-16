import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const rateLimited = new Counter('rate_limited');
const errorRate = new Rate('errors');
export const options = { vus: 1000, duration: '30s' };
export default function () {
    const res = http.get(`${BASE}/api/health`);
    if (res.status === 429) rateLimited.add(1);
    check(res, { 'not error': (r) => r.status < 500 });
    errorRate.add(res.status >= 500);
    // Rapid fire, no sleep to trigger rate limit
}
