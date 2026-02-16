// k6/streaming-flow.js — Watch session: browse → pick → watch multiple episodes
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';

const errorRate = new Rate('errors');
const streamLatency = new Trend('stream_latency');
const episodesWatched = new Counter('episodes_watched');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': `${BASE}/`,
};

const REAL_BOOK_IDS = ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320', '41000122939', '42000004216', '42000004671', '42000005043', '42000005239'];

const SOURCES = [
    { name: 'dramabox', listPath: '/api/dramabox/trending', detailParam: 'bookId', streamParam: 'bookId' },
    { name: 'reelshort', listPath: '/api/reelshort/trending', detailParam: 'bookId', streamParam: 'bookId' },
    { name: 'dramawave', listPath: '/api/dramawave/home', detailParam: 'id', streamParam: 'id' },
];

export const options = {
    stages: [
        { duration: '30s', target: 30 },
        { duration: '2m', target: 150 },
        { duration: '3m', target: 300 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<8000'],
        errors: ['rate<0.2'],
        stream_latency: ['p(95)<10000'],
    },
};

export default function () {
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const params = { headers: BROWSER_HEADERS };
    let contentId = REAL_BOOK_IDS[Math.floor(Math.random() * REAL_BOOK_IDS.length)];

    // Step 1: Browse content list
    group('01_Browse', () => {
        const res = http.get(`${BASE}${source.listPath}`, { ...params, tags: { source: source.name, step: 'browse' } });
        check(res, {
            'browse ok': (r) => r.status === 200,
            'has content': (r) => { try { const d = JSON.parse(r.body); return d.success || d.data; } catch { return false; } },
        });
        errorRate.add(res.status >= 400);

        // Try to extract a real ID
        try {
            const data = JSON.parse(res.body);
            const results = data.data?.results || data.data?.list || data.data?.data || [];
            if (Array.isArray(results) && results.length > 0) {
                const item = results[Math.floor(Math.random() * results.length)];
                contentId = item.bookId || item.id || item.shortPlayId || contentId;
            }
        } catch { }
        sleep(3 + Math.random() * 4); // Browse 3-7s
    });

    // Step 2: Get all episodes
    let episodeCount = 3;
    group('02_All_Episodes', () => {
        const res = http.get(`${BASE}/api/${source.name}/allstreams?${source.detailParam}=${contentId}`, {
            ...params, tags: { source: source.name, step: 'allstreams' },
        });
        check(res, { 'episodes loaded': (r) => r.status < 500 });
        errorRate.add(res.status >= 500);

        try {
            const data = JSON.parse(res.body);
            const eps = data.data?.episodes || data.data?.list || [];
            if (Array.isArray(eps)) episodeCount = Math.min(eps.length, 5);
        } catch { }
        sleep(1 + Math.random() * 2);
    });

    // Step 3: Watch episodes sequentially (like a real user)
    const epsToWatch = Math.min(episodeCount, 3); // Watch 1-3 episodes
    for (let ep = 1; ep <= epsToWatch; ep++) {
        group(`03_Watch_Ep${ep}`, () => {
            const res = http.get(`${BASE}/api/${source.name}/stream?${source.streamParam}=${contentId}&episode=${ep}`, {
                ...params, tags: { source: source.name, step: `stream_ep${ep}` },
            });
            check(res, {
                [`ep${ep} loaded`]: (r) => r.status < 500,
            });
            streamLatency.add(res.timings.duration);
            errorRate.add(res.status >= 500);
            episodesWatched.add(1);

            // Simulate watching: 10-30s per episode
            sleep(10 + Math.random() * 20);
        });
    }
}
