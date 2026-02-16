// k6/auth-flow.js — Realistic referral registration + auth flow
// Visit ref link → Register with ref code → Login → Check profile → Refresh token
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const REF_CODE = 'CY5DXWJP';

const errorRate = new Rate('errors');
const authLatency = new Trend('auth_latency');
const registrations = new Counter('registrations');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE}/register?ref=${REF_CODE}`,
    'Origin': BASE,
    'Content-Type': 'application/json',
};

export const options = {
    stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],
        errors: ['rate<0.3'],
        auth_latency: ['p(95)<3000'],
    },
};

export default function () {
    const uniqueId = `k6_${__VU}_${__ITER}_${Date.now()}`;
    const username = `stress_${uniqueId}`;
    const email = `${uniqueId}@stresstest.dev`;
    const password = 'StressTest123!';

    // Step 1: Visit referral link (simulated — check referral page loads)
    group('01_Visit_Referral', () => {
        const res = http.get(`${BASE}/register?ref=${REF_CODE}`, {
            headers: { ...BROWSER_HEADERS, Referer: 'https://google.com' },
            tags: { step: 'visit_ref' },
            redirects: 5,
        });
        check(res, { 'ref page loaded': (r) => r.status < 400 });
        errorRate.add(res.status >= 400);
        sleep(2 + Math.random() * 3); // User reads the page
    });

    // Step 2: Lookup referral code
    group('02_Lookup_Referral', () => {
        const res = http.get(`${BASE}/api/referral/lookup/${REF_CODE}`, {
            headers: BROWSER_HEADERS,
            tags: { step: 'lookup_ref' },
        });
        check(res, {
            'ref lookup ok': (r) => r.status === 200,
            'ref code valid': (r) => { try { return JSON.parse(r.body).success; } catch { return false; } },
        });
        authLatency.add(res.timings.duration);
        errorRate.add(res.status >= 400);
        sleep(1);
    });

    // Step 3: Check username availability
    group('03_Check_Username', () => {
        const res = http.get(`${BASE}/api/auth/check-username?username=${username}`, {
            headers: BROWSER_HEADERS,
            tags: { step: 'check_user' },
        });
        check(res, { 'username check ok': (r) => r.status < 500 });
        authLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(0.5);
    });

    // Step 4: Register with referral code
    let token = null;
    group('04_Register', () => {
        const payload = JSON.stringify({
            username: username,
            password: password,
            email: email,
            referralCode: REF_CODE
        });
        const res = http.post(`${BASE}/api/auth/register`, payload, {
            headers: BROWSER_HEADERS,
            tags: { step: 'register' },
        });
        check(res, {
            'register responded': (r) => r.status < 500,
            'register success or conflict': (r) => r.status === 200 || r.status === 201 || r.status === 409,
        });
        authLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        registrations.add(1);

        try {
            const data = JSON.parse(res.body);
            if (data.data && data.data.token) token = data.data.token;
        } catch { }
        sleep(1);
    });

    // Step 5: Login
    group('05_Login', () => {
        const payload = JSON.stringify({ username, password });
        const res = http.post(`${BASE}/api/auth/login`, payload, {
            headers: BROWSER_HEADERS,
            tags: { step: 'login' },
        });
        check(res, {
            'login responded': (r) => r.status < 500,
        });
        authLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);

        try {
            const data = JSON.parse(res.body);
            if (data.data && data.data.token) token = data.data.token;
        } catch { }
        sleep(1);
    });

    // Step 6: Check profile (if we got a token)
    if (token) {
        group('06_Profile', () => {
            const res = http.get(`${BASE}/api/auth/me`, {
                headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
                tags: { step: 'profile' },
            });
            check(res, {
                'profile loaded': (r) => r.status === 200,
                'has user data': (r) => { try { return JSON.parse(r.body).data.username; } catch { return false; } },
            });
            authLatency.add(res.timings.duration);
            errorRate.add(res.status >= 400);
            sleep(2);
        });

        // Step 7: Check referral status
        group('07_Referral_Status', () => {
            const res = http.get(`${BASE}/api/referral/me`, {
                headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
                tags: { step: 'ref_status' },
            });
            check(res, { 'referral status ok': (r) => r.status < 500 });
            authLatency.add(res.timings.duration);
            sleep(1);
        });
    }
}
