#!/usr/bin/env node
/**
 * BETRIX Telegram Bot - Command & Callback Test Suite
 * Tests all commands and menus to ensure proper functionality
 * 
 * Usage: node tests/telegram-bot.test.js
 */

import assert from 'assert';
// test logger intentionally omitted to reduce noise

// Mock Redis client
class MockRedis {
  constructor() {
    this.data = {};
  }

  async hgetall(key) {
    return this.data[key] || {};
  }

  async hset(key, obj) {
    this.data[key] = obj;
    return 1;
  }

  async get(key) {
    return this.data[key] || null;
  }

  async setex(key, exp, val) {
    this.data[key] = val;
    return 'OK';
  }
}

// Mock services
const mockServices = {
  telegram: {
    sendMessage: async (chatId, text, opts) => { void chatId; void text; void opts; return { ok: true, result: { message_id: 1 } }; }
  },
  api: {}
};

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  console.log('\n🧪 Starting BETRIX Bot Command Tests...\n');

  const redis = new MockRedis();
  const testResults = [];

  try {
    // Import handlers
    const { handleCommand } = await import('../src/handlers/commands.js');
    const { handleCallback } = await import('../src/handlers/callbacks.js');

    const userId = 123456;
    const chatId = 789012;

    // Test 1: /start command
    console.log('📌 Test 1: /start command');
    const startResult = await handleCommand('/start', chatId, userId, redis, mockServices);
    assert(startResult.chat_id === chatId, 'Start should return correct chatId');
    assert(startResult.text.includes('BETRIX'), 'Start should include BETRIX header');
    assert(startResult.reply_markup, 'Start should include keyboard');
    testResults.push({ test: '/start', status: '✅ PASS' });
    console.log('✅ PASS: /start works correctly\n');

    // Test 2: /menu command
    console.log('📌 Test 2: /menu command');
    const menuResult = await handleCommand('/menu', chatId, userId, redis, mockServices);
    assert(menuResult.chat_id === chatId, 'Menu should return correct chatId');
    assert(menuResult.reply_markup.inline_keyboard.length > 0, 'Menu should have buttons');
    testResults.push({ test: '/menu', status: '✅ PASS' });
    console.log('✅ PASS: /menu works correctly\n');

    // Test 3: /help command
    console.log('📌 Test 3: /help command');
    const helpResult = await handleCommand('/help', chatId, userId, redis, mockServices);
    assert(helpResult.chat_id === chatId, 'Help should return correct chatId');
    assert(helpResult.text.includes('How to use'), 'Help should have usage info');
    assert(helpResult.reply_markup.inline_keyboard, 'Help should have buttons');
    testResults.push({ test: '/help', status: '✅ PASS' });
    console.log('✅ PASS: /help works correctly\n');

    // Test 4: /pricing command
    console.log('📌 Test 4: /pricing command');
    const pricingResult = await handleCommand('/pricing', chatId, userId, redis, mockServices);
    assert(pricingResult.chat_id === chatId, 'Pricing should return correct chatId');
    assert(pricingResult.text.includes('Free Tier'), 'Pricing should list tiers');
    assert(pricingResult.text.includes('KES'), 'Pricing should show currency');
    testResults.push({ test: '/pricing', status: '✅ PASS' });
    console.log('✅ PASS: /pricing works correctly\n');

    // Test 5: /vvip command
    console.log('📌 Test 5: /vvip command');
    const vvipResult = await handleCommand('/vvip', chatId, userId, redis, mockServices);
    assert(vvipResult.chat_id === chatId, 'VVIP should return correct chatId');
    assert(vvipResult.text.includes('Upgrade'), 'VVIP should mention upgrade');
    assert(vvipResult.reply_markup.inline_keyboard, 'VVIP should have payment buttons');
    testResults.push({ test: '/vvip', status: '✅ PASS' });
    console.log('✅ PASS: /vvip works correctly\n');

    // Test 6: /profile command
    console.log('📌 Test 6: /profile command');
    const profileResult = await handleCommand('/profile', chatId, userId, redis, mockServices);
    assert(profileResult.chat_id === chatId, 'Profile should return correct chatId');
    assert(profileResult.text.includes('Profile'), 'Profile should have profile content');
    assert(profileResult.reply_markup.inline_keyboard, 'Profile should have buttons');
    testResults.push({ test: '/profile', status: '✅ PASS' });
    console.log('✅ PASS: /profile works correctly\n');

    // Test 7: /live command
    console.log('📌 Test 7: /live command');
    const liveResult = await handleCommand('/live', chatId, userId, redis, mockServices);
    assert(liveResult.chat_id === chatId, 'Live should return correct chatId');
    assert(liveResult.text.includes('matches'), 'Live should mention matches');
    testResults.push({ test: '/live', status: '✅ PASS' });
    console.log('✅ PASS: /live works correctly\n');

    // Test 8: /standings command
    console.log('📌 Test 8: /standings command');
    const standingsResult = await handleCommand('/standings', chatId, userId, redis, mockServices);
    assert(standingsResult.chat_id === chatId, 'Standings should return correct chatId');
    testResults.push({ test: '/standings', status: '✅ PASS' });
    console.log('✅ PASS: /standings works correctly\n');

    // Test 9: /news command
    console.log('📌 Test 9: /news command');
    const newsResult = await handleCommand('/news', chatId, userId, redis, mockServices);
    assert(newsResult.chat_id === chatId, 'News should return correct chatId');
    testResults.push({ test: '/news', status: '✅ PASS' });
    console.log('✅ PASS: /news works correctly\n');

    // Test 10: /odds command
    console.log('📌 Test 10: /odds command');
    const oddsResult = await handleCommand('/odds', chatId, userId, redis, mockServices);
    assert(oddsResult.chat_id === chatId, 'Odds should return correct chatId');
    testResults.push({ test: '/odds', status: '✅ PASS' });
    console.log('✅ PASS: /odds works correctly\n');

    // Test 11: Unknown command
    console.log('📌 Test 11: Unknown command');
    const unknownResult = await handleCommand('/unknown', chatId, userId, redis, mockServices);
    assert(unknownResult.text.includes('not found') || unknownResult.text.includes('not recognized'), 'Should handle unknown commands');
    testResults.push({ test: 'Unknown command', status: '✅ PASS' });
    console.log('✅ PASS: Unknown command handled correctly\n');

    // Test 12: menu_main callback
    console.log('📌 Test 12: menu_main callback');
    const menuCallbackResult = await handleCallback('menu_main', chatId, userId, redis, mockServices);
    assert(menuCallbackResult.chat_id === chatId, 'Menu callback should return correct chatId');
    assert(menuCallbackResult.reply_markup.inline_keyboard, 'Menu callback should have buttons');
    testResults.push({ test: 'menu_main callback', status: '✅ PASS' });
    console.log('✅ PASS: menu_main callback works\n');

    // Test 13: menu_vvip callback
    console.log('📌 Test 13: menu_vvip callback');
    const vvipCallbackResult = await handleCallback('menu_vvip', chatId, userId, redis, mockServices);
    assert(vvipCallbackResult.chat_id === chatId, 'VVIP callback should return correct chatId');
    assert(vvipCallbackResult.text.includes('Premium'), 'VVIP callback should mention premium');
    testResults.push({ test: 'menu_vvip callback', status: '✅ PASS' });
    console.log('✅ PASS: menu_vvip callback works\n');

    // Test 14: sub_vvip callback
    console.log('📌 Test 14: sub_vvip callback');
    const subCallbackResult = await handleCallback('sub_vvip', chatId, userId, redis, mockServices);
    assert(subCallbackResult.chat_id === chatId, 'Sub callback should return correct chatId');
    assert(subCallbackResult.text.includes('VVIP'), 'Sub callback should mention tier');
    testResults.push({ test: 'sub_vvip callback', status: '✅ PASS' });
    console.log('✅ PASS: sub_vvip callback works\n');

    // Test 15: profile_stats callback
    console.log('📌 Test 15: profile_stats callback');
    const profileCallbackResult = await handleCallback('profile_stats', chatId, userId, redis, mockServices);
    assert(profileCallbackResult.chat_id === chatId, 'Profile callback should return correct chatId');
    assert(profileCallbackResult.text.includes('Stats'), 'Profile callback should show stats');
    testResults.push({ test: 'profile_stats callback', status: '✅ PASS' });
    console.log('✅ PASS: profile_stats callback works\n');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`\nTotal Tests: ${testResults.length}`);
    console.log(`Passed: ${testResults.filter(r => r.status.includes('PASS')).length}`);
    console.log(`Failed: ${testResults.filter(r => r.status.includes('FAIL')).length}\n`);

    testResults.forEach(r => {
      console.log(`${r.status} - ${r.test}`);
    });

    console.log('\n✅ All tests passed! Bot is ready for deployment.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test suite failed:');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
