// k6/referral-test.js — Referral system concurrency test
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const REF_CODE = 'CY5DXWJP';
const errorRate = new Rate('errors');
const refLatency = new Trend('referral_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${BASE}/register?ref=${REF_CODE}`,
    'Origin': BASE,
};

export const options = {
    vus: 100,
    duration: '60s',
    thresholds: { errors: ['rate<0.3'] },
};

export default function () {
    const rnd = Math.random();
    if (rnd < 0.4) {
        // Referral settings
        const res = http.get(`${BASE}/api/referral/settings`, { headers: HEADERS, tags: { action: 'settings' } });
        check(res, {
            'settings ok': (r) => r.status === 200,
            'commission exists': (r) => { try { return JSON.parse(r.body).data.commission_percent > 0; } catch { return false; } },
        });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 400);
    } else if (rnd < 0.7) {
        // Lookup real referral code
        const res = http.get(`${BASE}/api/referral/lookup/${REF_CODE}`, { headers: HEADERS, tags: { action: 'lookup' } });
        check(res, { 'lookup ok': (r) => r.status < 500 });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
    } else {
        // Check referral me (authenticated)
        const res = http.get(`${BASE}/api/referral/me`, {
            headers: { ...HEADERS, Authorization: 'Bearer stress_token_ref' },
            tags: { action: 'me' },
        });
        check(res, { 'me ok': (r) => r.status < 500 });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
    }
    sleep(Math.random() * 0.2);
}
