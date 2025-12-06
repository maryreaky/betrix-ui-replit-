#!/usr/bin/env node
/**
 * REDIS HEALTH MONITOR & SEAMLESS CONNECTION CHECKER
 * Continuously monitors Redis health and reports status
 * Run: node scripts/monitor-redis-health.js
 */

import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const CHECK_INTERVAL = process.env.REDIS_HEALTH_CHECK_INTERVAL || 30000; // 30 seconds
const ALERT_THRESHOLD = process.env.REDIS_ALERT_THRESHOLD || 5; // Alert after 5 consecutive failures

// ============================================================================
// INITIALIZATION
// ============================================================================

if (!REDIS_URL) {
  console.error('❌ CRITICAL: REDIS_URL environment variable not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL, {
  connectTimeout: 5000,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 1000);
  }
});

let consecutiveFailures = 0;
let lastErrorTime = null;
let isHealthy = false;

// ============================================================================
// METRICS
// ============================================================================

class HealthMetrics {
  constructor() {
    this.totalChecks = 0;
    this.successfulChecks = 0;
    this.failedChecks = 0;
    this.avgResponseTime = 0;
    this.maxResponseTime = 0;
    this.minResponseTime = Infinity;
    this.startTime = Date.now();
    this.errors = [];
  }

  recordSuccess(responseTime) {
    this.successfulChecks++;
    this.totalChecks++;
    this.avgResponseTime = (this.avgResponseTime + responseTime) / 2;
    this.maxResponseTime = Math.max(this.maxResponseTime, responseTime);
    this.minResponseTime = Math.min(this.minResponseTime, responseTime);
  }

  recordFailure(error) {
    this.failedChecks++;
    this.totalChecks++;
    this.errors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      code: error.code
    });
    // Keep only last 10 errors
    if (this.errors.length > 10) {
      this.errors.shift();
    }
  }

  getSuccessRate() {
    return this.totalChecks === 0 ? 0 : ((this.successfulChecks / this.totalChecks) * 100).toFixed(1);
  }

  getUptimeSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getReport() {
    return {
      totalChecks: this.totalChecks,
      successfulChecks: this.successfulChecks,
      failedChecks: this.failedChecks,
      successRate: `${this.getSuccessRate()}%`,
      responseTime: {
        avg: `${this.avgResponseTime.toFixed(2)}ms`,
        min: this.minResponseTime === Infinity ? 'N/A' : `${this.minResponseTime.toFixed(2)}ms`,
        max: `${this.maxResponseTime.toFixed(2)}ms`
      },
      uptime: `${this.getUptimeSeconds()}s`,
      recentErrors: this.errors.slice(-3)
    };
  }
}

const metrics = new HealthMetrics();

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

async function performHealthCheck() {
  const checkStartTime = Date.now();

  try {
    // Test 1: PING
    const pingResult = await redis.ping();
    if (pingResult !== 'PONG') {
      throw new Error(`PING returned ${pingResult} instead of PONG`);
    }

    // Test 2: GET/SET operation
    const testKey = `__health_check_${Date.now()}__`;
    const testValue = 'ok';
    await redis.setex(testKey, 60, testValue);
    const retrievedValue = await redis.get(testKey);
    
    if (retrievedValue !== testValue) {
      throw new Error(`GET/SET test failed: expected '${testValue}', got '${retrievedValue}'`);
    }

    // Test 3: Database info
<<<<<<< HEAD
    await redis.info('stats');
=======
    const info = await redis.info('stats');
>>>>>>> upstream/main
    
    // Test 4: Command latency
    const latencyStart = Date.now();
    await redis.command();
    const latency = Date.now() - latencyStart;

    const responseTime = Date.now() - checkStartTime;
    metrics.recordSuccess(responseTime);
    isHealthy = true;
    consecutiveFailures = 0;
    lastErrorTime = null;

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      latency: `${latency}ms`,
      tests: {
        ping: 'PASS',
        getset: 'PASS',
        info: 'PASS',
        command: 'PASS'
      }
    };

  } catch (error) {
    const responseTime = Date.now() - checkStartTime;
    metrics.recordFailure(error);
    consecutiveFailures++;
    lastErrorTime = new Date().toISOString();
    isHealthy = false;

    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: error.message,
      code: error.code,
      consecutiveFailures: consecutiveFailures,
      willAlert: consecutiveFailures >= ALERT_THRESHOLD
    };
  }
}

