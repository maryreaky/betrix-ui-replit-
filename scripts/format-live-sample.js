#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import IORedis from 'ioredis';
import SportsAggregator from '../src/services/sports-aggregator.js';
import * as MH from '../src/handlers/menu-handler.js';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  let redis = null;
  if (redisUrl) redis = new IORedis(redisUrl);
  const agg = new SportsAggregator(redis);
  try {
    const matches = await agg.getLiveMatches('39');
    const msg = MH.formatLiveGames(matches, 'Football');
    console.log('=== Formatted Live Menu ===');
    console.log(msg.substring(0, 4000));
  } catch (e) {
    console.error('Failed to build live menu:', e?.message || e);
  } finally {
    try { if (redis) await redis.quit(); } catch (_) { if (redis) redis.disconnect(); }
  }
}

main();
