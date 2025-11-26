#!/usr/bin/env node
/*
  Simple e2e simulation script for BETRIX handlers
  - Uses MockRedis for local runs when requested
  - Dynamically imports handlers so environment flags can be set before modules initialize
*/
// Force modules to use mock redis during this simulation to avoid noisy ioredis auth attempts
process.env.USE_MOCK_REDIS = process.env.USE_MOCK_REDIS || '1';

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

async function run() {
  try {
    // We intentionally do NOT import Redis from ioredis here since USE_MOCK_REDIS=1 is set above
    // All app modules loaded during the dynamic import will use the factory and respect USE_MOCK_REDIS
    
    // Dynamically import handlers after setting USE_MOCK_REDIS
    const { handleMessage, handleCallbackQuery } = await import('../src/handlers/telegram-handler-v2.js');
    const redisClient = new MockRedis(); // use mock directly in e2e
    const mockUpdate = { message: { chat: { id: 9999 }, from: { id: 424242 }, text: '/live' } };
    console.log('--- Running /live simulation ---');
    const res = await handleMessage(mockUpdate, redisClient, { apiFootball: { getLive: async () => ({ response: [ { fixture: { id: 11111, status: { short: 'LIVE', elapsed: 12 } }, teams: { home: { name: 'Home FC' }, away: { name: 'Away United' } }, goals: { home: 1, away: 0 } } ] }) } });
    console.log('Message result:', res);

    // Simulate pressing quick bet callback for fixture 11111
    console.log('--- Simulating bet callback ---');
    const cb = { id: 'cb1', from: { id: 424242 }, message: { chat: { id: 9999 } }, data: 'bet_fixture_11111' };
    const cbRes = await handleCallbackQuery(cb, redisClient, { apiFootball: { getFixture: async (id) => ({ response: [ { teams: { home: { name: 'Home FC' }, away: { name: 'Away United' } } } ] }) } });
    console.log('Callback result:', cbRes);
    
    // Simulate a payment flow if payment-router available
    try {
      const payment = await import('../src/handlers/payment-router.js');
      console.log('--- Simulating payment flow ---');
      const order = await payment.createPaymentOrder(redisClient, 424242, 'PLUS', 'SAFARICOM_TILL', 'KE', { phone: '+254700000000' });
      console.log('Created order:', order.orderId, order.totalAmount);
      const instr = await payment.getPaymentInstructions(redisClient, order.orderId, order.paymentMethod);
      console.log('Payment instructions:', instr && instr.description ? instr.description : instr);
      const result = await payment.simulatePaymentComplete(redisClient, order.orderId);
      console.log('Payment result:', result);
    } catch (e) {
      console.warn('Payment simulation skipped:', e && e.message);
    }
  } catch (err) {
    console.error('e2e-simulate error', err);
    process.exit(1);
  }
}

run();
