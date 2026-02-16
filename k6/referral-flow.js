// k6/referral-flow.js — Referral system stress test with real flow
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const REF_CODE = 'CY5DXWJP';

const errorRate = new Rate('errors');
const refLatency = new Trend('referral_latency');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': `${BASE}/register?ref=${REF_CODE}`,
    'Origin': BASE,
    'Content-Type': 'application/json',
};

export const options = {
    stages: [
        { duration: '20s', target: 30 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 50 },
        { duration: '20s', target: 0 },
    ],
    thresholds: {
        errors: ['rate<0.3'],
        referral_latency: ['p(95)<5000'],
    },
};

export default function () {
    // Step 1: Get referral settings
    group('01_Referral_Settings', () => {
        const res = http.get(`${BASE}/api/referral/settings`, { headers: BROWSER_HEADERS, tags: { step: 'ref_settings' } });
        check(res, {
            'settings ok': (r) => r.status === 200,
            'has commission': (r) => { try { return JSON.parse(r.body).data.commission_percent > 0; } catch { return false; } },
        });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 400);
        sleep(1);
    });

    // Step 2: Lookup referral code
    group('02_Lookup_Code', () => {
        const res = http.get(`${BASE}/api/referral/lookup/${REF_CODE}`, { headers: BROWSER_HEADERS, tags: { step: 'lookup' } });
        check(res, {
            'lookup ok': (r) => r.status < 500,
            'code found': (r) => { try { return JSON.parse(r.body).success !== false; } catch { return true; } },
        });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(1 + Math.random());
    });

    // Step 3: Register with referral
    group('03_Register_With_Ref', () => {
        const uid = `reftest_${__VU}_${__ITER}_${Date.now()}`;
        const payload = JSON.stringify({
            username: uid,
            password: 'RefTest123!',
            email: `${uid}@reftest.dev`,
            referralCode: REF_CODE
        });
        const res = http.post(`${BASE}/api/auth/register`, payload, { headers: BROWSER_HEADERS, tags: { step: 'register' } });
        check(res, {
            'register ok': (r) => r.status < 500,
        });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(1);
    });

    // Step 4: VIP plans (user considering upgrade)
    group('04_VIP_Plans', () => {
        const res = http.get(`${BASE}/api/vip/plans`, { headers: BROWSER_HEADERS, tags: { step: 'vip_plans' } });
        check(res, {
            'plans ok': (r) => r.status === 200,
            'has plans': (r) => { try { return JSON.parse(r.body).data.plans.length > 0; } catch { return false; } },
        });
        refLatency.add(res.timings.duration);
        errorRate.add(res.status >= 400);
        sleep(2 + Math.random() * 3);
    });
}
