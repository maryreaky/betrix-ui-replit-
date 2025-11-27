#!/usr/bin/env node
/**
 * REDIS CONNECTION VALIDATION & HEALTH CHECK
 * Validates that all Redis operations work with the Azure Redis URL
 * Run: node scripts/validate-redis-connection.js
 */

import dotenv from 'dotenv';
import Redis from 'ioredis';
import { getRedis } from '../src/lib/redis-factory.js';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const TESTS = [];

// ============================================================================
// LOGGER UTILITY
// ============================================================================

function logTest(name, status, message = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  const formattedName = name.padEnd(50, '.');
  console.log(`${icon} ${formattedName} ${message}`);
  TESTS.push({ name, status, message });
}

// ============================================================================
// TEST 1: Environment Configuration
// ============================================================================

console.log('\n📋 TEST 1: ENVIRONMENT CONFIGURATION');
console.log('=====================================\n');

if (!REDIS_URL) {
  logTest('REDIS_URL environment variable', 'FAIL', 'Not set!');
  console.error('\n❌ CRITICAL: REDIS_URL is not configured');
  process.exit(1);
} else {
  logTest('REDIS_URL environment variable', 'PASS', `Configured: ${REDIS_URL.substring(0, 30)}...`);
}

// Validate URL format
try {
  const url = new URL(REDIS_URL);
  logTest('REDIS_URL format validation', 'PASS', `Protocol: ${url.protocol}, Host: ${url.hostname}:${url.port}`);
} catch (e) {
  logTest('REDIS_URL format validation', 'FAIL', `Invalid URL: ${e.message}`);
}

// ============================================================================
// TEST 2: Direct ioredis Connection
// ============================================================================

console.log('\n📋 TEST 2: DIRECT IOREDIS CONNECTION');
console.log('=====================================\n');

const redis = new Redis(REDIS_URL, {
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times) => {
    if (times > 5) {
      console.log('⚠️  Stopping retry attempts after 5 tries');
      return null;
    }
    return Math.min(times * 50, 2000);
  }
});

let connectionSucceeded = false;

redis.on('error', (err) => {
  if (err.message.includes('NOAUTH')) {
    logTest('Redis authentication', 'FAIL', 'Invalid credentials or password');
  } else if (err.message.includes('ECONNREFUSED')) {
    logTest('Redis host connection', 'FAIL', 'Cannot connect to host - check hostname/port');
  } else if (err.message.includes('ETIMEDOUT')) {
    logTest('Redis connection timeout', 'FAIL', 'Connection timed out - check network');
  } else {
    logTest('Redis connection', 'FAIL', err.message);
  }
});

redis.on('connect', () => {
  logTest('Redis TCP connection', 'PASS', 'Connected to Redis host');
});

redis.on('ready', () => {
  logTest('Redis protocol handshake', 'PASS', 'Redis ready for commands');
  connectionSucceeded = true;
});

// ============================================================================
// TEST 3: Basic Redis Operations
// ============================================================================

