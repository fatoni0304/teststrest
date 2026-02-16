// k6/film-detail-test.js — Full user flow: list → detail → episodes → stream
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://dracinshort.xyz';
const errorRate = new Rate('errors');
const detailLatency = new Trend('detail_latency');
const streamLatency = new Trend('stream_latency');
const flowComplete = new Counter('flows_completed');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': `${BASE}/`,
};

export const options = {
    vus: 500,
    duration: '60s',
    thresholds: {
        http_req_duration: ['p(95)<8000'],
        errors: ['rate<0.2'],
    },
};

// Real bookIds from live trending data
const REAL_BOOK_IDS = ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320', '41000122939', '42000004216', '42000004671', '42000005043', '42000005239'];

export default function () {
    let bookId = REAL_BOOK_IDS[Math.floor(Math.random() * REAL_BOOK_IDS.length)];

    // Step 1: Browse trending (where user finds dramas)
    group('browse_trending', () => {
        const res = http.get(`${BASE}/api/dramabox/trending`, { headers: HEADERS, tags: { step: 'trending' } });
        check(res, {
            'trending ok': (r) => r.status === 200,
            'has dramas': (r) => { try { return JSON.parse(r.body).data.results.length > 0; } catch { return false; } },
        });
        errorRate.add(res.status >= 400);

        // Use real bookId from response
        try {
            const data = JSON.parse(res.body);
            if (data.data?.results?.length > 0) {
                bookId = data.data.results[Math.floor(Math.random() * data.data.results.length)].bookId;
            }
        } catch { }
        sleep(1 + Math.random() * 2);
    });

    // Step 2: View drama detail
    group('view_detail', () => {
        const res = http.get(`${BASE}/api/dramabox/detail?bookId=${bookId}`, { headers: { ...HEADERS, Referer: `${BASE}/watch/dramabox/${bookId}` }, tags: { step: 'detail' } });
        check(res, {
            'detail loaded': (r) => r.status < 500,
        });
        detailLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(1 + Math.random() * 2);
    });

    // Step 3: Get all episodes
    group('get_episodes', () => {
        const res = http.get(`${BASE}/api/dramabox/allstreams?bookId=${bookId}`, { headers: { ...HEADERS, Referer: `${BASE}/watch/dramabox/${bookId}` }, tags: { step: 'episodes' } });
        check(res, {
            'episodes loaded': (r) => r.status < 500,
        });
        detailLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(0.5 + Math.random());
    });

    // Step 4: Stream first episode
    group('stream_ep1', () => {
        const res = http.get(`${BASE}/api/dramabox/stream?bookId=${bookId}&episode=1`, { headers: { ...HEADERS, Referer: `${BASE}/watch/dramabox/${bookId}` }, tags: { step: 'stream' } });
        check(res, {
            'stream loaded': (r) => r.status < 500,
        });
        streamLatency.add(res.timings.duration);
        errorRate.add(res.status >= 500);
        sleep(3 + Math.random() * 5); // Watch for 3-8s
    });

    flowComplete.add(1);
}
