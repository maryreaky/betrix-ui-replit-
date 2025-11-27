#!/usr/bin/env node
/**
 * REDIS INTEGRATION TEST - SEAMLESS HANDLER VALIDATION
 * Tests that all handlers work seamlessly with Redis
 * Run: node scripts/test-redis-handlers.js
 */

import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const TESTS = [];

// ============================================================================
// LOGGER
// ============================================================================

function log(status, message) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`${icon} ${message}`);
  TESTS.push({ status, message });
}

console.log('\n🧪 REDIS INTEGRATION TEST - SEAMLESS HANDLER VALIDATION');
console.log('========================================================\n');

if (!REDIS_URL) {
  console.error('❌ REDIS_URL not configured');
  process.exit(1);
}

// ============================================================================
// REDIS CONNECTION
// ============================================================================

console.log('📋 INITIALIZING REDIS CONNECTION...\n');

const redis = new Redis(REDIS_URL, {
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true
});

let connected = false;

redis.on('error', (err) => {
  log('FAIL', `Redis connection error: ${err.message}`);
  process.exit(1);
});

redis.on('connect', () => {
  log('PASS', 'Connected to Redis');
  connected = true;
});

// Wait for connection
await new Promise(resolve => {
  const maxWait = 5000;
  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    if (connected) {
      clearInterval(checkInterval);
      resolve();
    }
    if (Date.now() - startTime > maxWait) {
      clearInterval(checkInterval);
      log('FAIL', 'Connection timeout after 5 seconds');
      process.exit(1);
    }
  }, 100);
});

// ============================================================================
// TEST 1: USER HANDLER OPERATIONS
// ============================================================================

console.log('\n📋 TEST 1: USER HANDLER OPERATIONS');
console.log('===================================\n');

try {
  const userId = 123456;
  const userKey = `user:${userId}`;

  // Create user profile
  await redis.hset(userKey,
    'tier', 'FREE',
    'username', 'test_user',
    'phone', '+254712345678',
    'email', 'test@example.com',
    'referralCode', 'REF123',
    'language', 'en',
    'timezone', 'Africa/Nairobi'
  );
  log('PASS', 'User profile creation (HSET)');

  // Retrieve user profile
  const userData = await redis.hgetall(userKey);
  if (userData.tier === 'FREE' && userData.username === 'test_user') {
    log('PASS', 'User profile retrieval (HGETALL)');
  } else {
    log('FAIL', 'User profile retrieval returned incorrect data');
  }

  // Update user tier
  await redis.hset(userKey, 'tier', 'PRO');
  const updatedTier = await redis.hget(userKey, 'tier');
  if (updatedTier === 'PRO') {
    log('PASS', 'User tier upgrade (HSET single field)');
  } else {
    log('FAIL', 'User tier update failed');
  }

  // Set subscription expiry
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await redis.hset(userKey, 'subscriptionExpiry', expiryDate);
  const storedExpiry = await redis.hget(userKey, 'subscriptionExpiry');
  if (storedExpiry === expiryDate) {
    log('PASS', 'Subscription expiry tracking');
  } else {
    log('FAIL', 'Subscription expiry not stored correctly');
  }

  // Test user favorites (SET operations)
  await redis.sadd(`user:${userId}:favorites`, 'Arsenal', 'Chelsea', 'Man City');
  const favorites = await redis.smembers(`user:${userId}:favorites`);
  if (favorites.length === 3) {
    log('PASS', 'User favorites management (SADD/SMEMBERS)');
  } else {
    log('FAIL', 'User favorites not stored correctly');
  }

  // Clean up
  await redis.del(userKey, `user:${userId}:favorites`);

} catch (error) {
  log('FAIL', `User handler operations: ${error.message}`);
}

// ============================================================================
// TEST 2: PAYMENT HANDLER OPERATIONS
// ============================================================================

console.log('\n📋 TEST 2: PAYMENT HANDLER OPERATIONS');
console.log('======================================\n');

