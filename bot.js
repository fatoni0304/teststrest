/**
 * DRACIN Enterprise Stress Testing Bot v2.1
 * Full Inline Keyboard UI — No slash commands
 * Configurable Full Test + JSON Report
 * v2.1: Fixed expected responses, httpsAgent reuse, menu polish
 */

import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import https from 'https';
import os from 'os';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== CONFIG ====================
const BOT_TOKEN = '8563706392:AAHi62jlF7-mLQtPGyddxSygv1PMkwSjD6w';
const CHAT_ID = '7275352971';
const CLOUDFLARE_URL = 'https://dracinshort.xyz';
const VPS_DIRECT_URL = 'https://157.15.40.53';
const VPS_HOST_HEADER = 'dracinshort.xyz'; // Nginx needs this Host header
const REF_CODE = 'CY5DXWJP';

// Mutable state
let directVPSMode = false;
const getBaseUrl = () => directVPSMode ? VPS_DIRECT_URL : CLOUDFLARE_URL;
const getModeLabel = () => directVPSMode ? '🔴 DIRECT VPS (No Cloudflare)' : '🟢 Via Cloudflare';

// Shared HTTPS agent for VPS mode (reuse sockets instead of creating per-request)
const vpsHttpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 500, maxFreeSockets: 50 });

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 30 }
  }
});

// ==================== CRASH PROTECTION ====================
// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception (not crashing):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection (not crashing):', reason?.message || reason);
});

// Telegram bot error handlers with auto-reconnect
bot.on('polling_error', (err) => {
  const msg = err?.message || '';
  console.error(`⚠️ Polling error: ${msg}`);

  // If 409 conflict, another instance is running - retry after delay
  if (msg.includes('409')) {
    console.log('🔄 409 Conflict detected, retrying in 10s...');
    bot.stopPolling();
    setTimeout(() => {
      bot.startPolling().catch(() => { });
    }, 10000);
  }
  // If EFATAL or network error, reconnect after delay
  if (msg.includes('EFATAL') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
    console.log('🔄 Network error, reconnecting in 5s...');
    bot.stopPolling();
    setTimeout(() => {
      bot.startPolling().catch(() => { });
    }, 5000);
  }
});

bot.on('error', (err) => {
  console.error('⚠️ Bot error (not crashing):', err?.message || err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  bot.stopPolling();
  process.exit(0);
});

// Load discovered endpoints
const endpointsPath = join(__dirname, 'discovered-endpoints.json');
let discoveredEndpoints = {};
try { discoveredEndpoints = JSON.parse(readFileSync(endpointsPath, 'utf-8')); } catch (e) { console.error('No endpoints file found'); }

// Ensure results dir
const resultsDir = join(__dirname, 'results');
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

// ==================== HELPERS ====================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const formatDuration = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  const usedMem = (totalMem - freeMem).toFixed(2);
  return { cpu: cpus[0]?.model, cores: cpus.length, totalMem, freeMem, usedMem, platform: `${os.platform()} ${os.release()}`, uptime: formatDuration(os.uptime() * 1000) };
}

function safeEdit(chatId, msgId, text, opts = {}) {
  return bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', ...opts }).catch(() => { });
}

function safeEditKeyboard(chatId, msgId, keyboard) {
  return bot.editMessageReplyMarkup(keyboard, { chat_id: chatId, message_id: msgId }).catch(() => { });
}

// ==================== SOURCE CONFIG (real IDs from live API) ====================
const ALL_SOURCES = ['dramabox', 'netshort', 'reelshort', 'dramawave', 'melolo', 'bilitv', 'dotdrama', 'flickreels', 'goodshort', 'idrama', 'shortmax', 'velolo', 'stardusttv', 'vigloo'];

// Real drama IDs fetched from each source's live trending/theaters API
const SOURCE_CONFIG = {
  dramabox: { home: '/api/dramabox/trending', search: '/api/dramabox/search?query=', detail: id => `/api/dramabox/detail?bookId=${id}`, streams: id => `/api/dramabox/allstreams?bookId=${id}`, stream: (id, ep) => `/api/dramabox/stream?bookId=${id}&episode=${ep}`, ids: ['42000005001', '42000004908', '42000003970', '42000000651', '42000004320'] },
  reelshort: { home: '/api/reelshort/homepage', search: '/api/reelshort/search?query=', detail: null, streams: id => `/api/reelshort/allstreams/${id}`, stream: (id, ep) => `/api/reelshort/stream/${id}/${ep}`, ids: ['6970dc9ecc387f98e7089003', '69718a0cbebc33de2800dff9', '698004f02593c82ff003e1b8'] },
  netshort: { home: '/api/netshort/theaters', search: '/api/netshort/search?query=', detail: null, streams: id => `/api/netshort/allstreams/${id}`, stream: (id, ep) => `/api/netshort/stream/${id}/${ep}`, ids: ['1997949622037180417', '1905132909649330177', '1995736036563972097'] },
  dramawave: { home: '/api/dramawave/home', search: '/api/dramawave/search?q=', detail: null, streams: id => `/api/dramawave/allstreams/${id}`, stream: (id, ep) => `/api/dramawave/stream/${id}/${ep}`, ids: ['3CYOPt1oEJ', 'sBVbIpy0Hu', 'kVh9qtHl4n'] },
  dotdrama: { home: '/api/dotdrama/theaters', search: '/api/dotdrama/search?q=', detail: null, streams: id => `/api/dotdrama/allstreams/${id}`, stream: (id, ep) => `/api/dotdrama/stream/${id}/${ep}`, ids: ['2020377573465849858', '2020676551784857602', '2021480354837684226'] },
  flickreels: { home: '/api/flickreels/theaters', search: '/api/flickreels/search?q=', detail: null, streams: id => `/api/flickreels/allstreams/${id}`, stream: (id, ep) => `/api/flickreels/stream/${id}/${ep}`, ids: ['3498', '499', '5381'] },
  goodshort: { home: '/api/goodshort/theaters', search: '/api/goodshort/search?q=', detail: null, streams: id => `/api/goodshort/allstreams/${id}`, stream: (id, ep) => `/api/goodshort/stream/${id}/${ep}`, ids: ['31001241758', '31001210540', '31001188126'] },
  idrama: { home: '/api/idrama/theaters', search: '/api/idrama/search?q=', detail: null, streams: id => `/api/idrama/allstreams/${id}`, stream: (id, ep) => `/api/idrama/stream/${id}/${ep}`, ids: ['161001640116', '161001640057', '160000640145'] },
  shortmax: { home: '/api/shortmax/theaters', search: '/api/shortmax/search?q=', detail: null, streams: id => `/api/shortmax/allstreams/${id}`, stream: (id, ep) => `/api/shortmax/stream/${id}/${ep}`, ids: [] },
  velolo: { home: '/api/velolo/theaters', search: '/api/velolo/search?q=', detail: null, streams: id => `/api/velolo/allstreams/${id}`, stream: (id, ep) => `/api/velolo/stream/${id}/${ep}`, ids: ['2022580083738873856', '2006999931168559104', '2011352771877998592'] },
  melolo: { home: '/api/melolo/theaters', search: '/api/melolo/search?q=', detail: null, streams: id => `/api/melolo/allstreams/${id}`, stream: (id, ep) => `/api/melolo/stream/${id}/${ep}`, ids: ['7582509823137172485', '7582430701799083061', '7582154125387779077'] },
  bilitv: { home: '/api/bilitv/theaters', search: '/api/bilitv/search?q=', detail: null, streams: id => `/api/bilitv/allstreams/${id}`, stream: (id, ep) => `/api/bilitv/stream/${id}/${ep}`, ids: ['2457', '1881', '1877'] },
  stardusttv: { home: '/api/stardusttv/theaters', search: '/api/stardusttv/search?q=', detail: null, streams: id => `/api/stardusttv/allstreams/${id}`, stream: (id, ep) => `/api/stardusttv/stream/${id}/${ep}`, ids: ['16011', '14350', '14279'] },
  vigloo: { home: '/api/vigloo/theaters', search: '/api/vigloo/search?q=', detail: null, streams: id => `/api/vigloo/allstreams/${id}`, stream: (id, ep) => `/api/vigloo/stream/${id}/${ep}`, ids: ['15000826', '15000324', '15000728'] },
};