async function runOperationsTest() {
  if (!connectionSucceeded) {
    logTest('Basic Redis operations', 'FAIL', 'Connection not established - skipping operations');
    await redis.quit();
    return;
  }

  console.log('\n📋 TEST 3: BASIC REDIS OPERATIONS');
  console.log('===================================\n');

  try {
    // Test PING
    const pingResult = await redis.ping();
    logTest('PING command', 'PASS', `Response: ${pingResult}`);

    // Test SET
    await redis.set('__betrix_test__', 'hello', 'EX', 10);
    logTest('SET command (with TTL)', 'PASS', 'Value set with 10s expiry');

    // Test GET
    const value = await redis.get('__betrix_test__');
    if (value === 'hello') {
      logTest('GET command', 'PASS', `Retrieved value: ${value}`);
    } else {
      logTest('GET command', 'FAIL', `Expected 'hello', got '${value}'`);
    }

    // Test DEL
    const delResult = await redis.del('__betrix_test__');
    logTest('DEL command', 'PASS', `Deleted keys: ${delResult}`);

    // Test HSET/HGET (Hash operations - used heavily in handlers)
    await redis.hset('__betrix_hash_test__', 'field1', 'value1');
    logTest('HSET command', 'PASS', 'Hash field set');

    const hashValue = await redis.hget('__betrix_hash_test__', 'field1');
    if (hashValue === 'value1') {
      logTest('HGET command', 'PASS', `Retrieved hash value: ${hashValue}`);
    } else {
      logTest('HGET command', 'FAIL', `Expected 'value1', got '${hashValue}'`);
    }

    // Test HGETALL
    const hashAll = await redis.hgetall('__betrix_hash_test__');
    if (hashAll.field1 === 'value1') {
      logTest('HGETALL command', 'PASS', 'Retrieved all hash fields');
    } else {
      logTest('HGETALL command', 'FAIL', 'Failed to retrieve hash');
    }

    // Test LPUSH/LPOP (List operations - used for bet slips)
    await redis.lpush('__betrix_list_test__', 'item1', 'item2');
    logTest('LPUSH command', 'PASS', 'List items pushed');

    const popItem = await redis.lpop('__betrix_list_test__');
    if (popItem === 'item2') {
      logTest('LPOP command', 'PASS', `Popped item: ${popItem}`);
    } else {
      logTest('LPOP command', 'FAIL', `Expected 'item2', got '${popItem}'`);
    }

    // Test ZADD/ZRANGE (Sorted set operations - used for rankings)
    await redis.zadd('__betrix_zset_test__', 1, 'member1', 2, 'member2', 3, 'member3');
    logTest('ZADD command', 'PASS', 'Sorted set members added');

    const zrange = await redis.zrange('__betrix_zset_test__', 0, -1);
    if (zrange.length === 3) {
      logTest('ZRANGE command', 'PASS', `Retrieved ${zrange.length} members`);
    } else {
      logTest('ZRANGE command', 'FAIL', `Expected 3 members, got ${zrange.length}`);
    }

    // Test INCR (Counter operations - used for user metrics)
    const incrResult = await redis.incr('__betrix_counter__');
    logTest('INCR command', 'PASS', `Counter incremented to: ${incrResult}`);

    // Test SADD/SMEMBERS (Set operations - used for favorites)
    await redis.sadd('__betrix_set_test__', 'member1', 'member2', 'member3');
    logTest('SADD command', 'PASS', 'Set members added');

    const smembers = await redis.smembers('__betrix_set_test__');
    if (smembers.length === 3) {
      logTest('SMEMBERS command', 'PASS', `Retrieved ${smembers.length} set members`);
    } else {
      logTest('SMEMBERS command', 'FAIL', `Expected 3 members, got ${smembers.length}`);
    }

    // Clean up test keys
    await redis.del('__betrix_test__', '__betrix_hash_test__', '__betrix_list_test__', '__betrix_zset_test__', '__betrix_counter__', '__betrix_set_test__');
    logTest('Cleanup of test keys', 'PASS', 'All test data removed');

  } catch (error) {
    logTest('Basic Redis operations', 'FAIL', error.message);
  }
}

// ============================================================================
// TEST 4: Handler-Specific Operations
// ============================================================================

