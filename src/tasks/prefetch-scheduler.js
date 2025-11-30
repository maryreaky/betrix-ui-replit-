/**
 * Prefetch scheduler: warms caches for free-data sources and publishes Redis notifications.
 * Configurable via env var PREFETCH_INTERVAL_SECONDS (default 60).
 * WARNING: setting this below ~10s may stress remote APIs and trigger rate limits.
 */
import { setTimeout as wait } from 'timers/promises';

export function startPrefetchScheduler({ redis, openLiga, rss, scorebat, footballData, sportsAggregator, intervalSeconds = null } = {}) {
  if (!redis) throw new Error('redis required');
  intervalSeconds = intervalSeconds || Number(process.env.PREFETCH_INTERVAL_SECONDS || 60);

  let running = false;
  let lastRun = 0;

  const safeSet = async (key, value, ttl) => {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl).catch(()=>{});
    } catch (e) { /* noop */ }
  };

  const job = async () => {
    if (running) return; // avoid overlap
    running = true;
    const ts = Date.now();
    const nowSec = Math.floor(ts / 1000);

    const maxBackoff = Number(process.env.PREFETCH_MAX_BACKOFF_SECONDS || 3600);
    const baseBackoff = Number(process.env.PREFETCH_BASE_BACKOFF_SECONDS || Math.max(1, intervalSeconds));

    const isAllowedToRun = async (type) => {
      try {
        const nxt = await redis.get(`prefetch:next:${type}`);
        if (!nxt) return true;
        const n = Number(nxt);
        return nowSec >= n;
      } catch (e) { return true; }
    };

    const recordSuccess = async (type) => {
      try { await redis.del(`prefetch:failures:${type}`); await redis.del(`prefetch:next:${type}`); } catch (e) {}
    };

    const recordFailure = async (type) => {
      try {
        const fails = await redis.incr(`prefetch:failures:${type}`).catch(()=>1);
        await redis.expire(`prefetch:failures:${type}`, 60 * 60 * 24).catch(()=>{});
        const delay = Math.min(maxBackoff, Math.pow(2, Math.max(0, fails - 1)) * baseBackoff);
        const next = nowSec + Math.max(1, Math.floor(delay));
        await redis.set(`prefetch:next:${type}`, String(next), 'EX', Math.min(maxBackoff + 60, Math.floor(delay) + 60)).catch(()=>{});
        return { fails, next, delay };
      } catch (e) { return null; }
    };
    try {
      // 1) News feeds - lightweight, good to run frequently
      if (rss) {
        try {
          if (!await isAllowedToRun('rss')) { /* skip due to backoff */ }
          else {
            const feeds = ['https://feeds.bbci.co.uk/sport/football/rss.xml', 'https://www.theguardian.com/football/rss', 'https://www.espn.com/espn/rss/football/news'];
            const r = await rss.fetchMultiple(feeds).catch(async (err) => { await recordFailure('rss'); throw err; });
            if (r) { await safeSet('prefetch:rss:football', { fetchedAt: ts, feeds: r }, 60); await recordSuccess('rss'); }
            await redis.publish('prefetch:updates', JSON.stringify({ type: 'rss', ts }));
          }
        } catch (e) {
          await redis.publish('prefetch:error', JSON.stringify({ type: 'rss', error: e.message || String(e), ts }));
          await recordFailure('rss');
        }
      }

      // 2) ScoreBat - lightweight when freeFeed
      if (scorebat) {
        try {
          if (!await isAllowedToRun('scorebat')) { /* skip due to backoff */ }
          else {
            const sb = await scorebat.freeFeed().catch(async (err) => { await recordFailure('scorebat'); throw err; });
            if (sb) { await safeSet('prefetch:scorebat:free', { fetchedAt: ts, data: sb }, 60); await recordSuccess('scorebat'); }
            await redis.publish('prefetch:updates', JSON.stringify({ type: 'scorebat', ts }));
          }
        } catch (e) {
          await redis.publish('prefetch:error', JSON.stringify({ type: 'scorebat', error: e.message || String(e), ts }));
          await recordFailure('scorebat');
        }
      }

      // 3) OpenLigaDB - small queries for popular leagues
      if (openLiga) {
        try {
          if (!await isAllowedToRun('openligadb')) { /* skip due to backoff */ }
          else {
            const leagues = await openLiga.getAvailableLeagues().catch(async (err) => { await recordFailure('openligadb'); throw err; });
            if (leagues) { await safeSet('prefetch:openligadb:leagues', { fetchedAt: ts, leagues }, 120); await recordSuccess('openligadb'); }
            // fetch recent matches for a short list of popular league shortcuts
            const popular = ['bl1','bl2','bl3','1bl','dfl','mls','epl','pd1'];
            for (const l of popular.slice(0,5)) {
              const recent = await openLiga.getRecentMatches(l, (new Date()).getFullYear(), 2).catch(async (err) => { await recordFailure('openligadb'); return []; });
              await safeSet(`prefetch:openligadb:recent:${l}`, { fetchedAt: ts, recent }, 30);
            }
            await redis.publish('prefetch:updates', JSON.stringify({ type: 'openligadb', ts }));
          }
        } catch (e) {
          await redis.publish('prefetch:error', JSON.stringify({ type: 'openligadb', error: e.message || String(e), ts }));
          await recordFailure('openligadb');
        }
      }

      // 4) Football-data CSVs - heavier, keep longer TTL
      if (footballData) {
        try {
          // try E0 (EPL) and SP1 (LaLiga) short samples
          const samples = [];
          try { const epl = await footballData.fixturesFromCsv('E0', '2324').catch(()=>null); if (epl) samples.push({ comp: 'E0', data: epl }); } catch (e) {}
          try { const la = await footballData.fixturesFromCsv('SP1', '2324').catch(()=>null); if (la) samples.push({ comp: 'SP1', data: la }); } catch (e) {}
          for (const s of samples) {
            await safeSet(`prefetch:footballdata:${s.comp}:2324`, { fetchedAt: ts, data: s.data }, 60 * 60);
          }
          await redis.publish('prefetch:updates', JSON.stringify({ type: 'footballdata', ts }));
        } catch (e) {
          await redis.publish('prefetch:error', JSON.stringify({ type: 'footballdata', error: e.message || String(e), ts }));
        }
      }

      // 5) SportMonks & Football-Data live/fixtures - main providers, prefetch every 60s
      if (sportsAggregator) {
        try {
          if (!await isAllowedToRun('sportsmonks')) { /* skip due to backoff */ }
          else {
            const live = await sportsAggregator.getAllLiveMatches().catch(async (err) => { await recordFailure('sportsmonks'); throw err; });
            if (live && live.length > 0) {
              await safeSet('prefetch:sportsmonks:live', { fetchedAt: ts, count: live.length, data: live.slice(0, 50) }, 30);
              await recordSuccess('sportsmonks');
            }
            const fixtures = await sportsAggregator.getFixtures().catch(async (err) => { await recordFailure('sportsmonks-fixtures'); return []; });
            if (fixtures && fixtures.length > 0) {
              await safeSet('prefetch:sportsmonks:fixtures', { fetchedAt: ts, count: fixtures.length, data: fixtures.slice(0, 50) }, 60);
              await recordSuccess('sportsmonks-fixtures');
            }
            await redis.publish('prefetch:updates', JSON.stringify({ type: 'sportsmonks', ts, live: live ? live.length : 0, fixtures: fixtures ? fixtures.length : 0 }));
          }
        } catch (e) {
          await redis.publish('prefetch:error', JSON.stringify({ type: 'sportsmonks', error: e.message || String(e), ts }));
          await recordFailure('sportsmonks');
        }
      }

      lastRun = ts;
    } catch (err) {
      await redis.publish('prefetch:error', JSON.stringify({ type: 'unknown', error: err.message || String(err), ts }));
    } finally {
      running = false;
    }
  };

  // Kick off immediate run then interval
  job();
  const handle = setInterval(job, Math.max(1, intervalSeconds) * 1000);

  return {
    stop: () => clearInterval(handle),
    lastRun: () => lastRun,
  };
}
