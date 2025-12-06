#!/usr/bin/env node
/*
  E2E Callback simulator: runs a sequence of callback_query payloads
  against the v2 callback handler and prints returned action objects.
  This runs locally using a MockRedis to avoid touching production services.
*/

process.env.USE_MOCK_REDIS = process.env.USE_MOCK_REDIS || '1';

class MockRedis {
  constructor() { this.store = new Map(); this.hashes = new Map(); }
  async get(k){ return this.store.has(k)?this.store.get(k):null; }
  async set(k,v){ this.store.set(k,String(v)); return 'OK'; }
  async setex(k,ttl,v){ this.store.set(k,String(v)); return 'OK'; }
  async hgetall(k){ return this.hashes.get(k) || {}; }
  async hset(hash, field, val){ const h = this.hashes.get(hash) || {}; h[field]=String(val); this.hashes.set(hash,h); return 1; }
  async rpush(k,v){ const arr = this.store.get(k)?JSON.parse(this.store.get(k)):[]; arr.push(v); this.store.set(k,JSON.stringify(arr)); return arr.length; }
}

async function run() {
  const { handleCallbackQuery } = await import('../src/handlers/telegram-handler-v2.js');
  const redis = new MockRedis();

  const services = {
    openLiga: { getRecentMatches: async () => [] },
    footballData: { fixturesFromCsv: async () => ({ fixtures: [] }) },
    rss: { fetchMultiple: async () => [] },
    apiFootball: { getFixture: async (id) => ({ response: [] }) }
  };

  const callbacks = [
    { id: 'cb-menu', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 1 } }, data: 'menu_main' },
    { id: 'cb-live', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 2 } }, data: 'menu_live' },
    { id: 'cb-sport', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 3 } }, data: 'sport_football' },
    { id: 'cb-league', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 4 } }, data: 'league_39' },
    { id: 'cb-standings', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 5 } }, data: 'league_standings_39' },
    { id: 'cb-odds', from: { id: 424242 }, message: { chat: { id: 9999, message_id: 6 } }, data: 'menu_odds' }
  ];

  for (const cb of callbacks) {
    console.log('\n--- Simulating callback:', cb.data, '---');
    try {
      const res = await handleCallbackQuery(cb, redis, services);
      console.log('Returned:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('Handler error for', cb.data, e && e.message || e);
    }
  }
}

run().catch(e=>{ console.error('e2e-callbacks error', e); process.exit(1);} );
