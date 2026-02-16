// k6/real-user-flow.js — Full realistic user journey
// Homepage → Browse → Search → Detail → Episodes → Stream
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const REF_URL = `${BASE}/register?ref=CY5DXWJP`;

const errorRate = new Rate('errors');
const pageLoad = new Trend('page_load_time');
const streamStart = new Trend('stream_start_time');
const journeyComplete = new Counter('completed_journeys');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': `${BASE}/`,
    'Origin': BASE,
};

// Real bookIds from trending
const REAL_BOOK_IDS = ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320', '41000122939', '42000004216', '42000004671', '42000005043', '42000005239'];
const SEARCH_TERMS = ['love', 'drama', 'romance', 'cinta', 'mafia', 'revenge', 'perselingkuhan', 'CEO', 'keluarga', 'misteri'];

export const options = {
    stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<5000'],
        errors: ['rate<0.15'],
        page_load_time: ['p(95)<3000'],
        stream_start_time: ['p(95)<8000'],
    },
};

export default function () {
    const params = { headers: BROWSER_HEADERS, tags: {} };

    // Step 1: Landing page — user visits the site
    group('01_Landing', () => {
        const res = http.get(`${BASE}/api/health`, { ...params, tags: { step: 'landing' } });
        check(res, { 'landing ok': (r) => r.status === 200 });
        pageLoad.add(res.timings.duration);
        errorRate.add(res.status >= 400);
        sleep(1 + Math.random() * 2); // Think time 1-3s
    });

    // Step 2: Browse trending
    let bookId = REAL_BOOK_IDS[Math.floor(Math.random() * REAL_BOOK_IDS.length)];
    group('02_Browse_Trending', () => {
        const res = http.get(`${BASE}/api/dramabox/trending`, { ...params, tags: { step: 'trending' } });
        check(res, {
            'trending 200': (r) => r.status === 200,
            'has results': (r) => { try { return JSON.parse(r.body).data.results.length > 0; } catch { return false; } },
        });
        pageLoad.add(res.timings.duration);
        errorRate.add(res.status >= 400);

        // Extract real bookId from response if possible
        try {
            const data = JSON.parse(res.body);
            if (data.data && data.data.results && data.data.results.length > 0) {
                bookId = data.data.results[Math.floor(Math.random() * data.data.results.length)].bookId;
            }
        } catch { }
        sleep(2 + Math.random() * 3); // Users browse 2-5s
    });

    // Step 3: Search
    group('03_Search', () => {
        const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
        const res = http.get(`${BASE}/api/dramabox/search?query=${q}`, { ...params, tags: { step: 'search' } });
        check(res, {
            'search 200': (r) => r.status === 200,
            'search has data': (r) => { try { return JSON.parse(r.body).success; } catch { return false; } },
        });
        pageLoad.add(res.timings.duration);
        errorRate.add(res.status >= 400);
        sleep(1 + Math.random() * 2);
    });

    // Step 4: View drama detail
    group('04_Drama_Detail', () => {
        const res = http.get(`${BASE}/api/dramabox/detail?bookId=${bookId}`, { ...params, tags: { step: 'detail' } });
        check(res, { 'detail loaded': (r) => r.status < 500 });
        pageLoad.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(2 + Math.random() * 3); // Read description 2-5s
    });

    // Step 5: Get all episodes
    group('05_Episodes', () => {
        const res = http.get(`${BASE}/api/dramabox/allstreams?bookId=${bookId}`, { ...params, tags: { step: 'episodes' } });
        check(res, { 'episodes loaded': (r) => r.status < 500 });
        pageLoad.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(1 + Math.random());
    });

    // Step 6: Watch first episode
    group('06_Stream', () => {
        const res = http.get(`${BASE}/api/dramabox/stream?bookId=${bookId}&episode=1`, { ...params, tags: { step: 'stream' } });
        check(res, { 'stream loaded': (r) => r.status < 500 });
        streamStart.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(5 + Math.random() * 10); // Watch 5-15s
    });

    journeyComplete.add(1);
}
