// k6/search-test.js — Search stress across all sources
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const searchLatency = new Trend('search_latency');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': `${BASE}/`,
};

export const options = { vus: 500, duration: '60s', thresholds: { errors: ['rate<0.2'] } };

const QUERIES = ['love', 'drama', 'romance', 'cinta', 'action', 'comedy', 'thriller', 'mystery', 'family', 'revenge', 'mafia', 'CEO', 'school', 'perselingkuhan'];

const SOURCES = [
    { name: 'dramabox', param: 'query' },
    { name: 'netshort', param: 'query' },
    { name: 'reelshort', param: 'query', extra: '&page=1' },
    { name: 'dramawave', param: 'q' },
    { name: 'dotdrama', param: 'q' },
    { name: 'flickreels', param: 'q' },
    { name: 'goodshort', param: 'q' },
    { name: 'idrama', param: 'q' },
    { name: 'shortmax', param: 'q' },
    { name: 'velolo', param: 'q' },
    { name: 'melolo', param: 'q' },
    { name: 'bilitv', param: 'q' },
    { name: 'stardusttv', param: 'q' },
    { name: 'vigloo', param: 'q' },
];

export default function () {
    const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const url = `${BASE}/api/${src.name}/search?${src.param}=${encodeURIComponent(q)}${src.extra || ''}`;
    const res = http.get(url, { headers: HEADERS, tags: { source: src.name } });
    check(res, {
        'search ok': (r) => r.status < 500,
        'valid response': (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
    });
    searchLatency.add(res.timings.duration);
    errorRate.add(res.status >= 500);
    sleep(0.05 + Math.random() * 0.1);
}