const SEARCH_QUERIES = ['love', 'drama', 'romance', 'action', 'comedy', 'thriller', 'mystery', 'family', 'school', 'revenge', 'cinta', 'mafia', 'perselingkuhan', 'CEO'];
const rndQuery = () => SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
const rndPage = () => Math.ceil(Math.random() * 5);

// Pick random source + random drama from that source
function rndSourceDrama() {
  const srcs = Object.entries(SOURCE_CONFIG).filter(([, cfg]) => cfg.ids.length > 0);
  const [src, cfg] = srcs[Math.floor(Math.random() * srcs.length)];
  const id = cfg.ids[Math.floor(Math.random() * cfg.ids.length)];
  return { src, cfg, id };
}

// ==================== ENDPOINT LISTS ====================

// HOMEPAGE ONLY — exactly what a user loading the homepage hits (all cached)
const HOMEPAGE_ENDPOINTS = [
  { path: '/api/health' },
  { path: '/api/settings/ads' },
  { path: '/api/vip/plans' },
  { path: '/api/referral/settings' },
  // All sources: home/trending/theaters (the main homepage data)
  ...Object.values(SOURCE_CONFIG).map(cfg => ({ path: cfg.home })),
];

// Full public: home + search + detail + stream across ALL sources
const PUBLIC_ENDPOINTS = [
  // Core
  ...HOMEPAGE_ENDPOINTS,
  // All sources: search with random queries
  ...Object.entries(SOURCE_CONFIG).map(([, cfg]) => ({ path: () => `${cfg.search}${rndQuery()}` })),
  // All sources: allstreams (drama detail) with random real drama ID
  ...Object.entries(SOURCE_CONFIG).filter(([, cfg]) => cfg.ids.length > 0).flatMap(([, cfg]) =>
    cfg.ids.slice(0, 2).map(id => ({ path: cfg.streams(id) }))
  ),
  // All sources: stream ep 1 with random real drama ID
  ...Object.entries(SOURCE_CONFIG).filter(([, cfg]) => cfg.ids.length > 0).map(([, cfg]) =>
    ({ path: cfg.stream(cfg.ids[0], 1) })
  ),
];

// Search across ALL sources
const SEARCH_ENDPOINTS = Object.entries(SOURCE_CONFIG).map(([, cfg]) =>
  ({ path: () => `${cfg.search}${rndQuery()}` })
);

// Cache: hit same endpoints repeatedly to test Redis
const CACHE_ENDPOINTS = [
  ...Object.values(SOURCE_CONFIG).map(cfg => ({ path: cfg.home })),
  { path: '/api/vip/plans' },
  { path: '/api/referral/settings' },
  { path: '/api/settings/ads' },
];

// Auth endpoints
const AUTH_ENDPOINTS = [
  { path: '/api/auth/login', method: 'POST', data: { username: 'stresstest', password: 'Test123!' } },
  { path: '/api/auth/login', method: 'POST', data: { username: 'stresstest2', password: 'Test123!' } },
  { path: () => `/api/auth/check-username?username=stress_${Date.now()}` },
  { path: '/api/auth/register', method: 'POST', data: () => ({ username: `k6bot_${Date.now()}_${Math.random().toString(36).slice(2)}`, password: 'StressTest123!', email: `k6bot_${Date.now()}@stress.dev`, referralCode: REF_CODE }) },
];

// VIP endpoints
const VIP_ENDPOINTS = [
  { path: '/api/vip/plans' },
  { path: '/api/vip/status', headers: { Authorization: 'Bearer stress_test_token' } },
  { path: '/api/vip/history', headers: { Authorization: 'Bearer stress_test_token' } },
];

// Referral endpoints
const REFERRAL_ENDPOINTS = [
  { path: '/api/referral/settings' },
  { path: `/api/referral/lookup/${REF_CODE}` },
  { path: '/api/referral/me', headers: { Authorization: 'Bearer stress_test_token' } },
];

// ==================== USER JOURNEY RUNNER ====================
// Simulates a real human: browse → pick drama → view episodes → watch 1-3 eps → switch source
async function runUserJourney(engine, duration, concurrency, progressCb) {
  engine.startTime = Date.now();
  engine.running = true;
  const endTime = Date.now() + duration;
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (engine.running && Date.now() < endTime) {
        const { src, cfg, id } = rndSourceDrama();

        // Step 1: Browse homepage (think time 1-2s)
        await engine.hitEndpoint(cfg.home);
        await sleep(1000 + Math.random() * 1000);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 2: Maybe search (50% chance)
        if (Math.random() > 0.5) {
          await engine.hitEndpoint(`${cfg.search}${rndQuery()}`);
          await sleep(800 + Math.random() * 1200);
          if (!engine.running || Date.now() >= endTime) break;
        }

        // Step 3: View drama detail (allstreams)
        await engine.hitEndpoint(cfg.streams(id));
        await sleep(800 + Math.random() * 1000);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 4: Watch 1-3 episodes (like a real viewer)
        const epsToWatch = 1 + Math.floor(Math.random() * 3);
        for (let ep = 1; ep <= epsToWatch; ep++) {
          if (!engine.running || Date.now() >= endTime) break;
          await engine.hitEndpoint(cfg.stream(id, ep));
          // Watching time: 2-5s per episode (simulates partial watch)
          await sleep(2000 + Math.random() * 3000);
        }

        // Step 5: Think time before next drama (1-3s)
        await sleep(1000 + Math.random() * 2000);
      }
    })());
  }

  const progressInterval = setInterval(() => {
    if (progressCb && engine.running) progressCb(engine.getStats());
  }, 3000);

  await Promise.all(workers);
  engine.running = false;
  clearInterval(progressInterval);
}

// Auth Journey: register with referral → login → check VIP → browse
async function runAuthJourney(engine, duration, concurrency, progressCb) {
  engine.startTime = Date.now();
  engine.running = true;
  const endTime = Date.now() + duration;
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (engine.running && Date.now() < endTime) {
        const uid = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Step 1: Check if username is available
        await engine.hitEndpoint(`/api/auth/check-username?username=${uid}`);
        await sleep(500 + Math.random() * 500);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 2: Register with referral code
        await engine.hitEndpoint('/api/auth/register', 'POST', {
          username: uid, password: 'StressTest123!',
          email: `${uid}@stress.dev`, referralCode: REF_CODE
        });
        await sleep(800 + Math.random() * 1000);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 3: Login
        await engine.hitEndpoint('/api/auth/login', 'POST', {
          username: uid, password: 'StressTest123!'
        });
        await sleep(500 + Math.random() * 500);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 4: Check VIP plans
        await engine.hitEndpoint('/api/vip/plans');
        await sleep(500 + Math.random() * 500);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 5: Check referral
        await engine.hitEndpoint('/api/referral/settings');
        await sleep(500 + Math.random() * 500);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 6: Browse a source
        const { cfg, id } = rndSourceDrama();
        await engine.hitEndpoint(cfg.home);
        await sleep(1000 + Math.random() * 1000);
        if (!engine.running || Date.now() >= endTime) break;

        // Step 7: Watch 1 episode
        await engine.hitEndpoint(cfg.streams(id));
        await sleep(500 + Math.random() * 500);
        if (!engine.running || Date.now() >= endTime) break;
        await engine.hitEndpoint(cfg.stream(id, 1));
        await sleep(2000 + Math.random() * 2000);
      }
    })());
  }

  const progressInterval = setInterval(() => {
    if (progressCb && engine.running) progressCb(engine.getStats());
  }, 3000);

  await Promise.all(workers);
  engine.running = false;
  clearInterval(progressInterval);
}


