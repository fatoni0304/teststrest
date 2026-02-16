// k6/auth-test.js — Auth stress test with realistic flows
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const authLatency = new Trend('auth_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Referer': `${BASE}/login`,
    'Origin': BASE,
};

export const options = {
    vus: 1000,
    duration: '60s',
    thresholds: {
        http_req_duration: ['p(95)<5000'],
        errors: ['rate<0.5'],
    },
};

export default function () {
    const rnd = Math.random();

    if (rnd < 0.5) {
        // Login attempt (most common action)
        group('login', () => {
            const payload = JSON.stringify({ username: `stress_user_${__VU}`, password: 'StressTest123!' });
            const res = http.post(`${BASE}/api/auth/login`, payload, { headers: HEADERS, tags: { action: 'login' } });
            check(res, {
                'login responded': (r) => r.status < 500,
                'login fast': (r) => r.timings.duration < 3000,
            });
            authLatency.add(res.timings.duration);
            errorRate.add(res.status >= 500);
        });
    } else if (rnd < 0.8) {
        // Username check
        group('check_username', () => {
            const res = http.get(`${BASE}/api/auth/check-username?username=stress_check_${__VU}_${__ITER}`, { headers: HEADERS, tags: { action: 'check' } });
            check(res, { 'check ok': (r) => r.status < 500 });
            authLatency.add(res.timings.duration);
            errorRate.add(res.status >= 500);
        });
    } else {
        // Register (creates load on DB writes)
        group('register', () => {
            const uid = `k6_${__VU}_${__ITER}_${Date.now()}`;
            const payload = JSON.stringify({ username: uid, password: 'StressTest123!', email: `${uid}@stress.dev` });
            const res = http.post(`${BASE}/api/auth/register`, payload, { headers: HEADERS, tags: { action: 'register' } });
            check(res, {
                'register responded': (r) => r.status < 500,
            });
            authLatency.add(res.timings.duration);
            errorRate.add(res.status >= 500);
        });
    }
    sleep(0.05 + Math.random() * 0.1);
}
