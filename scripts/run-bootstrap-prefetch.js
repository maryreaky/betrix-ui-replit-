import 'dotenv/config';
import Redis from 'ioredis';
import { CONFIG } from '../src/config.js';
import SportsAggregator from '../src/services/sports-aggregator.js';
import { APIBootstrap } from '../src/tasks/api-bootstrap.js';

(async function(){
  try {
    const redis = new Redis(CONFIG.REDIS_URL);
    redis.on('connect', ()=>console.log('Redis connected'));
    redis.on('error', (e)=>console.error('Redis error', e));

    const sportsAggregator = new SportsAggregator(redis, {});
    const apiBootstrap = new APIBootstrap(sportsAggregator, null, redis);

    console.log('Running prefetchLiveMatches()...');
    const res = await apiBootstrap.prefetchLiveMatches();
    console.log('prefetchLiveMatches result summary:', {
      totalMatches: res.totalMatches,
      sports: Object.keys(res.sports).length
    });

    const cached = await redis.get('betrix:prefetch:live:by-sport');
    console.log('Cached prefetch present?:', Boolean(cached));
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log('Cached sports keys:', Object.keys(parsed.sports || {}).slice(0, 20));
    }

    process.exit(0);
  } catch (e) {
    console.error('Bootstrap prefetch run failed', e);
    process.exit(1);
  }
})();