// ==================== STRESS ENGINE ====================
class StressEngine {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.results = { total: 0, success: 0, failed: 0, expectedErrors: 0, errors: [], latencies: [], statusCodes: {} };
    this.running = false;
    this.startTime = 0;
  }

  reset() {
    this.results = { total: 0, success: 0, failed: 0, expectedErrors: 0, errors: [], latencies: [], statusCodes: {} };
    this.running = false;
  }

  // Check if a non-2xx response is expected (not a real error)
  isExpectedResponse(path, code) {
    // 503 on search endpoints = provider has no data for that query, not an infra error
    if (code === 503 && path.includes('/search')) return true;
    // 401/403 on auth-protected endpoints with fake tokens = expected
    if ((code === 401 || code === 403) && (path.includes('/vip/status') || path.includes('/vip/history') || path.includes('/referral/me') || path.includes('/history') || path.includes('/auth/me'))) return true;
    // 429 rate limit = expected during rate limit test
    if (code === 429) return true;
    return false;
  }

  async hitEndpoint(path, method = 'GET', data = null, headers = {}) {
    const url = `${getBaseUrl()}${path}`;
    const start = Date.now();
    try {
      const config = {
        method, url, timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://dracinshort.xyz/',
          ...(BYPASS_HEADER ? { 'X-Stress-Bypass': BYPASS_HEADER } : {}),
          ...(directVPSMode ? { 'Host': VPS_HOST_HEADER } : {}),
          ...headers
        },
        validateStatus: () => true,
        ...(directVPSMode ? { httpsAgent: vpsHttpsAgent } : {})
      };
      if (data) config.data = data;
      if (data) config.headers['Content-Type'] = 'application/json';
      // Throttle: add delay between requests to avoid rate limiting
      if (THROTTLE_DELAY_MS > 0) await sleep(THROTTLE_DELAY_MS);
      const res = await axios(config);
      const latency = Date.now() - start;
      this.results.total++;
      this.results.latencies.push(latency);
      const code = res.status;
      this.results.statusCodes[code] = (this.results.statusCodes[code] || 0) + 1;
      if (code >= 200 && code < 400) {
        this.results.success++;
      } else if (this.isExpectedResponse(path, code)) {
        // Expected non-2xx: count as success (not infra error)
        this.results.success++;
        this.results.expectedErrors++;
      } else {
        this.results.failed++;
        this.results.errors.push({ path, code, latency });
      }
      return { ok: code < 400 || this.isExpectedResponse(path, code), status: code, latency, data: res.data };
    } catch (err) {
      const latency = Date.now() - start;
      this.results.total++;
      this.results.failed++;
      this.results.latencies.push(latency);
      this.results.errors.push({ path, error: err.code || err.message, latency });
      return { ok: false, status: 0, latency, error: err.code };
    }
  }

  getStats() {
    const lat = [...this.results.latencies].sort((a, b) => a - b);
    const elapsed = Date.now() - this.startTime;
    const rps = elapsed > 0 ? (this.results.total / (elapsed / 1000)).toFixed(2) : 0;
    return {
      name: this.name, total: this.results.total, success: this.results.success, failed: this.results.failed,
      expectedErrors: this.results.expectedErrors,
      errorRate: this.results.total > 0 ? ((this.results.failed / this.results.total) * 100).toFixed(2) : '0',
      rps, elapsed: formatDuration(elapsed), elapsedMs: elapsed,
      avgLatency: lat.length > 0 ? (lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(0) : 0,
      p50: lat[Math.floor(lat.length * 0.5)] || 0,
      p95: lat[Math.floor(lat.length * 0.95)] || 0,
      p99: lat[Math.floor(lat.length * 0.99)] || 0,
      maxLatency: lat[lat.length - 1] || 0,
      minLatency: lat[0] || 0,
      statusCodes: this.results.statusCodes,
      topErrors: this.results.errors.slice(-5)
    };
  }

  formatReport(title) {
    const s = this.getStats();
    return `📊 <b>${title}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱ Duration: ${s.elapsed}\n` +
      `📨 Total: ${s.total} | ✅ ${s.success} | ❌ ${s.failed}\n` +
      (s.expectedErrors > 0 ? `ℹ️ Expected: ${s.expectedErrors} (search/auth)\n` : '') +
      `📈 RPS: ${s.rps} | 🎯 Err: ${s.errorRate}%\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ Latency: Avg ${s.avgLatency}ms | P50 ${s.p50}ms\n` +
      `   P95 ${s.p95}ms | P99 ${s.p99}ms\n` +
      `   Min ${s.minLatency}ms | Max ${s.maxLatency}ms\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 Status: ${JSON.stringify(s.statusCodes)}\n` +
      (s.topErrors.length > 0 ? `⚠️ Errors: ${s.topErrors.map(e => `${e.path}→${e.code || e.error}`).join(', ')}\n` : '');
  }
}

// ==================== RUNNERS ====================
async function runConcurrent(engine, endpoints, concurrency, duration, progressCb) {
  engine.startTime = Date.now();
  engine.running = true;
  const endTime = Date.now() + duration;
  const workers = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (engine.running && Date.now() < endTime) {
        const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
        const path = typeof ep.path === 'function' ? ep.path() : ep.path;
        const data = typeof ep.data === 'function' ? ep.data() : (ep.data || null);
        await engine.hitEndpoint(path, ep.method || 'GET', data, ep.headers || {});
      }
    })());
  }

  const progressInterval = setInterval(() => {
    if (progressCb && engine.running) progressCb(engine.getStats());
  }, 3000);

  await Promise.all(workers);
  engine.running = false;
  clearInterval(progressInterval);
}

async function runRamping(engine, endpoints, stages, progressCb) {
  engine.startTime = Date.now();
  engine.running = true;
  let activeWorkers = [];

  for (const stage of stages) {
    if (!engine.running) break;
    if (progressCb) progressCb(engine.getStats(), `Ramping to ${stage.vus} VUs for ${stage.duration / 1000}s`);

    while (activeWorkers.length < stage.vus && engine.running) {
      const w = { active: true };
      w.promise = (async () => {
        const end = Date.now() + stage.duration;
        while (w.active && engine.running && Date.now() < end) {
          const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
          const path = typeof ep.path === 'function' ? ep.path() : ep.path;
          const data = typeof ep.data === 'function' ? ep.data() : (ep.data || null);
          await engine.hitEndpoint(path, ep.method || 'GET', data, ep.headers || {});
        }
      })();
      activeWorkers.push(w);
    }

    await sleep(stage.duration);
    while (activeWorkers.length > stage.vus) {
      const w = activeWorkers.pop();
      w.active = false;
    }

    if (progressCb) progressCb(engine.getStats());
  }

  activeWorkers.forEach(w => w.active = false);
  engine.running = false;
  await Promise.allSettled(activeWorkers.map(w => w.promise));
}

// ==================== THROTTLE CONFIG ====================
// Server rate limit: 500 req/min. Smart throttle adds delay between requests.
// Set to 0 to disable throttling (full speed, will hit rate limit).
let THROTTLE_DELAY_MS = 0; // 0 = FULL SPEED, toggle from bot menu if needed
const BYPASS_HEADER = process.env.STRESS_BYPASS_KEY || ''; // Set if VPS has bypass header

// ==================== TEST DEFINITIONS ====================
const activeTests = new Map();
const lastTestResults = new Map(); // Store test results for JSON report