// ============================================================================
// DISPLAY & LOGGING
// ============================================================================

function formatOutput(result) {
  const timestamp = new Date().toLocaleString();
  const statusIcon = result.status === 'healthy' ? '✅' : '❌';
  
  console.clear();
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         BETRIX REDIS HEALTH MONITOR - SEAMLESS STATUS          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`${statusIcon} Status: ${result.status.toUpperCase()}`);
  console.log(`📅 Check Time: ${timestamp}`);
  console.log(`⏱️  Response Time: ${result.responseTime}`);
  
  if (result.status === 'healthy') {
    console.log(`🔗 Latency: ${result.latency}`);
    console.log(`\n✨ All Tests Passed:`);
    Object.entries(result.tests).forEach(([test, status]) => {
      console.log(`   ✓ ${test.toUpperCase()}: ${status}`);
    });
  } else {
    console.log(`⚠️  Error: ${result.error}`);
    console.log(`📊 Consecutive Failures: ${result.consecutiveFailures}`);
    if (result.willAlert) {
      console.log(`\n🚨 ALERT: Redis connection issues detected!`);
      console.log(`   Action: Check network, Redis status, and credentials`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const report = metrics.getReport();
  console.log('📊 METRICS (Session Total):\n');
  console.log(`   Total Checks: ${report.totalChecks}`);
  console.log(`   Success Rate: ${report.successRate}`);
  console.log(`   Response Time:`);
  console.log(`     • Average: ${report.responseTime.avg}`);
  console.log(`     • Min: ${report.responseTime.min}`);
  console.log(`     • Max: ${report.responseTime.max}`);
  console.log(`   Uptime: ${report.uptime}`);
  
  if (report.recentErrors.length > 0) {
    console.log(`\n   Last ${report.recentErrors.length} Error(s):`);
    report.recentErrors.forEach((err, idx) => {
      console.log(`     ${idx + 1}. [${err.code}] ${err.error} (${err.timestamp})`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (result.status === 'healthy') {
    console.log('🎉 Redis connection is SEAMLESS and HEALTHY');
    console.log('🚀 All BETRIX bot features are operational\n');
  } else {
    console.log('⚠️  Redis connection has ISSUES');
    if (consecutiveFailures >= ALERT_THRESHOLD) {
      console.log('🚨 CRITICAL: Multiple failures detected');
    }
    console.log('📋 Recommendations:');
    console.log('   1. Verify REDIS_URL is correctly set');
    console.log('   2. Check network connectivity to Redis host');
    console.log('   3. Verify Redis credentials are correct');
    console.log('   4. Check firewall/security group rules');
    console.log('   5. Restart worker: npm run worker\n');
  }
}

// ============================================================================
// CONTINUOUS MONITORING
// ============================================================================

async function startMonitoring() {
  console.log(`🔄 Starting Redis health monitoring every ${CHECK_INTERVAL / 1000}s...\n`);

  // Initial check
  const result = await performHealthCheck();
  formatOutput(result);

  // Continuous monitoring
  setInterval(async () => {
    const result = await performHealthCheck();
    
    // Only display full output on status change or failure
    if (result.status === 'unhealthy' || !isHealthy) {
      formatOutput(result);
    } else {
      // Brief status for healthy checks
      process.stdout.write(`\r✅ Healthy (${metrics.totalChecks} checks, ${metrics.getSuccessRate()}% success rate)`);
    }

    // Send alert if threshold exceeded
    if (consecutiveFailures >= ALERT_THRESHOLD) {
      console.error('\n🚨 ALERT: Redis connection threshold exceeded!');
      console.error(`Last error: ${lastErrorTime}`);
      console.error(`Consecutive failures: ${consecutiveFailures}\n`);
    }
  }, CHECK_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n📋 Final Report:');
    console.log(JSON.stringify(metrics.getReport(), null, 2));
    redis.quit();
    process.exit(0);
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

<<<<<<< HEAD
redis.on('error', (err) => { void err; });
=======
redis.on('error', (err) => {
  // Errors are handled in performHealthCheck
});
>>>>>>> upstream/main

redis.on('connect', () => {
  console.log('[redis-health] ✅ Connected to Redis');
});

redis.on('end', () => {
  console.log('[redis-health] ⚠️  Redis connection ended');
});

// ============================================================================
// MAIN
// ============================================================================

startMonitoring().catch((error) => {
  console.error('❌ Failed to start health monitor:', error.message);
  process.exit(1);
});
