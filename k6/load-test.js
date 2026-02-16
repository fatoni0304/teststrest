// k6/load-test.js — Load test with real user behavior
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const latency = new Trend('req_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Referer': `${BASE}/`,
};

export const options = {
    stages: [
        { duration: '1m', target: 500 },
        { duration: '2m', target: 2000 },
        { duration: '3m', target: 5000 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<3000'],
        errors: ['rate<0.1'],
    },
};

const REAL_BOOK_IDS = ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320'];
const QUERIES = ['love', 'drama', 'cinta', 'romance', 'mafia', 'revenge'];

const ENDPOINTS = [
    () => '/api/health',
    () => '/api/dramabox/trending',
    () => `/api/dramabox/latest?page=${Math.ceil(Math.random() * 3)}`,
    () => `/api/dramabox/search?query=${QUERIES[Math.floor(Math.random() * QUERIES.length)]}`,
    () => `/api/dramabox/detail?bookId=${REAL_BOOK_IDS[Math.floor(Math.random() * REAL_BOOK_IDS.length)]}`,
    () => '/api/netshort/theaters',
    () => '/api/reelshort/homepage',
    () => '/api/reelshort/trending',
    () => '/api/dramawave/home',
    () => '/api/dramawave/recommend',
    () => '/api/dotdrama/theaters',
    () => '/api/flickreels/theaters',
    () => '/api/goodshort/theaters',
    () => '/api/idrama/theaters',
    () => '/api/vip/plans',
    () => '/api/referral/settings',
];

export default function () {
    const epFn = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const ep = epFn();
    const res = http.get(`${BASE}${ep}`, { headers: HEADERS, tags: { endpoint: ep.split('?')[0] } });
    check(res, {
        'status ok': (r) => r.status >= 200 && r.status < 400,
        'not 5xx': (r) => r.status < 500,
    });
    errorRate.add(res.status >= 400);
    latency.add(res.timings.duration);
    sleep(0.1 + Math.random() * 0.3);
}
