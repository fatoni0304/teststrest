// k6/vip-test.js — VIP endpoint stress test
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const vipLatency = new Trend('vip_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${BASE}/vip`,
    'Origin': BASE,
};

export const options = {
    vus: 5000,
    duration: '60s',
    thresholds: { errors: ['rate<0.3'] },
};

export default function () {
    const rnd = Math.random();
    if (rnd < 0.5) {
        // GET plans (most common — browsing pricing)
        const res = http.get(`${BASE}/api/vip/plans`, { headers: HEADERS, tags: { action: 'plans' } });
        check(res, {
            'plans ok': (r) => r.status === 200,
            'has plans': (r) => { try { return JSON.parse(r.body).data.plans.length > 0; } catch { return false; } },
        });
        vipLatency.add(res.timings.duration);
        errorRate.add(res.status >= 400);
    } else if (rnd < 0.8) {
        // VIP status check (requires auth)
        const res = http.get(`${BASE}/api/vip/status`, {
            headers: { ...HEADERS, Authorization: `Bearer stress_token_${__VU}` },
            tags: { action: 'status' },
        });
        check(res, { 'responded': (r) => r.status < 500 });
        vipLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
    } else {
        // VIP history (requires auth)
        const res = http.get(`${BASE}/api/vip/history`, {
            headers: { ...HEADERS, Authorization: `Bearer stress_token_${__VU}` },
            tags: { action: 'history' },
        });
        check(res, { 'responded': (r) => r.status < 500 });
        vipLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
    }
    sleep(Math.random() * 0.1);
}