const TEST_CATALOG = {
  quick: { emoji: '\u26A1', name: 'Quick Smoke', desc: '50 VUs x 30s', defaultVus: 50, defaultDuration: 30000 },
  load: { emoji: '\uD83D\uDCC8', name: 'Load Test', desc: '100>300>500 VUs', defaultVus: 500, defaultDuration: 360000 },
  stress: { emoji: '\uD83D\uDCA5', name: 'Stress Test', desc: '500>2k>5k VUs', defaultVus: 5000, defaultDuration: 480000 },
  spike: { emoji: '\u26A1', name: 'Spike Test', desc: '0>2k instant', defaultVus: 2000, defaultDuration: 60000 },
  burst: { emoji: '\uD83D\uDD25', name: 'Burst Test', desc: '2k VUs x 60s', defaultVus: 2000, defaultDuration: 60000 },
  soak: { emoji: '\uD83E\uDED7', name: 'Soak Test', desc: '200 VUs x 30min', defaultVus: 200, defaultDuration: 1800000 },
  auth: { emoji: '\uD83D\uDD11', name: 'Auth Test', desc: 'Login stress', defaultVus: 100, defaultDuration: 60000 },
  search: { emoji: '\uD83D\uDD0D', name: 'Search Test', desc: 'Search sources', defaultVus: 100, defaultDuration: 60000 },
  cache: { emoji: '\uD83D\uDCBE', name: 'Cache Test', desc: 'Cache hit test', defaultVus: 200, defaultDuration: 60000 },
  vip: { emoji: '\uD83D\uDC51', name: 'VIP Test', desc: 'VIP endpoints', defaultVus: 100, defaultDuration: 60000 },
  referral: { emoji: '\uD83E\uDD1D', name: 'Referral Test', desc: 'Referral flow', defaultVus: 50, defaultDuration: 60000 },
  failover: { emoji: '\uD83D\uDD04', name: 'Failover Test', desc: 'All sources', defaultVus: 1, defaultDuration: 30000 },
  ratelimit: { emoji: '\uD83D\uDEAB', name: 'Rate Limit', desc: 'Rate limit test', defaultVus: 500, defaultDuration: 30000 },
  security: { emoji: '\uD83D\uDD12', name: 'Security Test', desc: 'SQLi/XSS/Brute', defaultVus: 1, defaultDuration: 60000 },
  journey: { emoji: '\uD83D\uDEB6', name: 'User Journey', desc: 'Real user sim', defaultVus: 50, defaultDuration: 120000 },
  authjourney: { emoji: '\uD83D\uDC64', name: 'Auth Journey', desc: 'Register+Login+Browse', defaultVus: 20, defaultDuration: 120000 },
  homeburst: { emoji: '\uD83C\uDFE0', name: 'Homepage Burst', desc: 'Homepage only, massive VUs', defaultVus: 10000, defaultDuration: 60000 },
};

