// k6/search-compare.js — Search across ALL sources with varied queries, validate structure
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const searchLatency = new Trend('search_latency');
const validResults = new Counter('valid_search_results');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': `${BASE}/`,
};

const SEARCH_QUERIES = ['love', 'drama', 'romance', 'cinta', 'action', 'comedy', 'revenge', 'mafia', 'CEO', 'family', 'keluarga', 'misteri', 'school', 'perselingkuhan'];

const SOURCES = [
    { name: 'dramabox', paramKey: 'query' },
    { name: 'netshort', paramKey: 'query' },
    { name: 'reelshort', paramKey: 'query', extraParam: '&page=1' },
    { name: 'dramawave', paramKey: 'q' },
    { name: 'dotdrama', paramKey: 'q' },
    { name: 'flickreels', paramKey: 'q' },
    { name: 'goodshort', paramKey: 'q' },
    { name: 'idrama', paramKey: 'q' },
    { name: 'shortmax', paramKey: 'q' },
    { name: 'velolo', paramKey: 'q' },
    { name: 'stardusttv', paramKey: 'q' },
    { name: 'vigloo', paramKey: 'q' },
    { name: 'melolo', paramKey: 'q' },
    { name: 'bilitv', paramKey: 'q' },
];

export const options = {
    stages: [
        { duration: '20s', target: 30 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '1m', target: 100 },
        { duration: '20s', target: 0 },
    ],
    thresholds: {
        errors: ['rate<0.2'],
        search_latency: ['p(95)<5000'],
    },
};

export default function () {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const extra = source.extraParam || '';

    group(`search_${source.name}`, () => {
        const url = `${BASE}/api/${source.name}/search?${source.paramKey}=${encodeURIComponent(query)}${extra}`;
        const res = http.get(url, {
            headers: BROWSER_HEADERS,
            tags: { source: source.name, query: query },
        });

        check(res, {
            'search responded': (r) => r.status > 0,
            'not server error': (r) => r.status < 500,
            'valid json': (r) => {
                try { JSON.parse(r.body); return true; } catch { return false; }
            },
            'has data field': (r) => {
                try {
                    const d = JSON.parse(r.body);
                    return d.data !== undefined || d.results !== undefined || d.success !== undefined;
                } catch { return false; }
            },
        });

        searchLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);

        if (res.status === 200) {
            try {
                const d = JSON.parse(res.body);
                if (d.data && (Array.isArray(d.data) ? d.data.length > 0 : d.data.results?.length > 0 || d.data.list?.length > 0)) {
                    validResults.add(1);
                }
            } catch { }
        }
    });

    sleep(1 + Math.random() * 2); // Think time between searches
}
