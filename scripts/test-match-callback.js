// Simulate a Telegram callback for a match details button
process.env.SPORTSMONKS_API = process.env.SPORTSMONKS_API || process.argv[2] || '';
process.env.SPORTSMONKS_INSECURE = process.env.SPORTSMONKS_INSECURE || 'true'; // in this env, allow insecure to avoid proxy failures

import Redis from 'ioredis';
import { SportsAggregator } from '../src/services/sports-aggregator.js';
import handler from '../src/handlers/telegram-handler-v2-clean.js';

const redis = new Redis(process.env.REDIS_URL);

async function run() {
  try {
    const agg = new SportsAggregator(redis);
    console.log('Fetching live matches to select a match id...');
    const matches = await agg._getLiveFromSportsMonks('football');
    if (!Array.isArray(matches) || matches.length === 0) {
      console.error('No matches returned. Aborting.');
      process.exit(1);
    }
    const m = matches[0];
    const matchId = m.id || (m.raw && m.raw.id) || null;
    console.log('Using match id:', matchId);

    const update = {
      callback_query: {
        id: 'test-cq-1',
        data: `match:${matchId}:soccer`,
        message: { chat: { id: 999 }, message_id: 111 }
      }
    };

    const resp = await handler.handleCallbackQuery(update, redis, { sportsAggregator: agg });
    console.log('\nHandler response:');
    console.log(resp);
  } catch (e) {
    console.error('Error:', e.message);
    if (e.stack) console.error(e.stack);
  } finally {
    await redis.quit().catch(()=>{});
  }
}

run();
