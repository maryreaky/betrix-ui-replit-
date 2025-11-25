#!/usr/bin/env node
import Redis from 'ioredis';
import OpenLigaDBService from '../src/services/openligadb.js';
import FootballDataService from '../src/services/footballdata.js';
import ScoreBatService from '../src/services/scorebat.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const openLiga = new OpenLigaDBService();
const fd = new FootballDataService();
const scorebat = new ScoreBatService(process.env.SCOREBAT_TOKEN || null);

async function prefetch() {
  try {
    console.log('Prefetching OpenLigaDB leagues...');
    const leagues = await openLiga.getAvailableLeagues();
    await redis.set('prefetch:openligadb:leagues', JSON.stringify(leagues), 'EX', 60 * 60 * 24).catch(()=>{});

    console.log('Prefetching ScoreBat feed...');
    try {
      const sb = await scorebat.freeFeed();
      await redis.set('prefetch:scorebat:free', JSON.stringify(sb), 'EX', 60 * 60).catch(()=>{});
    } catch (e) { console.warn('ScoreBat prefetch failed', e.message); }

    console.log('Done prefetch.');
    process.exit(0);
  } catch (err) {
    console.error('Prefetch failed', err.message || err);
    process.exit(2);
  }
}

prefetch();
