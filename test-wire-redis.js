#!/usr/bin/env node
import Redis from 'ioredis';
import CacheService from './src/services/cache.js';
import ScoreBatService from './src/services/scorebat.js';
import RSSAggregator from './src/services/rss-aggregator.js';
import OpenLigaDBService from './src/services/openligadb.js';
import { SportsAggregator } from './src/services/sports-aggregator.js';

async function run() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('Please set REDIS_URL in the environment before running this test.');
    process.exit(1);
  }

  console.log('Connecting to Redis at', url.replace(/:(?:.*)@/, ':***@'));
  const redis = new Redis(url);
  redis.on('error', (e) => console.error('Redis error', e.message));
  await new Promise(r => setTimeout(r, 500));

  const cache = new CacheService(redis);
  const scorebat = new ScoreBatService(null);
  const rss = new RSSAggregator(cache, { ttlSeconds: 60 });
  const openLiga = new OpenLigaDBService(undefined, cache, { ttlSeconds: 30 });

  const agg = new SportsAggregator(redis, { scorebat, rss, openLiga });

  console.log('Fetching live matches (league 39) to trigger provider health writes...');
  const matches = await agg.getLiveMatches(39).catch(e => ({ error: e.message }));
  console.log('Live fetch result summary:', Array.isArray(matches) ? `matches=${matches.length}` : matches);

  console.log('Reading provider health keys from Redis (sample)');
  const keys = ['sportsdata','sportsmonks','api-sports','football-data','sofascore','allsports','espn','scorebat'];
  for (const k of keys) {
    const val = await redis.get(`betrix:provider:health:${k}`).catch(() => null);
    console.log(k, val ? JSON.parse(val) : null);
  }

  await redis.quit();
  console.log('Done');
}

run().catch(e => { console.error(e); process.exit(1); });