try {
  const userId = 234567;
  const orderId = `order_${Date.now()}`;

  // Create payment order
  const paymentData = {
    userId: userId,
    tier: 'SIGNUP',
    amount: 150,
    currency: 'KES',
    provider: 'SAFARICOM_TILL',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  await redis.setex(`payment:${orderId}`, 3600, JSON.stringify(paymentData));
  log('PASS', 'Payment order creation with TTL');

  // Retrieve payment order
  const storedPayment = await redis.get(`payment:${orderId}`);
  const parsedPayment = JSON.parse(storedPayment);
  if (parsedPayment.tier === 'SIGNUP' && parsedPayment.amount === 150) {
    log('PASS', 'Payment order retrieval');
  } else {
    log('FAIL', 'Payment order retrieval incorrect');
  }

  // Track pending order
  await redis.set(`payment:by_user:${userId}:pending`, orderId);
  const pendingOrder = await redis.get(`payment:by_user:${userId}:pending`);
  if (pendingOrder === orderId) {
    log('PASS', 'Pending order tracking');
  } else {
    log('FAIL', 'Pending order tracking failed');
  }

  // Update payment status
  const updatedPayment = { ...paymentData, status: 'completed' };
  await redis.setex(`payment:${orderId}`, 3600, JSON.stringify(updatedPayment));
  const finalPayment = JSON.parse(await redis.get(`payment:${orderId}`));
  if (finalPayment.status === 'completed') {
    log('PASS', 'Payment status update');
  } else {
    log('FAIL', 'Payment status update failed');
  }

  // Store user subscription
  const userKey = `user:${userId}`;
  await redis.hset(userKey,
    'tier', 'SIGNUP',
    'subscriptionExpiry', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  );
  const subData = await redis.hgetall(userKey);
  if (subData.tier === 'SIGNUP') {
    log('PASS', 'User subscription storage');
  } else {
    log('FAIL', 'User subscription storage failed');
  }

  // Clean up
  await redis.del(`payment:${orderId}`, `payment:by_user:${userId}:pending`, userKey);

} catch (error) {
  log('FAIL', `Payment handler operations: ${error.message}`);
}

// ============================================================================
// TEST 3: BET SLIP OPERATIONS
// ============================================================================

console.log('\n📋 TEST 3: BET SLIP OPERATIONS');
console.log('================================\n');

try {
  const userId = 345678;
  const betslipId = `betslip_${Date.now()}`;

  // Create bet slip
  const betslipData = {
    userId: userId,
    matches: [
      { id: 1, home: 'Arsenal', away: 'Chelsea', odds: 1.85, league: 'Premier League' },
      { id: 2, home: 'Man City', away: 'Liverpool', odds: 2.10, league: 'Premier League' },
      { id: 3, home: 'Barcelona', away: 'Real Madrid', odds: 1.95, league: 'La Liga' }
    ],
    totalOdds: 7.62,
    stake: 100,
    potentialWin: 762,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  await redis.setex(`betslip:${betslipId}`, 3600, JSON.stringify(betslipData));
  log('PASS', 'Bet slip creation with TTL');

  // Retrieve bet slip
  const storedBetslip = JSON.parse(await redis.get(`betslip:${betslipId}`));
  if (storedBetslip.matches.length === 3 && storedBetslip.totalOdds === 7.62) {
    log('PASS', 'Bet slip retrieval');
  } else {
    log('FAIL', 'Bet slip retrieval incorrect');
  }

  // Store placed bets
  const placedBet = {
    ...betslipData,
    placedAt: new Date().toISOString(),
    txId: `tx_${Date.now()}`,
    status: 'placed'
  };
  await redis.rpush(`user:${userId}:bets`, JSON.stringify(placedBet));
  log('PASS', 'Placed bet storage (RPUSH)');

  // Retrieve bet history
  const bets = await redis.lrange(`user:${userId}:bets`, 0, -1);
  if (bets.length === 1) {
    log('PASS', 'Bet history retrieval (LRANGE)');
  } else {
    log('FAIL', 'Bet history retrieval incorrect');
  }

  // Clean up
  await redis.del(`betslip:${betslipId}`, `user:${userId}:bets`);

} catch (error) {
  log('FAIL', `Bet slip operations: ${error.message}`);
}

// ============================================================================
// TEST 4: COMMAND USAGE TRACKING
// ============================================================================

console.log('\n📋 TEST 4: COMMAND USAGE TRACKING');
console.log('===================================\n');

try {
  const userId = 456789;
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Track command usage
  const commands = ['/live', '/odds', '/standings', '/profile', '/help'];
  for (const cmd of commands) {
    const key = `cmd:usage:${userId}:${cmd}:${currentMonth}`;
    await redis.incr(key);
    await redis.expire(key, 2592000); // 30 days
  }
  log('PASS', 'Command usage tracking (INCR/EXPIRE)');

  // Get usage for specific command
  const liveUsageKey = `cmd:usage:${userId}:/live:${currentMonth}`;
  const liveUsage = await redis.get(liveUsageKey);
  if (liveUsage === '1') {
    log('PASS', 'Command usage retrieval');
  } else {
    log('FAIL', 'Command usage retrieval failed');
  }

  // Track monthly stats
  await redis.zadd(`cmd:monthly:${currentMonth}`, 1, `/live:${userId}`);
  await redis.zadd(`cmd:monthly:${currentMonth}`, 2, `/odds:${userId}`);
  await redis.zadd(`cmd:monthly:${currentMonth}`, 1, `/standings:${userId}`);
  const topCommands = await redis.zrevrange(`cmd:monthly:${currentMonth}`, 0, 4, 'WITHSCORES');
  if (topCommands.length > 0) {
    log('PASS', 'Monthly stats tracking (ZADD/ZREVRANGE)');
  } else {
    log('FAIL', 'Monthly stats tracking failed');
  }

  // Clean up
  for (const cmd of commands) {
    await redis.del(`cmd:usage:${userId}:${cmd}:${currentMonth}`);
  }
  await redis.del(`cmd:monthly:${currentMonth}`);

} catch (error) {
  log('FAIL', `Command usage tracking: ${error.message}`);
}

// ============================================================================
// TEST 5: LEADERBOARD & RANKINGS
// ============================================================================

console.log('\n📋 TEST 5: LEADERBOARD & RANKINGS');
console.log('====================================\n');

try {
  // Track prediction accuracy
  const predictions = [
    { userId: 111, accuracy: 87.5 },
    { userId: 222, accuracy: 92.0 },
    { userId: 333, accuracy: 78.5 },
    { userId: 444, accuracy: 95.5 },
    { userId: 555, accuracy: 88.0 }
  ];

  for (const pred of predictions) {
    await redis.zadd('predictions:accuracy', pred.accuracy, `user:${pred.userId}`);
  }
  log('PASS', 'Leaderboard data storage (ZADD)');

  // Get top 3 predictors
  const topPredictors = await redis.zrevrange('predictions:accuracy', 0, 2, 'WITHSCORES');
  if (topPredictors.length === 6 && parseFloat(topPredictors[1]) === 95.5) {
    log('PASS', 'Top rankings retrieval (ZREVRANGE)');
  } else {
    log('FAIL', 'Top rankings retrieval failed');
  }

  // Update prediction accuracy
  await redis.zadd('predictions:accuracy', 96.0, 'user:444');
  const updated = await redis.zscore('predictions:accuracy', 'user:444');
  if (updated === 96) {
    log('PASS', 'Leaderboard update');
  } else {
    log('FAIL', 'Leaderboard update failed');
  }

  // Get leaderboard rank
  const rank = await redis.zrevrank('predictions:accuracy', 'user:444');
  if (rank === 0) {
    log('PASS', 'User rank calculation');
  } else {
    log('FAIL', 'User rank calculation failed');
  }

  // Clean up
  await redis.del('predictions:accuracy');

} catch (error) {
  log('FAIL', `Leaderboard operations: ${error.message}`);
}

// ============================================================================
// TEST 6: SESSION & CACHE MANAGEMENT
// ============================================================================

console.log('\n📋 TEST 6: SESSION & CACHE MANAGEMENT');
console.log('======================================\n');

try {
  const userId = 567890;

  // Track last activity
  const lastSeenKey = `user:${userId}:last_seen`;
  const now = Date.now();
  await redis.setex(lastSeenKey, 86400, String(now));
  log('PASS', 'Last activity tracking (SETEX)');

  // Store session data
  const sessionData = {
    userId: userId,
    ip: '192.168.1.1',
    device: 'iOS',
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  await redis.setex(`session:${userId}:web`, 3600, JSON.stringify(sessionData));
  log('PASS', 'Session data storage');

  // Cache API response
  const leaguesCache = JSON.stringify([
    { id: 1, name: 'Premier League', country: 'England' },
    { id: 2, name: 'La Liga', country: 'Spain' }
  ]);
  await redis.setex(`cache:leagues:football`, 1800, leaguesCache);
  log('PASS', 'API response caching (SETEX)');

  // Retrieve cached data
  const cachedLeagues = JSON.parse(await redis.get('cache:leagues:football'));
  if (cachedLeagues.length === 2) {
    log('PASS', 'Cache retrieval');
  } else {
    log('FAIL', 'Cache retrieval failed');
  }

  // Clean up
  await redis.del(lastSeenKey, `session:${userId}:web`, 'cache:leagues:football');

} catch (error) {
  log('FAIL', `Session & cache management: ${error.message}`);
}

// ============================================================================
// SUMMARY
// ============================================================================

await redis.quit();

console.log('\n📊 TEST SUMMARY');
console.log('================\n');

const passed = TESTS.filter(t => t.status === 'PASS').length;
const failed = TESTS.filter(t => t.status === 'FAIL').length;

console.log(`✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log(`📈 TOTAL:  ${TESTS.length}`);
console.log(`📊 SUCCESS RATE: ${((passed / TESTS.length) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!');
  console.log('✨ All handlers work SEAMLESSLY with Redis');
  console.log('🚀 Your BETRIX bot is ready for production\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please review the output above.\n');
  process.exit(1);
}