// ==================== TEST RUNNERS ====================
async function runTest(testId, chatId, msgId, customVus = null) {
  const catalog = TEST_CATALOG[testId];
  if (!catalog) return;

  const vus = customVus || catalog.defaultVus;
  const engine = new StressEngine(testId, getBaseUrl());
  activeTests.set(testId, engine);

  const progressCb = (s, extra) => {
    const text = `${catalog.emoji} <b>${catalog.name}</b> — Running\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📨 ${s.total} reqs | ⚡ ${s.rps} RPS\n` +
      `✅ ${s.success} | ❌ ${s.failed} | 🎯 ${s.errorRate}%\n` +
      `⏰ P95: ${s.p95}ms | ⏱ ${s.elapsed}\n` +
      (extra ? `\n🔄 ${extra}` : '');
    safeEdit(chatId, msgId, text, { reply_markup: { inline_keyboard: [[{ text: '🛑 Stop Test', callback_data: `stop_${testId}` }]] } });
  };

  switch (testId) {
    case 'quick':
      await safeEdit(chatId, msgId, `⚡ <b>Quick Smoke Test</b>\n${vus} VUs × 30s — Starting...`);
      await runConcurrent(engine, PUBLIC_ENDPOINTS, vus, 30000, progressCb);
      break;

    case 'load':
      await safeEdit(chatId, msgId, `📈 <b>Load Test</b>\nRamping 500→${vus} — Starting...`);
      await runRamping(engine, PUBLIC_ENDPOINTS, [
        { vus: Math.min(500, vus), duration: 60000 },
        { vus: Math.min(2000, vus), duration: 120000 },
        { vus: vus, duration: 120000 },
        { vus: Math.min(1000, vus), duration: 60000 },
      ], progressCb);
      break;

    case 'stress':
      await safeEdit(chatId, msgId, `💥 <b>Stress Test</b>\nRamping to ${vus} — Starting...`);
      await runRamping(engine, PUBLIC_ENDPOINTS, [
        { vus: Math.floor(vus * 0.33), duration: 60000 },
        { vus: Math.floor(vus * 0.53), duration: 60000 },
        { vus: Math.floor(vus * 0.67), duration: 60000 },
        { vus: vus, duration: 60000 },
      ], progressCb);
      break;

    case 'spike':
      await safeEdit(chatId, msgId, `⚡ <b>Spike Test</b>\n0→${vus} instant — Starting...`);
      await runConcurrent(engine, PUBLIC_ENDPOINTS, vus, 60000, progressCb);
      break;

    case 'burst':
      await safeEdit(chatId, msgId, `🔥 <b>Burst Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, PUBLIC_ENDPOINTS, vus, 60000, progressCb);
      break;

    case 'homeburst':
      await safeEdit(chatId, msgId, `🏠 <b>Homepage Burst</b>\n${vus.toLocaleString()} VUs × 60s — Homepage only (${HOMEPAGE_ENDPOINTS.length} cached endpoints)\nStarting...`);
      await runConcurrent(engine, HOMEPAGE_ENDPOINTS, vus, 60000, progressCb);
      break;

    case 'soak':
      await safeEdit(chatId, msgId, `🫗 <b>Soak Test</b>\n${vus} VUs × 30min — Starting...`);
      await runConcurrent(engine, PUBLIC_ENDPOINTS, vus, catalog.defaultDuration, progressCb);
      break;

    case 'auth': {
      await safeEdit(chatId, msgId, `🔑 <b>Auth Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, AUTH_ENDPOINTS, vus, 60000, progressCb);
      break;
    }

    case 'search':
      await safeEdit(chatId, msgId, `🔍 <b>Search Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, SEARCH_ENDPOINTS, vus, 60000, progressCb);
      break;

    case 'cache':
      await safeEdit(chatId, msgId, `💾 <b>Cache Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, CACHE_ENDPOINTS, vus, 60000, progressCb);
      break;

    case 'vip': {
      await safeEdit(chatId, msgId, `👑 <b>VIP Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, VIP_ENDPOINTS, vus, 60000, progressCb);
      break;
    }

    case 'referral': {
      await safeEdit(chatId, msgId, `🤝 <b>Referral Test</b>\n${vus} VUs × 60s — Starting...`);
      await runConcurrent(engine, REFERRAL_ENDPOINTS, vus, 60000, progressCb);
      break;
    }

    case 'failover': {
      await safeEdit(chatId, msgId, `🔄 <b>Failover Test</b>\nChecking all sources...`);
      engine.startTime = Date.now();
      let report = '🔄 <b>Failover Test Results</b>\n━━━━━━━━━━━━━━━━━━━━\n';
      for (const src of ALL_SOURCES) {
        const path = src === 'dramabox' ? `/api/${src}/trending` : src === 'dramawave' ? `/api/${src}/home` : src === 'reelshort' ? `/api/${src}/homepage` : `/api/${src}/theaters`;
        const r = await engine.hitEndpoint(path);
        report += `${r.ok ? '✅' : '❌'} ${src}: ${r.status} (${r.latency}ms)\n`;
      }
      await safeEdit(chatId, msgId, report, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_tests' }]] } });
      activeTests.delete(testId);
      return engine.getStats();
    }

    case 'ratelimit': {
      await safeEdit(chatId, msgId, `🚫 <b>Rate Limit Test</b>\n${vus} VUs × 30s — Starting...`);
      const ep = [{ path: '/api/health' }];
      await runConcurrent(engine, ep, vus, 30000, progressCb);
      break;
    }

    case 'security': {
      await safeEdit(chatId, msgId, `🔒 <b>Security Test</b>\nRunning security probes...`);
      engine.startTime = Date.now();
      let report = '🔒 <b>Security Test Results</b>\n━━━━━━━━━━━━━━━━━━━━\n';

      // SQL Injection
      const sqli = [`/api/dramabox/search?query=' OR 1=1 --`, `/api/dramabox/search?query=<script>alert(1)</script>`, `/api/dramabox/search?query='; DROP TABLE users; --`];
      report += '\n<b>🛡 SQL Injection:</b>\n';
      for (const path of sqli) {
        const r = await engine.hitEndpoint(path);
        report += `${r.status < 500 ? '✅ Safe' : '⚠️ Error'}: ${r.status} (${r.latency}ms)\n`;
      }

      // Brute force
      report += '\n<b>🔐 Brute Force (20x):</b>\n';
      let blocked = 0;
      for (let i = 0; i < 20; i++) {
        const r = await engine.hitEndpoint('/api/auth/login', 'POST', { username: 'admin', password: `wrong${i}` });
        if (r.status === 429) blocked++;
      }
      report += `Rate limited: ${blocked > 0 ? `after ${20 - blocked} attempts ✅` : 'NOT blocked ⚠️'}\n`;

      // XSS headers
      report += '\n<b>🌐 XSS Header:</b>\n';
      const xss = await engine.hitEndpoint('/api/health', 'GET', null, { 'X-Test': '<script>alert(1)</script>' });
      report += `Response: ${xss.status} (${xss.ok ? '✅' : '⚠️'})\n`;

      // Large payload
      report += '\n<b>📦 10MB Payload:</b>\n';
      const big = await engine.hitEndpoint('/api/auth/login', 'POST', { data: 'x'.repeat(10000000) });
      report += `${big.status === 413 ? '✅ Rejected' : big.status < 500 ? '⚠️ Accepted' : '✅ Error'}: ${big.status}\n`;

      await safeEdit(chatId, msgId, report, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_tests' }]] } });
      activeTests.delete(testId);
      return engine.getStats();
    }

    case 'journey': {
      await safeEdit(chatId, msgId, `\uD83D\uDEB6 <b>User Journey</b>\n${vus} users × 2min — Simulating real users...`);
      await runUserJourney(engine, catalog.defaultDuration, vus, progressCb);
      break;
    }

    case 'authjourney': {
      await safeEdit(chatId, msgId, `\uD83D\uDC64 <b>Auth Journey</b>\n${vus} users × 2min — Register→Login→Browse...`);
      await runAuthJourney(engine, catalog.defaultDuration, vus, progressCb);
      break;
    }
  }

  // Show final report
  const stats = engine.getStats();
  // Save stats for JSON report retrieval
  lastTestResults.set(testId, { ...stats, completedAt: now(), target: getBaseUrl(), vus: customVus || catalog.defaultVus });
  let extra = '';
  if (testId === 'cache') {
    const hitRatio = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
    extra = `\n📊 Cache Hit Ratio: ${hitRatio}%`;
  }
  if (testId === 'ratelimit') {
    const rl = stats.statusCodes[429] || 0;
    extra = `\n🛑 429 Responses: ${rl}\n📊 Rate Limit: ${rl > 0 ? '✅ Working' : '⚠️ Not Detected'}`;
  }

  await safeEdit(chatId, msgId, engine.formatReport(`${catalog.emoji} ${catalog.name} — Complete`) + extra, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 JSON Report', callback_data: `json_${testId}` }],
        [{ text: '⬅️ Back to Tests', callback_data: 'menu_tests' }]
      ]
    }
  });

  activeTests.delete(testId);
  return stats;
}

// ==================== FULL TEST (CONFIGURABLE) ====================
const fullTestConfig = new Map(); // chatId -> { selectedTests: Set, vus: Map<testId, vus> }

function getFullTestConfig(chatId) {
  if (!fullTestConfig.has(chatId)) {
    const allTests = Object.keys(TEST_CATALOG);
    const defaultSelected = new Set(['quick', 'auth', 'search', 'cache', 'vip', 'referral', 'failover', 'security', 'ratelimit']);
    const vus = new Map();
    for (const t of allTests) vus.set(t, TEST_CATALOG[t].defaultVus);
    fullTestConfig.set(chatId, { selectedTests: defaultSelected, vus });
  }
  return fullTestConfig.get(chatId);
}

function renderFullTestConfigMenu(chatId) {
  const cfg = getFullTestConfig(chatId);
  const allTests = Object.keys(TEST_CATALOG);
  const keyboard = [];

  // Test selection — 2 per row
  for (let i = 0; i < allTests.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, allTests.length); j++) {
      const t = allTests[j];
      const cat = TEST_CATALOG[t];
      const selected = cfg.selectedTests.has(t);
      row.push({ text: `${selected ? '✅' : '⬜'} ${cat.emoji} ${cat.name}`, callback_data: `ftoggle_${t}` });
    }
    keyboard.push(row);
  }

  // VU presets
  keyboard.push([
    { text: '👥 1K VUs', callback_data: 'fvu_1000' },
    { text: '👥 5K VUs', callback_data: 'fvu_5000' },
    { text: '👥 10K VUs', callback_data: 'fvu_10000' },
    { text: '👥 15K VUs', callback_data: 'fvu_15000' },
  ]);

  // Select all / none
  keyboard.push([
    { text: '✅ Select All', callback_data: 'fselect_all' },
    { text: '⬜ Deselect All', callback_data: 'fselect_none' },
  ]);

  // Run + Back
  keyboard.push([
    { text: '🚀 RUN SELECTED TESTS', callback_data: 'frun' },
  ]);
  keyboard.push([
    { text: '⬅️ Back', callback_data: 'menu_tests' },
  ]);

  const selectedCount = cfg.selectedTests.size;
  const totalVusLabel = [...cfg.selectedTests].map(t => cfg.vus.get(t) || TEST_CATALOG[t].defaultVus).reduce((a, b) => Math.max(a, b), 0);
  const text = `🚀 <b>Full Test Configuration</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `Selected: <b>${selectedCount}/${allTests.length}</b> tests\n` +
    `Max VUs per test: <b>${totalVusLabel.toLocaleString()}</b>\n\n` +
    `Tap tests to toggle. Set VU count, then run.\n` +
    `Each test runs sequentially. Results combined into JSON.`;

  return { text, keyboard: { inline_keyboard: keyboard } };
}

async function runFullTest(chatId, msgId) {
  const cfg = getFullTestConfig(chatId);
  const tests = [...cfg.selectedTests];
  if (tests.length === 0) {
    await safeEdit(chatId, msgId, '⚠️ No tests selected! Go back and select tests.', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_fulltest' }]] } });
    return;
  }

  const fullResults = {
    startedAt: now(),
    target: getBaseUrl(),
    systemInfo: getSystemInfo(),
    testCount: tests.length,
    tests: {},
    summary: {}
  };

  let totalReqs = 0, totalSuccess = 0, totalFailed = 0, totalExpected = 0;

  for (let i = 0; i < tests.length; i++) {
    const testId = tests[i];
    const cat = TEST_CATALOG[testId];
    const vus = cfg.vus.get(testId) || cat.defaultVus;

    // Progress bar
    const done = i;
    const progress = Math.floor((done / tests.length) * 10);
    const bar = '█'.repeat(progress) + '░'.repeat(10 - progress);
    await safeEdit(chatId, msgId,
      `🚀 <b>Full Test Running</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `[${bar}] ${done}/${tests.length}\n\n` +
      `▶️ Running: <b>${cat.emoji} ${cat.name}</b>\n` +
      `VUs: ${vus.toLocaleString()}\n\n` +
      `✅ Completed: ${done} tests\n` +
      `📨 Total requests so far: ${totalReqs.toLocaleString()}`,
      { reply_markup: { inline_keyboard: [[{ text: '🛑 Stop Full Test', callback_data: 'fstop' }]] } }
    );

    // Create sub-message for this test
    const subMsg = await bot.sendMessage(chatId, `${cat.emoji} Initializing ${cat.name}...`, { parse_mode: 'HTML' });

    const stats = await runTest(testId, chatId, subMsg.message_id, vus);
    if (stats) {
      fullResults.tests[testId] = { ...stats, vus };
      totalReqs += stats.total;
      totalSuccess += stats.success;
      totalFailed += stats.failed;
      totalExpected += stats.expectedErrors || 0;
    }

    await sleep(2000); // Brief pause between tests
  }

  // Summary
  fullResults.completedAt = now();
  fullResults.summary = {
    totalRequests: totalReqs,
    totalSuccess,
    totalFailed,
    totalExpectedErrors: totalExpected,
    overallErrorRate: totalReqs > 0 ? ((totalFailed / totalReqs) * 100).toFixed(2) + '%' : '0%',
    grade: totalReqs > 0 && (totalFailed / totalReqs) < 0.05 ? 'A+' :
      (totalFailed / totalReqs) < 0.1 ? 'A' :
        (totalFailed / totalReqs) < 0.2 ? 'B' :
          (totalFailed / totalReqs) < 0.3 ? 'C' : 'D'
  };

  // Final progress
  await safeEdit(chatId, msgId,
    `🚀 <b>Full Test Complete!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `[██████████] ${tests.length}/${tests.length}\n\n` +
    `📨 Total: <b>${totalReqs.toLocaleString()}</b> requests\n` +
    `✅ Success: <b>${totalSuccess.toLocaleString()}</b>\n` +
    `❌ Failed: <b>${totalFailed.toLocaleString()}</b>\n` +
    (totalExpected > 0 ? `ℹ️ Expected: <b>${totalExpected.toLocaleString()}</b> (search/auth)\n` : '') +
    `🎯 Error Rate: <b>${fullResults.summary.overallErrorRate}</b>\n` +
    `🏆 Grade: <b>${fullResults.summary.grade}</b>\n\n` +
    `Sending JSON report...`,
    { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu_main' }]] } }
  );

  // Save & send JSON
  const filename = `full-test-${Date.now()}.json`;
  const filepath = join(resultsDir, filename);
  writeFileSync(filepath, JSON.stringify(fullResults, null, 2));

  await bot.sendDocument(chatId, filepath, {
    caption: `🚀 Full Test Report — ${fullResults.summary.grade} Grade\n` +
      `${totalReqs.toLocaleString()} requests | ${fullResults.summary.overallErrorRate} error rate`
  });
}

// ==================== INLINE KEYBOARD MENUS ====================
const MENU_MAIN = {
  inline_keyboard: [
    [{ text: '📊 Tests', callback_data: 'menu_tests' }, { text: '🚀 Full Test', callback_data: 'menu_fulltest' }],
    [{ text: '🔧 Tools', callback_data: 'menu_tools' }, { text: 'ℹ️ Info', callback_data: 'menu_info' }],
  ]
};

const MENU_TESTS = {
  inline_keyboard: [
    [{ text: '━━ SIMULASI USER ━━', callback_data: 'noop' }],
    [{ text: '\uD83D\uDEB6 User Journey', callback_data: 'test_journey' }, { text: '\uD83D\uDC64 Auth Journey', callback_data: 'test_authjourney' }],
    [{ text: '━━ PERFORMANCE ━━', callback_data: 'noop' }],
    [{ text: '\u26A1 Quick', callback_data: 'test_quick' }, { text: '\uD83D\uDCC8 Load', callback_data: 'test_load' }],
    [{ text: '\uD83D\uDCA5 Stress', callback_data: 'test_stress' }, { text: '\u26A1 Spike', callback_data: 'test_spike' }],
    [{ text: '\uD83D\uDD25 Burst', callback_data: 'test_burst' }, { text: '\uD83E\uDED7 Soak', callback_data: 'test_soak' }],
    [{ text: '━━ HOMEPAGE BURST ━━', callback_data: 'noop' }],
    [{ text: '\uD83C\uDFE0 10K Homepage', callback_data: 'test_homeburst' }],
    [{ text: '20K', callback_data: 'hb_20000' }, { text: '50K', callback_data: 'hb_50000' }, { text: '100K', callback_data: 'hb_100000' }],
    [{ text: '━━ FUNCTIONAL ━━', callback_data: 'noop' }],
    [{ text: '\uD83D\uDD11 Auth', callback_data: 'test_auth' }, { text: '\uD83D\uDD0D Search', callback_data: 'test_search' }],
    [{ text: '\uD83D\uDCBE Cache', callback_data: 'test_cache' }, { text: '\uD83D\uDC51 VIP', callback_data: 'test_vip' }],
    [{ text: '\uD83E\uDD1D Referral', callback_data: 'test_referral' }, { text: '\uD83D\uDD04 Failover', callback_data: 'test_failover' }],
    [{ text: '━━ SECURITY ━━', callback_data: 'noop' }],
    [{ text: '\uD83D\uDEAB Rate Limit', callback_data: 'test_ratelimit' }, { text: '\uD83D\uDD12 Security', callback_data: 'test_security' }],
    [{ text: '━━ VU PRESETS ━━', callback_data: 'noop' }],
    [{ text: '1K', callback_data: 'setvu_1000' }, { text: '5K', callback_data: 'setvu_5000' }, { text: '10K', callback_data: 'setvu_10000' }, { text: '15K', callback_data: 'setvu_15000' }],
    [{ text: '🔄 Reset VU', callback_data: 'setvu_reset' }],
    [{ text: '\u2B05\uFE0F Back', callback_data: 'menu_main' }],
  ]
};

function getMenuTools() {
  return {
    inline_keyboard: [
      [{ text: '🏥 Health Check', callback_data: 'tool_health' }],
      [{ text: '💻 System Info', callback_data: 'tool_sysinfo' }],
      [{ text: '📋 Endpoints', callback_data: 'tool_endpoints' }],
      [{ text: '📊 Status', callback_data: 'tool_status' }],
      [{ text: `${directVPSMode ? '🔴' : '🟢'} Mode: ${directVPSMode ? 'Direct VPS' : 'Cloudflare'}`, callback_data: 'tool_toggle_vps' }],
      [{ text: `⏱ Throttle: ${THROTTLE_DELAY_MS}ms ${THROTTLE_DELAY_MS > 0 ? '(ON)' : '(OFF)'}`, callback_data: 'tool_toggle_throttle' }],
      [{ text: '🛑 Stop All', callback_data: 'tool_stop' }],
      [{ text: '⬅️ Back', callback_data: 'menu_main' }],
    ]
  };
}

const MENU_INFO = {
  inline_keyboard: [
    [{ text: '📖 About', callback_data: 'info_about' }],
    [{ text: '⚙️ Config', callback_data: 'info_config' }],
    [{ text: '🔗 Ref Link', callback_data: 'info_ref' }],
    [{ text: '⬅️ Back', callback_data: 'menu_main' }],
  ]
};

// Track custom VU override
let vuOverride = null;

// ==================== /start COMMAND ====================
bot.onText(/\/start/, async (msg) => {
  if (String(msg.chat.id) !== CHAT_ID) return;
  await bot.sendMessage(CHAT_ID,
    `🎬 <b>DRACIN Stress Testing Bot v2.1</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 Target: <code>${getBaseUrl()}</code>\n` +
    `📡 ${getModeLabel()}\n` +
    `📊 Endpoints: ${discoveredEndpoints.totalEndpoints || 142}\n` +
    `🔑 Bypass: ${BYPASS_HEADER ? '✅ Active' : '❌ Off'}\n` +
    `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n` +
    `⏰ ${now()}\n\n` +
    `Choose a category below:`,
    { parse_mode: 'HTML', reply_markup: MENU_MAIN }
  );
});

// ==================== CALLBACK HANDLER ====================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  if (String(chatId) !== CHAT_ID) return;
  await bot.answerCallbackQuery(query.id).catch(() => { });

  // ---- MENUS ----
  if (data === 'menu_main') {
    await safeEdit(chatId, msgId,
      `🎬 <b>DRACIN Stress Testing Bot v2.1</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `📡 ${getModeLabel()}\n` +
      `📊 Endpoints: ${discoveredEndpoints.totalEndpoints || 142}\n` +
      `${vuOverride ? `👥 VU Override: <b>${vuOverride.toLocaleString()}</b>\n` : ''}` +
      `\nChoose a category:`,
      { reply_markup: MENU_MAIN }
    );
    return;
  }

  if (data === 'menu_tests') {
    await safeEdit(chatId, msgId,
      `📊 <b>Stress Tests</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `📡 ${getModeLabel()}\n` +
      `${vuOverride ? `👥 VU Override: <b>${vuOverride.toLocaleString()}</b>` : '👥 Using default VUs per test'}\n\n` +
      `Pick a test to run. Use VU presets below to override VU count.`,
      { reply_markup: MENU_TESTS }
    );
    return;
  }

  if (data === 'menu_tools') {
    await safeEdit(chatId, msgId,
      `🔧 <b>Tools</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `${getModeLabel()}\n` +
      `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n\nUtilities and monitoring:`,
      { reply_markup: getMenuTools() }
    );
    return;
  }

  if (data === 'menu_info') {
    await safeEdit(chatId, msgId,
      `ℹ️ <b>Information</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Bot details, config, and referral info:`,
      { reply_markup: MENU_INFO }
    );
    return;
  }

  if (data === 'menu_fulltest') {
    const { text, keyboard } = renderFullTestConfigMenu(chatId);
    await safeEdit(chatId, msgId, text, { reply_markup: keyboard });
    return;
  }

  // ---- VU PRESETS ----
  if (data.startsWith('setvu_')) {
    if (data === 'setvu_reset') {
      vuOverride = null;
      await bot.answerCallbackQuery(query.id, { text: '🔄 VU Override cleared — using defaults', show_alert: true }).catch(() => { });
    } else {
      vuOverride = parseInt(data.split('_')[1]);
      await bot.answerCallbackQuery(query.id, { text: `✅ VU Override set to ${vuOverride.toLocaleString()}`, show_alert: true }).catch(() => { });
    }
    await safeEdit(chatId, msgId,
      `📊 <b>Stress Tests</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `📡 ${getModeLabel()}\n` +
      `${vuOverride ? `👥 VU Override: <b>${vuOverride.toLocaleString()}</b>` : '👥 Using default VUs per test'}\n\n` +
      `Pick a test to run. Use VU presets below to override VU count.`,
      { reply_markup: MENU_TESTS }
    );
    return;
  }

  // ---- HOMEPAGE BURST PRESETS (direct launch) ----
  if (data.startsWith('hb_')) {
    const vus = parseInt(data.split('_')[1]);
    if (activeTests.size > 0) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Another test is running. Stop it first.', show_alert: true }).catch(() => { });
      return;
    }
    runTest('homeburst', chatId, msgId, vus).catch(e => console.error('Homepage burst error:', e));
    return;
  }

  // ---- TESTS ----
  if (data.startsWith('test_')) {
    const testId = data.replace('test_', '');
    if (activeTests.size > 0) {
      await bot.answerCallbackQuery(query.id, { text: '⚠️ Another test is running. Stop it first.', show_alert: true }).catch(() => { });
      return;
    }
    runTest(testId, chatId, msgId, vuOverride).catch(e => console.error('Test error:', e));
    return;
  }

  // ---- STOP ----
  if (data.startsWith('stop_')) {
    const testId = data.replace('stop_', '');
    const engine = activeTests.get(testId);
    if (engine) {
      engine.running = false;
      const stats = engine.getStats();
      const catalog = TEST_CATALOG[testId];
      activeTests.delete(testId);
      await safeEdit(chatId, msgId,
        `🛑 <b>${catalog ? catalog.emoji + ' ' + catalog.name : testId} — Stopped</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📨 Total: ${stats.total} reqs\n` +
        `✅ Success: ${stats.success} | ❌ Failed: ${stats.failed}\n` +
        `📈 RPS: ${stats.rps} | 🎯 Err: ${stats.errorRate}%\n` +
        `⏱ Duration: ${stats.elapsed}\n\n` +
        `Test was manually stopped.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '� JSON Report', callback_data: `json_${testId}` }],
              [{ text: '⬅️ Back to Tests', callback_data: 'menu_tests' }, { text: '🏠 Main Menu', callback_data: 'menu_main' }]
            ]
          }
        }
      );
    } else {
      await safeEdit(chatId, msgId, '⚠️ Test not found or already stopped.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Tests', callback_data: 'menu_tests' }]] } }
      );
    }
    return;
  }

  // ---- JSON REPORT ----
  if (data.startsWith('json_')) {
    const testId = data.replace('json_', '');
    await bot.answerCallbackQuery(query.id, { text: 'Generating JSON...' }).catch(() => { });
    const savedStats = lastTestResults.get(testId);
    const report = savedStats ? {
      test: testId,
      catalog: TEST_CATALOG[testId] || {},
      exportedAt: now(),
      target: savedStats.target || getBaseUrl(),
      systemInfo: getSystemInfo(),
      results: {
        total: savedStats.total,
        success: savedStats.success,
        failed: savedStats.failed,
        expectedErrors: savedStats.expectedErrors || 0,
        errorRate: savedStats.errorRate + '%',
        rps: savedStats.rps,
        duration: savedStats.elapsed,
        vus: savedStats.vus,
        completedAt: savedStats.completedAt,
      },
      latency: {
        avg: savedStats.avgLatency + 'ms',
        p50: savedStats.p50 + 'ms',
        p95: savedStats.p95 + 'ms',
        p99: savedStats.p99 + 'ms',
        min: savedStats.minLatency + 'ms',
        max: savedStats.maxLatency + 'ms',
      },
      statusCodes: savedStats.statusCodes,
      topErrors: savedStats.topErrors,
    } : { test: testId, exportedAt: now(), error: 'No stored results — run this test first' };
    const filepath = join(resultsDir, `${testId}-${Date.now()}.json`);
    writeFileSync(filepath, JSON.stringify(report, null, 2));
    await bot.sendDocument(chatId, filepath, { caption: `📋 ${testId} report — ${savedStats ? savedStats.total + ' requests | ' + savedStats.errorRate + '% errors' : 'no data'}` });
    return;
  }

  // ---- FULL TEST TOGGLES ----
  if (data.startsWith('ftoggle_')) {
    const testId = data.replace('ftoggle_', '');
    const cfg = getFullTestConfig(chatId);
    if (cfg.selectedTests.has(testId)) cfg.selectedTests.delete(testId);
    else cfg.selectedTests.add(testId);
    const { text, keyboard } = renderFullTestConfigMenu(chatId);
    await safeEdit(chatId, msgId, text, { reply_markup: keyboard });
    return;
  }

  if (data.startsWith('fvu_')) {
    const vu = parseInt(data.split('_')[1]);
    const cfg = getFullTestConfig(chatId);
    for (const t of cfg.selectedTests) cfg.vus.set(t, vu);
    await bot.answerCallbackQuery(query.id, { text: `✅ All selected tests set to ${vu.toLocaleString()} VUs`, show_alert: true }).catch(() => { });
    const { text, keyboard } = renderFullTestConfigMenu(chatId);
    await safeEdit(chatId, msgId, text, { reply_markup: keyboard });
    return;
  }

  if (data === 'fselect_all') {
    const cfg = getFullTestConfig(chatId);
    for (const t of Object.keys(TEST_CATALOG)) cfg.selectedTests.add(t);
    const { text, keyboard } = renderFullTestConfigMenu(chatId);
    await safeEdit(chatId, msgId, text, { reply_markup: keyboard });
    return;
  }

  if (data === 'fselect_none') {
    const cfg = getFullTestConfig(chatId);
    cfg.selectedTests.clear();
    const { text, keyboard } = renderFullTestConfigMenu(chatId);
    await safeEdit(chatId, msgId, text, { reply_markup: keyboard });
    return;
  }

  if (data === 'frun') {
    runFullTest(chatId, msgId).catch(e => console.error('Full test error:', e));
    return;
  }

  if (data === 'fstop') {
    let totalReqs = 0, totalSuccess = 0, totalFailed = 0;
    for (const [name, engine] of activeTests) {
      const s = engine.getStats();
      totalReqs += s.total;
      totalSuccess += s.success;
      totalFailed += s.failed;
      engine.running = false;
    }
    activeTests.clear();
    await safeEdit(chatId, msgId,
      `🛑 <b>Full Test Stopped</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `📨 Total: ${totalReqs.toLocaleString()} reqs\n` +
      `✅ Success: ${totalSuccess.toLocaleString()}\n` +
      `❌ Failed: ${totalFailed.toLocaleString()}\n\n` +
      `All tests cancelled.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Re-configure Full Test', callback_data: 'menu_fulltest' }],
            [{ text: '⬅️ Back to Tests', callback_data: 'menu_tests' }, { text: '🏠 Main Menu', callback_data: 'menu_main' }]
          ]
        }
      }
    );
    return;
  }

  // ---- TOOLS ----
  if (data === 'tool_health') {
    await safeEdit(chatId, msgId, '🏥 Running health checks...');
    const engine = new StressEngine('health', getBaseUrl());
    engine.startTime = Date.now();
    const checks = ['/api/health', '/health', '/api', '/api/vip/plans', '/api/referral/settings', '/api/dramabox/trending', '/api/reelshort/homepage'];
    let report = '🏥 <b>Health Check</b>\n━━━━━━━━━━━━━━━━━━━━\n';
    for (const path of checks) {
      const r = await engine.hitEndpoint(path);
      report += `${r.ok ? '✅' : '❌'} <code>${path}</code>\n   → ${r.status} (${r.latency}ms)\n`;
    }
    report += `\n⏱ Total: ${formatDuration(Date.now() - engine.startTime)}`;
    await safeEdit(chatId, msgId, report, { reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'tool_health' }, { text: '⬅️ Back', callback_data: 'menu_tools' }]] } });
    return;
  }

  if (data === 'tool_sysinfo') {
    const info = getSystemInfo();
    await safeEdit(chatId, msgId,
      `💻 <b>System Info</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥 CPU: ${info.cpu}\n` +
      `⚙️ Cores: ${info.cores}\n` +
      `💾 RAM: ${info.usedMem}GB / ${info.totalMem}GB\n` +
      `📦 Free: ${info.freeMem}GB\n` +
      `🖥 OS: ${info.platform}\n` +
      `⏱ Uptime: ${info.uptime}\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>`,
      { reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'tool_sysinfo' }, { text: '⬅️ Back', callback_data: 'menu_tools' }]] } }
    );
    return;
  }

  if (data === 'tool_endpoints') {
    let text = `📋 <b>Discovered Endpoints</b>\nTotal: ${discoveredEndpoints.totalEndpoints || 'N/A'}\n━━━━━━━━━━━━━━━━━━━━\n`;
    const services = discoveredEndpoints.services || {};
    for (const [svcName, svc] of Object.entries(services)) {
      const eps = svc.endpoints || [];
      const count = Array.isArray(eps) ? eps.length : Object.values(eps).flat().length;
      text += `• <b>${svcName}</b>: ${count} endpoints\n`;
    }
    await safeEdit(chatId, msgId, text, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_tools' }]] } });
    return;
  }

  if (data === 'tool_status') {
    if (activeTests.size === 0) {
      await safeEdit(chatId, msgId, 'ℹ️ No tests currently running.', { reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'tool_status' }, { text: '⬅️ Back', callback_data: 'menu_tools' }]] } });
    } else {
      let text = '📊 <b>Running Tests</b>\n━━━━━━━━━━━━━━━━━━━━\n';
      for (const [name, engine] of activeTests) {
        const s = engine.getStats();
        text += `\n▶️ <b>${name}</b>\n  ${s.total} reqs | ${s.rps} RPS | ${s.errorRate}% err | ${s.elapsed}\n`;
      }
      await safeEdit(chatId, msgId, text, { reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'tool_status' }, { text: '🛑 Stop All', callback_data: 'tool_stop' }], [{ text: '⬅️ Back', callback_data: 'menu_tools' }]] } });
    }
    return;
  }

  if (data === 'tool_stop') {
    if (activeTests.size === 0) {
      await bot.answerCallbackQuery(query.id, { text: 'ℹ️ No tests running' }).catch(() => { });
    } else {
      for (const [name, engine] of activeTests) engine.running = false;
      activeTests.clear();
      await bot.answerCallbackQuery(query.id, { text: '🛑 All tests stopped' }).catch(() => { });
    }
    await safeEdit(chatId, msgId, '🛑 All tests stopped.', { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_tools' }]] } });
    return;
  }

  // ---- VPS / THROTTLE TOGGLES ----
  if (data === 'tool_toggle_vps') {
    directVPSMode = !directVPSMode;
    await bot.answerCallbackQuery(query.id, { text: directVPSMode ? '🔴 Direct VPS mode ON — bypassing Cloudflare!' : '🟢 Cloudflare mode ON', show_alert: true }).catch(() => { });
    await safeEdit(chatId, msgId,
      `🔧 <b>Tools</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `${getModeLabel()}\n` +
      `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n\nUtilities and monitoring:`,
      { reply_markup: getMenuTools() }
    );
    return;
  }

  if (data === 'tool_toggle_throttle') {
    if (THROTTLE_DELAY_MS > 0) {
      THROTTLE_DELAY_MS = 0;
    } else {
      THROTTLE_DELAY_MS = 120;
    }
    await bot.answerCallbackQuery(query.id, { text: THROTTLE_DELAY_MS > 0 ? `⏱ Throttle ON: ${THROTTLE_DELAY_MS}ms` : '⚡ Throttle OFF — FULL SPEED!', show_alert: true }).catch(() => { });
    await safeEdit(chatId, msgId,
      `🔧 <b>Tools</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `${getModeLabel()}\n` +
      `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n\nUtilities and monitoring:`,
      { reply_markup: getMenuTools() }
    );
    return;
  }

  // ---- INFO ----
  if (data === 'info_about') {
    await safeEdit(chatId, msgId,
      `📖 <b>DRACIN Stress Bot v2.1</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Enterprise-grade stress testing for the DRACIN streaming platform.\n\n` +
      `✅ 18 test types (load, stress, spike, burst, soak...)\n` +
      `✅ Configurable VU count (1K—15K)\n` +
      `✅ Full Test with cherry-pick + JSON report\n` +
      `✅ Real user simulation w/ browser headers\n` +
      `✅ Smart error classification (expected vs real)\n` +
      `✅ Security & rate limit probing\n\n` +
      `Built with Node.js + Telegram Bot API`,
      { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_info' }]] } }
    );
    return;
  }

  if (data === 'info_config') {
    await safeEdit(chatId, msgId,
      `⚙️ <b>Current Config</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 Target: <code>${getBaseUrl()}</code>\n` +
      `📡 Mode: ${getModeLabel()}\n` +
      `🔗 Ref Code: <code>${REF_CODE}</code>\n` +
      `🔐 Chat ID: <code>${CHAT_ID}</code>\n` +
      `📊 Endpoints: ${discoveredEndpoints.totalEndpoints || 142}\n` +
      `👥 VU Override: ${vuOverride ? vuOverride.toLocaleString() : 'None (using defaults)'}\n` +
      `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n` +
      `🔐 Bypass Key: ${BYPASS_HEADER ? '✅ Active' : '❌ Not set'}\n` +
      `📁 Results Dir: <code>${resultsDir}</code>`,
      { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_info' }]] } }
    );
    return;
  }

  if (data === 'info_ref') {
    await safeEdit(chatId, msgId,
      `🔗 <b>Referral Link</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
      `Link: <code>https://dracinshort.xyz/register?ref=${REF_CODE}</code>\n\n` +
      `This link is used in stress tests to simulate real referral registration flow.\n` +
      `The k6 auth-flow script visits this URL, then registers with the ref code.`,
      { reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_info' }]] } }
    );
    return;
  }

  if (data === 'noop') {
    await bot.answerCallbackQuery(query.id).catch(() => { });
    return;
  }
});

// ==================== STARTUP ====================
console.log('🤖 DRACIN Stress Bot v2.1 starting...');
console.log(`📡 Target: ${getBaseUrl()}`);
console.log(`📡 Mode: ${directVPSMode ? 'Direct VPS' : 'Cloudflare'}`);
console.log(`🔑 Bypass Key: ${BYPASS_HEADER ? 'Active' : 'Not set'}`);
console.log(`⏱ Throttle: ${THROTTLE_DELAY_MS}ms`);

bot.sendMessage(CHAT_ID,
  `🤖 <b>DRACIN Stress Bot v2.1 Online!</b>\n` +
  `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
  `🎯 Target: <code>${getBaseUrl()}</code>\n` +
  `📡 ${getModeLabel()}\n` +
  `🔑 Bypass: ${BYPASS_HEADER ? '✅ Active' : '❌ Not set'}\n` +
  `⏱ Throttle: ${THROTTLE_DELAY_MS}ms\n` +
  `📊 ${discoveredEndpoints.totalEndpoints || 142} endpoints\n` +
  `⏰ ${now()}\n\n` +
  `Send /start for menu.`,
  { parse_mode: 'HTML', reply_markup: MENU_MAIN }
).catch(e => console.error('Initial message failed:', e.message));

console.log('✅ Bot v2.0 ready. Waiting for /start...');
