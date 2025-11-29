#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import IORedis from 'ioredis';
import SportsAggregator from '../src/services/sports-aggregator.js';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  let redis = null;
  if (redisUrl) {
    redis = new IORedis(redisUrl);
    // allow connection
    try { await redis.connect(); } catch (_) {}
  }

  const agg = new SportsAggregator(redis);
  try {
    const matches = await agg.getLiveMatches('39');
    console.log('Aggregator returned matches count:', Array.isArray(matches) ? matches.length : 0);
    if (Array.isArray(matches)) console.log(matches.slice(0,10));
  } catch (e) {
    console.error('Aggregator call failed:', e?.message || e);
  } finally {
    try { if (redis) await redis.quit(); } catch (_) { if (redis) redis.disconnect(); }
  }
}

main();
