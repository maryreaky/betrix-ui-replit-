import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';
// import { HttpProxyAgent } from 'http-proxy-agent';
// import { HttpsProxyAgent } from 'https-proxy-agent';

const logger = new Logger('LiveScraper');

// lightweight UA list to rotate to reduce easy blocks
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

function pickUserAgent(opts = {}) {
  if (opts.userAgent) return opts.userAgent;
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// simple per-domain rate limiter
const domainLastRequest = new Map();
const DOMAIN_MIN_INTERVAL_MS = Number(process.env.LIVE_SCRAPER_MIN_INTERVAL_MS || 500);

// proxy rotation with agent caching
const proxies = (process.env.LIVE_SCRAPER_PROXIES || '')
  .split(',')
  .map(p => p.trim())
  .filter(p => p.length > 0);
let proxyIndex = 0;
const proxyAgentCache = new Map();

function getNextProxy() {
  if (proxies.length === 0) return null;
  const p = proxies[proxyIndex % proxies.length];
  proxyIndex++;
  return p;
}

function getProxyAgent(proxyUrl) {
  // Proxy agents disabled - not installed
  // if (!proxyUrl) return null;
  // 
  // // Return cached agent if available
  // if (proxyAgentCache.has(proxyUrl)) {
  //   return proxyAgentCache.get(proxyUrl);
  // }
  //
  // try {
  //   const isHttps = proxyUrl.startsWith('https://');
  //   const AgentClass = isHttps ? HttpsProxyAgent : HttpProxyAgent;
  //   const agent = new AgentClass(proxyUrl);
  //   proxyAgentCache.set(proxyUrl, agent);
  //   return agent;
  // } catch (e) {
  //   logger.warn(`Failed to create proxy agent for ${proxyUrl}: ${e.message}`);
  //   return null;
  // }
  return null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureRateLimit(url) {
  try {
    const host = new URL(url).host;
    const last = domainLastRequest.get(host) || 0;
    const now = Date.now();
    const delta = now - last;
    if (delta < DOMAIN_MIN_INTERVAL_MS) {
      await sleep(DOMAIN_MIN_INTERVAL_MS - delta + 10);
    }
    domainLastRequest.set(host, Date.now());
  } catch (e) { /* ignore malformed URLs */ }
}

async function retryFetchJson(url, opts = {}, attempts = 3, baseDelay = 300) {
  for (let i = 0; i < attempts; i++) {
    try {
      await ensureRateLimit(url);
      const headers = Object.assign({}, opts.headers || {}, { 'User-Agent': pickUserAgent(opts) });
      
      // Setup fetch options with proxy support
      const fetchOpts = { 
        timeout: opts.timeout || 8000, 
        ...opts, 
        headers,
        // Add rate-limiting headers to be respectful
        'X-Ratelimit-Bypass': 'false'
      };

      // Use proxy if available
      if (proxies.length > 0) {
        const proxy = getNextProxy();
        if (proxy) {
          const agent = getProxyAgent(proxy);
          if (agent) {
            fetchOpts.agent = agent;
            logger.debug(`Using proxy: ${proxy.replace(/:[^:]*@/, ':***@')} for ${new URL(url).hostname}`);
          }
        }
      }

      const res = await fetch(url, fetchOpts);
      
      // Check for rate limiting
      if (res.status === 429) {
        logger.warn(`Rate limited on ${url} (HTTP 429), attempt ${i+1}/${attempts}`);
        await sleep(baseDelay * Math.pow(2, i + 1)); // Exponential backoff
        continue;
      }

      if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
      return await res.json();
    } catch (e) {
      logger.warn(`retryFetchJson attempt ${i+1} failed for ${url}: ${e.message || e}`);
      if (i + 1 === attempts) return null;
      await sleep(baseDelay * Math.pow(2, i));
    }
  }
  return null;
}

const fetchJson = retryFetchJson;

// Try to enrich a single ESPN match using the public ESPN summary endpoint
export async function getEspnMatchStats(eventId, sport = 'soccer') {
  if (!eventId) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${encodeURIComponent(sport)}/summary?event=${encodeURIComponent(eventId)}`;
  const json = await fetchJson(url);
  if (!json || !json.competitions || !json.competitions[0]) return null;

  try {
    const comp = json.competitions[0];
    const status = comp.status && comp.status.type ? comp.status.type : {};
    const competitors = (comp.competitors || []).map(c => ({
      id: c.team?.id || null,
      name: c.team?.displayName || c.team?.name || c.displayName || c.name,
      homeAway: c.homeAway,
      score: c.score != null ? Number(c.score) : null
    }));

    // boxscore statistics (may be missing on some events)
    const box = comp.boxscore || {};
    const stats = {};
    if (box.teams && Array.isArray(box.teams)) {
      box.teams.forEach(t => {
        const teamId = t.team?.id || t.id || null;
        stats[teamId || t.team?.displayName || t.team?.name || t.name || t.team] = (t.statistics || []).map(s => ({ label: s.displayName || s.name, value: s.value }));
      });
    }

    // extract possession & minute if available
    let minute = null;
    try {
      minute = (status && (status.detail || status.shortDetail)) || (comp.status && comp.status.type && comp.status.type.name) || null;
    } catch (e) { minute = null; }

    return { eventId, status: status.description || status.detail || null, minute, competitors, stats };
  } catch (e) {
    logger.warn('Failed to parse ESPN summary', e.message || e);
    return null;
  }
}

// Try to fetch extra info from a ScoreBat URL (video embed pages)
export async function getScorebatMatchDetails(url, opts = {}) {
  if (!url) return null;
  try {
    await ensureRateLimit(url);
    const headers = Object.assign({}, opts?.headers || {}, { 'User-Agent': pickUserAgent(opts) });
    // retry pattern
    const attempts = opts.attempts || 3;
    let html = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, { timeout: opts.timeout || 8000, headers });
        if (!res.ok) throw new Error(`ScoreBat fetch failed ${res.status}`);
        html = await res.text();
        break;
      } catch (e) {
        logger.warn(`ScoreBat fetch attempt ${i+1} failed for ${url}: ${e.message || e}`);
        if (i + 1 < attempts) await sleep(200 * Math.pow(2, i));
      }
    }
    if (!html) throw new Error('ScoreBat fetch failed after retries');
    const $ = cheerioLoad(html);
    // ScoreBat pages often include JSON inside a script tag with match info
    const scripts = $('script').toArray();
    for (const s of scripts) {
      const txt = $(s).html() || '';
      const m = txt.match(/var matchData\s*=\s*(\{[\s\S]*?\});/);
      if (m && m[1]) {
        try {
          const j = JSON.parse(m[1]);
          return { title: j.title || null, date: j.date || null, videos: j.videos || null };
        } catch (e) { /* ignore parse errors */ }
      }
    }
    // Fallback: try to pick page title
    const title = $('title').text() || null;
    return { title };
  } catch (e) {
    logger.warn('ScoreBat details fetch failed', e.message || e);
    return null;
  }
}

// Enrich an array of match objects with available live stats asynchronously
export async function enrichMatchesWithLiveStats(matches = [], opts = {}) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const enriched = await Promise.all(matches.map(async (m) => {
    try {
      // If provider espn and id exists, attempt ESPN summary enrichment
      if (m.provider === 'espn' && m.id) {
        const stats = await getEspnMatchStats(m.id, opts.sport || 'football');
        if (stats) return { ...m, liveStats: stats };
      }

      // If provider scorebat and url exists, attempt to scrape details
      if (m.provider === 'scorebat' && m.url) {
        const details = await getScorebatMatchDetails(m.url);
        if (details) return { ...m, liveStats: details };
      }

      // generic best-effort: if title contains ' vs ' try to tag it
      if (!m.liveStats && (m.title || (m.home && m.away))) {
        return { ...m, liveStats: { note: 'No detailed live stats available', title: m.title || `${m.home} vs ${m.away}` } };
      }
      return m;
    } catch (e) {
      logger.warn('enrichMatchesWithLiveStats failed for match', e.message || e);
      return m;
    }
  }));
  return enriched;
}

export default { getEspnMatchStats, getScorebatMatchDetails, enrichMatchesWithLiveStats };
