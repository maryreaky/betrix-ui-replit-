#!/usr/bin/env node
/**
 * E2E Payment Callback Simulator
 * Tests the payment flow: tier selection -> payment method selection -> payment order
 */


// Minimal in-memory Redis mock for local testing
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
  async hset(hash, field, val) { 
    if (!this.hashes.has(hash)) this.hashes.set(hash, new Map());
    this.hashes.get(hash).set(field, String(val));
    return 1;
  }
  async hget(hash, field) { return (this.hashes.get(hash) || new Map()).get(field) || null; }
  async hgetall(hash) { 
    const map = this.hashes.get(hash) || new Map();
    const obj = {};
    for (const [k, v] of map) obj[k] = v;
    return obj;
  }
  async hdel(hash, field) { return this.hashes.get(hash)?.delete(field) ? 1 : 0; }
  async lpush(key, val) { if (!this.store.has(key)) this.store.set(key, []); this.store.get(key).push(val); return 1; }
  async rpush(key, val) { if (!this.store.has(key)) this.store.set(key, []); this.store.get(key).push(val); return 1; }
  async llen(key) { return (this.store.get(key) || []).length; }
  async lrange(key, start, end) { return (this.store.get(key) || []).slice(start, end + 1); }
  async expire(key, ttl) { return 1; }
  async ttl(key) { return -1; }
}

import v2Handler from '../src/handlers/telegram-handler-v2.js';

const redis = new MockRedis();

async function runPaymentTest() {
  console.log('\n=== E2E Payment Flow Test ===\n');

  const userId = 424242;
  const chatId = 9999;
  const services = {};

  // Test 1: Tier selection (sub_vvip)
  console.log('--- Test 1: Selecting VVIP tier (sub_vvip) ---');
  const tierResponse = await v2Handler.handleCallbackQuery(
    {
      id: 'cb_001',
      from: { id: userId },
      message: { chat: { id: chatId }, message_id: 123 },
      data: 'sub_vvip'
    },
    redis,
    services
  );
  
  if (tierResponse && tierResponse.reply_markup) {
    const paymentButtons = tierResponse.reply_markup.inline_keyboard;
    console.log(`✓ Payment methods shown: ${paymentButtons.map(row => row[0].text).join(', ')}`);
    console.log(`  First button data: ${paymentButtons[0][0].callback_data}`);
  } else {
    console.log('❌ No payment methods in response');
    console.log('Response:', tierResponse);
  }

  // Test 2: Payment method selection (pay_mpesa_vvip)
  console.log('\n--- Test 2: Selecting M-Pesa payment (pay_mpesa_vvip) ---');
  try {
    const paymentResponse = await v2Handler.handleCallbackQuery(
      {
        id: 'cb_002',
        from: { id: userId },
        message: { chat: { id: chatId }, message_id: 123 },
        data: 'pay_mpesa_vvip'
      },
      redis,
      services
    );
    
    if (paymentResponse && paymentResponse.text) {
      console.log(`✓ Payment order created successfully`);
      console.log(`  Response text preview: ${paymentResponse.text.substring(0, 80)}...`);
    } else if (paymentResponse && paymentResponse.method === 'answerCallbackQuery' && paymentResponse.text) {
      console.log(`⚠️  Alert: ${paymentResponse.text}`);
    } else {
      console.log('❌ Unexpected response:', paymentResponse);
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  // Test 3: Payment method selection with invalid method (should fail gracefully)
  console.log('\n--- Test 3: Selecting invalid payment (pay_invalid_vvip) ---');
  try {
    const invalidResponse = await v2Handler.handleCallbackQuery(
      {
        id: 'cb_003',
        from: { id: userId },
        message: { chat: { id: chatId }, message_id: 123 },
        data: 'pay_invalid_vvip'
      },
      redis,
      services
    );
    
    if (invalidResponse && invalidResponse.method === 'answerCallbackQuery') {
      console.log(`✓ Gracefully handled invalid method: ${invalidResponse.text}`);
    } else {
      console.log('❌ Should have returned answerCallbackQuery with error', invalidResponse);
    }
  } catch (err) {
    console.log(`❌ Unhandled error: ${err.message}`);
  }

  // Test 4: Different tier (sub_pro)
  console.log('\n--- Test 4: Selecting PRO tier (sub_pro) ---');
  try {
    const proResponse = await v2Handler.handleCallbackQuery(
      {
        id: 'cb_004',
        from: { id: userId },
        message: { chat: { id: chatId }, message_id: 123 },
        data: 'sub_pro'
      },
      redis,
      services
    );
    
    if (proResponse && proResponse.reply_markup) {
      const buttons = proResponse.reply_markup.inline_keyboard;
      console.log(`✓ PRO tier response has ${buttons.length} button groups`);
      console.log(`  First payment option: ${buttons[0][0].text}`);
    } else {
      console.log('❌ No buttons in PRO tier response');
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log('\n=== Test Complete ===\n');
}

runPaymentTest().catch(console.error);
