// k6/fallback-test.js — Test all source failover with real endpoints
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const timeouts = new Counter('timeouts');
const sourceLatency = new Trend('source_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${BASE}/`,
};

export const options = {
    vus: 200,
    duration: '120s',
    thresholds: {
        http_req_duration: ['p(95)<15000'],
        errors: ['rate<0.3'],
    },
};

const SOURCES = [
    { name: 'dramabox', path: '/api/dramabox/trending' },
    { name: 'netshort', path: '/api/netshort/theaters' },
    { name: 'reelshort', path: '/api/reelshort/homepage' },
    { name: 'dramawave', path: '/api/dramawave/home' },
    { name: 'dotdrama', path: '/api/dotdrama/theaters' },
    { name: 'flickreels', path: '/api/flickreels/theaters' },
    { name: 'goodshort', path: '/api/goodshort/theaters' },
    { name: 'idrama', path: '/api/idrama/theaters' },
    { name: 'melolo', path: '/api/melolo/theaters' },
    { name: 'bilitv', path: '/api/bilitv/theaters' },
    { name: 'shortmax', path: '/api/shortmax/theaters' },
    { name: 'velolo', path: '/api/velolo/theaters' },
    { name: 'stardusttv', path: '/api/stardusttv/theaters' },
    { name: 'vigloo', path: '/api/vigloo/theaters' },
];

export default function () {
    const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const res = http.get(`${BASE}${src.path}`, {
        headers: HEADERS,
        timeout: '15s',
        tags: { source: src.name },
    });

    if (res.timings.duration === 0) timeouts.add(1);

    check(res, {
        [`${src.name} responded`]: (r) => r.status > 0,
        [`${src.name} not 5xx`]: (r) => r.status < 500,
        [`${src.name} under 10s`]: (r) => r.timings.duration < 10000,
        [`${src.name} valid json`]: (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
    });

    sourceLatency.add(res.timings.duration);
    errorRate.add(res.status >= 500 || res.status === 0);
    sleep(0.3 + Math.random() * 0.5);
}
