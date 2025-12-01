#!/usr/bin/env node
import 'dotenv/config';
import { getRedis } from '../src/lib/redis-factory.js';
import { SportsAggregator } from '../src/services/sports-aggregator.js';
import { CONFIG } from '../src/config.js';

async function checkRedis() {
  try {
    const redis = getRedis();
    if (!redis) {
      console.log('[REDIS] No redis client available (getRedis returned null)');
      return { ok: false };
    }
    const pong = await redis.ping();
    console.log('[REDIS] PING ->', pong);
    return { ok: pong === 'PONG' || String(pong).toLowerCase().includes('pong') };
  } catch (e) {
    console.error('[REDIS] Error pinging Redis:', e.message || e);
    return { ok: false, err: e.message || String(e) };
  }
}

async function checkSportsAggregator() {
  try {
    const redis = getRedis();
    const agg = new SportsAggregator(redis, {});
    console.log('[SPORTSAGGREGATOR] Initialized. Providers in CONFIG:', {
      SPORTSMONKS: !!CONFIG.SPORTSMONKS.KEY,
      FOOTBALLDATA: !!CONFIG.FOOTBALLDATA.KEY,
      GEMINI: !!CONFIG.GEMINI.API_KEY
    });

    // Try to fetch all live matches (may fallback to raw cache)
    const live = await agg.getAllLiveMatches().catch(e => { throw e; });
    console.log('[SPORTSAGGREGATOR] getAllLiveMatches -> count:', Array.isArray(live) ? live.length : typeof live);
    if (Array.isArray(live) && live.length > 0) {
      console.log('[SPORTSAGGREGATOR] Sample match:', JSON.stringify(live[0], null, 2).slice(0, 1000));
    }
    // Try to fetch upcoming fixtures (light call)
    const fixtures = await agg.getFixtures().catch(e => { console.warn('[SPORTSAGGREGATOR] getFixtures failed', e.message || e); return []; });
    console.log('[SPORTSAGGREGATOR] getFixtures -> count:', Array.isArray(fixtures) ? fixtures.length : typeof fixtures);
    return { ok: true, liveCount: Array.isArray(live) ? live.length : 0, fixturesCount: Array.isArray(fixtures) ? fixtures.length : 0 };
  } catch (e) {
    console.error('[SPORTSAGGREGATOR] Error during checks:', e.message || e);
    return { ok: false, err: e.message || String(e) };
  }
}

async function main() {
  console.log('Running connectivity checks (temporary)');
  console.log('CONFIG providers keys present:', {
    SPORTSMONKS: !!CONFIG.SPORTSMONKS.KEY,
    FOOTBALLDATA: !!CONFIG.FOOTBALLDATA.KEY,
    GEMINI: !!CONFIG.GEMINI.API_KEY
  });

  const redisRes = await checkRedis();
  const aggRes = await checkSportsAggregator();

  console.log('\nSummary:');
  console.log('Redis:', redisRes);
  console.log('SportsAggregator:', aggRes);

  // Exit with success unless all failed
  if (redisRes.ok && aggRes.ok) process.exit(0);
  process.exit(1);
}

main();
