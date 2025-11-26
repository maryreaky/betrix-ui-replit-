#!/usr/bin/env node
/*
  Simple e2e simulation script for BETRIX handlers
  - Uses MockRedis for local runs when requested
  - Dynamically imports handlers so environment flags can be set before modules initialize
*/
// Force modules to use mock redis during this simulation to avoid noisy ioredis auth attempts
process.env.USE_MOCK_REDIS = process.env.USE_MOCK_REDIS || '1';
import Redis from 'ioredis';

// Minimal in-memory Redis mock used for local e2e when real Redis is unavailable
class MockRedis {
  constructor() {
    this.store = new Map();
    this.hashes = new Map();
  }
  async get(key) { return this.store.has(key) ? this.store.get(key) : null; }
  async set(key, val) { this.store.set(key, String(val)); return 'OK'; }
  async setex(key, ttl, val) { this.store.set(key, String(val)); return 'OK'; }
  async del(key) { return this.store.delete(key) ? 1 : 0; }
  async exists(key) { return this.store.has(key) ? 1 : 0; }
  async incr(key) { const v = parseInt(await this.get(key) || '0', 10) + 1; await this.set(key, String(v)); return v; }
  async hget(hash, field) { const h = this.hashes.get(hash) || {}; return (h[field] === undefined) ? null : h[field]; }
  async hset(hash, field, val) { const h = this.hashes.get(hash) || {}; h[field] = String(val); this.hashes.set(hash, h); return 1; }
  async lpush(key, val) { const arr = this.store.get(key) ? JSON.parse(this.store.get(key)) : []; arr.unshift(val); this.store.set(key, JSON.stringify(arr)); return arr.length; }
  async rpush(key, val) { const arr = this.store.get(key) ? JSON.parse(this.store.get(key)) : []; arr.push(val); this.store.set(key, JSON.stringify(arr)); return arr.length; }
  async lrange(key, start, stop) { const arr = this.store.get(key) ? JSON.parse(this.store.get(key)) : []; return arr.slice(start, stop + 1); }
  async expire(key, ttl) { /* noop */ return 1; }
  quit() { /* noop */ }
}

let redis;
async function getRedisClient() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const client = new Redis(url);
    // quick ping to verify connection & auth
    const pong = await client.ping().catch(e => { throw e; });
    if (pong !== 'PONG') throw new Error('Redis ping failed');
    return client;
  } catch (err) {
    console.warn('[e2e-simulate] Redis unavailable or auth failed, using MockRedis:', err && err.message);
    return new MockRedis();
  }
}

async function run() {
  try {
    // Dynamically import handlers after setting USE_MOCK_REDIS
    const { handleMessage, handleCallbackQuery } = await import('../src/handlers/telegram-handler-v2.js');
    const redisClient = await getRedisClient();
    const mockUpdate = { message: { chat: { id: 9999 }, from: { id: 424242 }, text: '/live' } };
    console.log('--- Running /live simulation ---');
    const res = await handleMessage(mockUpdate, redisClient, { apiFootball: { getLive: async () => ({ response: [ { fixture: { id: 11111, status: { short: 'LIVE', elapsed: 12 } }, teams: { home: { name: 'Home FC' }, away: { name: 'Away United' } }, goals: { home: 1, away: 0 } } ] }) } });
    console.log('Message result:', res);

    // Simulate pressing quick bet callback for fixture 11111
    console.log('--- Simulating bet callback ---');
    const cb = { id: 'cb1', from: { id: 424242 }, message: { chat: { id: 9999 } }, data: 'bet_fixture_11111' };
    const cbRes = await handleCallbackQuery(cb, redisClient, { apiFootball: { getFixture: async (id) => ({ response: [ { teams: { home: { name: 'Home FC' }, away: { name: 'Away United' } } } ] }) } });
    console.log('Callback result:', cbRes);
  } catch (err) {
    console.error('e2e-simulate error', err);
    process.exit(1);
  } finally {
    try { if (redis && typeof redis.quit === 'function') redis.quit(); } catch(e){}
  }
}

run();
