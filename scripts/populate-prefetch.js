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
      console.log('No matches returned by aggregator. Aborting prefetch write.');
      process.exit(0);
    }

    // Build a minimal prefetch structure compatible with existing reader
    const samples = matches.slice(0, 20);
    const payload = {
      timestamp: new Date().toISOString(),
      sports: {
        soccer: { count: matches.length, samples }
      },
      totalMatches: matches.length
    };

    await redis.set('betrix:prefetch:live:by-sport', JSON.stringify(payload));
    // Also write a league-specific key for live:39
    await redis.set('live:39', JSON.stringify(samples));

    console.log(`Wrote prefetch with ${samples.length} soccer samples and live:39 key.`);
  } catch (e) {
    console.error('Failed to populate prefetch:', e?.message || e);
    process.exit(1);
  } finally {
    try { await redis.quit(); } catch (_) { redis.disconnect(); }
  }
}

main();