async function runHandlerTest() {
  if (!connectionSucceeded) {
    return;
  }

  console.log('\n📋 TEST 4: HANDLER-SPECIFIC OPERATIONS');
  console.log('=======================================\n');

  try {
    const testUserId = 123456;
    const userKey = `user:${testUserId}`;

    // Test user profile (used in telegram-handler-v2.js)
    await redis.hset(userKey, 'tier', 'FREE', 'username', 'testuser', 'phone', '+254712345678');
    logTest('User profile HSET', 'PASS', 'User data stored in hash');

    const userData = await redis.hgetall(userKey);
    if (userData.tier === 'FREE') {
      logTest('User profile HGETALL', 'PASS', `Retrieved user tier: ${userData.tier}`);
    } else {
      logTest('User profile HGETALL', 'FAIL', 'User data not retrieved correctly');
    }

    // Test payment state (used in payment-handler.js)
    const orderId = `order_${Date.now()}`;
    const paymentKey = `payment:${orderId}`;
    await redis.setex(paymentKey, 3600, JSON.stringify({
      userId: testUserId,
      tier: 'PLUS',
      amount: 2500,
      status: 'pending'
    }));
    logTest('Payment order storage', 'PASS', 'Payment data stored with TTL');

    const paymentData = await redis.get(paymentKey);
    if (paymentData) {
      logTest('Payment order retrieval', 'PASS', 'Payment data retrieved successfully');
    } else {
      logTest('Payment order retrieval', 'FAIL', 'Payment data not found');
    }

    // Test bet slip (used in telegram-handler-v2.js)
    const betSlipKey = `betslip:${Date.now()}`;
    await redis.setex(betSlipKey, 3600, JSON.stringify({
      userId: testUserId,
      matches: [
        { id: 1, home: 'Arsenal', away: 'Chelsea', odds: 1.85 },
        { id: 2, home: 'ManCity', away: 'Liverpool', odds: 2.10 }
      ],
      totalOdds: 3.885,
      stake: 100
    }));
    logTest('Bet slip storage', 'PASS', 'Bet slip stored with TTL');

    const betSlipData = await redis.get(betSlipKey);
    if (betSlipData) {
      logTest('Bet slip retrieval', 'PASS', 'Bet slip retrieved successfully');
    } else {
      logTest('Bet slip retrieval', 'FAIL', 'Bet slip not found');
    }

    // Test user favorites (used in telegram-handler-v2.js)
    const favKey = `user:${testUserId}:favorites`;
    await redis.sadd(favKey, 'Arsenal', 'Chelsea', 'Manchester City');
    logTest('Favorites set storage', 'PASS', 'Favorite teams stored');

    const favorites = await redis.smembers(favKey);
    if (favorites.length === 3) {
      logTest('Favorites set retrieval', 'PASS', `Retrieved ${favorites.length} favorites`);
    } else {
      logTest('Favorites set retrieval', 'FAIL', `Expected 3, got ${favorites.length}`);
    }

    // Test command usage tracking (used in worker.js)
    const usageKey = `cmd:usage:${testUserId}:/live`;
    await redis.incr(usageKey);
    await redis.expire(usageKey, 2592000); // 30 days
    logTest('Command usage tracking', 'PASS', 'Usage metric recorded with expiry');

    // Clean up test data
    await redis.del(userKey, paymentKey, betSlipKey, favKey, usageKey);
    logTest('Cleanup of handler test data', 'PASS', 'All test data removed');

  } catch (error) {
    logTest('Handler-specific operations', 'FAIL', error.message);
  }
}

// ============================================================================
// TEST 5: Redis Factory Pattern
// ============================================================================

async function runFactoryTest() {
  console.log('\n📋 TEST 5: REDIS FACTORY PATTERN');
  console.log('==================================\n');

  try {
    const factoryRedis = getRedis();
    if (factoryRedis) {
      logTest('getRedis() factory function', 'PASS', `Returns ${factoryRedis.constructor.name} instance`);
    } else {
      logTest('getRedis() factory function', 'FAIL', 'Did not return an instance');
    }

    // Test singleton pattern
    const factoryRedis2 = getRedis();
    if (factoryRedis === factoryRedis2) {
      logTest('Redis singleton pattern', 'PASS', 'Same instance returned on subsequent calls');
    } else {
      logTest('Redis singleton pattern', 'FAIL', 'Different instances returned');
    }
  } catch (error) {
    logTest('Redis factory pattern', 'FAIL', error.message);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('\n🧪 BETRIX REDIS CONNECTION VALIDATION & HEALTH CHECK');
  console.log('====================================================\n');

  await runOperationsTest();
  await runHandlerTest();
  await runFactoryTest();

  // Close connection
  try {
    await redis.quit();
    console.log('\n✅ Redis connection closed gracefully\n');
  } catch (e) {
    console.log('\n⚠️  Warning closing Redis connection\n');
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================

  const passed = TESTS.filter(t => t.status === 'PASS').length;
  const failed = TESTS.filter(t => t.status === 'FAIL').length;

  console.log('📊 TEST SUMMARY');
  console.log('===============\n');
  console.log(`✅ PASSED: ${passed}`);
  console.log(`❌ FAILED: ${failed}`);
  console.log(`📈 TOTAL:  ${TESTS.length}`);
  console.log(`📊 PASS RATE: ${((passed / TESTS.length) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ FAILED TESTS:\n');
    TESTS.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  • ${t.name}`);
      if (t.message) console.log(`    └─ ${t.message}`);
    });
    console.log('\n⚠️  Please check your Redis URL and network connectivity\n');
    process.exit(1);
  } else {
    console.log('🎉 ALL TESTS PASSED! Redis connection is working seamlessly.\n');
    console.log('✨ Your BETRIX bot is ready to connect with the Azure Redis instance.\n');
    process.exit(0);
  }
}

// Run tests after a brief delay to allow connection to establish
setTimeout(main, 1000);
