#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import IORedis from 'ioredis';
import SportsAggregator from '../src/services/sports-aggregator.js';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('REDIS_URL not set in environment');
    process.exit(2);
  }

  const redis = new IORedis(redisUrl);
  const agg = new SportsAggregator(redis);

  try {
    console.log('Fetching live soccer matches from aggregator...');
    const matches = await agg.getLiveMatches('39');
    if (!Array.isArray(matches) || matches.length === 0) {
      console.log('No matches returned by aggregator. Aborting prefetch merge.');
      process.exit(0);
    }

    const samples = matches.slice(0, 20);
    const key = 'betrix:prefetch:live:by-sport';
    const raw = await redis.get(key).catch(() => null);
    let payload = { timestamp: new Date().toISOString(), sports: {}, totalMatches: samples.length };
    if (raw) {
      try { payload = JSON.parse(raw); } catch(e) { payload = { timestamp: new Date().toISOString(), sports: {}, totalMatches: samples.length }; }
    }

    payload.timestamp = new Date().toISOString();
    payload.sports = payload.sports || {};
    payload.sports.soccer = { count: matches.length, samples };
    payload.totalMatches = Object.values(payload.sports).reduce((s, v) => s + (v.count || 0), 0);

    await redis.set(key, JSON.stringify(payload));
    await redis.set('live:39', JSON.stringify(samples));
    console.log('Merged and wrote prefetch key with soccer samples.');
  } catch (e) {
    console.error('Failed to merge prefetch:', e?.message || e);
    process.exit(1);
  } finally {
    try { await redis.quit(); } catch (_) { redis.disconnect(); }
  }
}

main();
