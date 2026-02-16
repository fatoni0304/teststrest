// k6/burst-10k.js — Burst test at extreme concurrency
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const latency = new Trend('req_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${BASE}/`,
};

export const options = {
    vus: 10000,
    duration: '60s',
    thresholds: { errors: ['rate<0.5'] },
};

const BOOK_IDS = ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320'];
const QUERIES = ['love', 'drama', 'cinta', 'romance'];

const EPS = [
    () => '/api/health',
    () => '/api/dramabox/trending',
    () => `/api/dramabox/search?query=${QUERIES[Math.floor(Math.random() * QUERIES.length)]}`,
    () => `/api/dramabox/allstreams?bookId=${BOOK_IDS[Math.floor(Math.random() * BOOK_IDS.length)]}`,
    () => '/api/reelshort/homepage',
    () => '/api/dramawave/home',
    () => '/api/netshort/theaters',
    () => '/api/vip/plans',
];

export default function () {
    const ep = EPS[Math.floor(Math.random() * EPS.length)]();
    const res = http.get(`${BASE}${ep}`, { headers: HEADERS });
    check(res, { 'ok': (r) => r.status < 500 });
    errorRate.add(res.status >= 500);
    latency.add(res.timings.duration);
}
