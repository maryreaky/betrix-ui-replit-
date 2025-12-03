#!/usr/bin/env node
/**
 * Simulate pay_confirm:mpesa callback_query processing
 * Usage: node scripts/test_pay_confirm_sim.js
 */
import 'dotenv/config';
import { handleCallbackQuery } from '../src/handlers/handler-complete.js';

// Minimal redis mock used by handler-complete and payment-router
class MockRedis {
  constructor() { this.store = new Map(); }
  async hgetall(key) {
    const val = this.store.get(key) || null;
    return val || {};
  }
  async setex(key, ttl, val) {
    this.store.set(key, val);
    return 'OK';
  }
  async set(key, val) { this.store.set(key, val); return 'OK'; }
}

(async function(){
  const mockRedis = new MockRedis();
  // seed a user profile with msisdn
  const userId = 999999;
  await mockRedis.set(`user:${userId}:profile`, { msisdn: '254712345678' });

  // build a fake callback_query object
  const cq = {
    id: 'cbq-1',
    data: 'pay_confirm:mpesa',
    from: { id: userId },
    message: { chat: { id: 5555 }, message_id: 4444 }
  };

  try {
    const res = await handleCallbackQuery(cq, mockRedis, {});
    console.log('Handler result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Handler threw:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
