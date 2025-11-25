#!/usr/bin/env node
/**
 * Prefetch popular leagues into Redis cache using FreeSportsService.
 * Run this via cron or manually to warm cache.
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import { FreeSportsService } from '../src/services/free-sports.js';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const free = new FreeSportsService(redis);

const leagues = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'UEFA Champions League'
];

async function prefetch() {
  try {
    for (const l of leagues) {
      console.log('Prefetching', l);
      const title = await free.searchWiki(l);
      if (!title) {
        console.log('  -> not found');
        continue;
      }
      const s = await free.getLeagueSummary(title);
      const st = await free.getStandings(title, 20);
      console.log('  -> cached:', s?.title || title, '| rows:', st?.length || 0);
      // avoid hammering
      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (err) {
    console.error('Prefetch failed', err?.message || String(err));
  } finally {
    redis.disconnect();
  }
}

prefetch();
