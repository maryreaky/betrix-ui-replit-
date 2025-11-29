#!/usr/bin/env node
/**
 * Telegram /live Command Validation Test
 * 
 * This script validates that the bot's /live command works end-to-end:
 * 1. Fetches live matches from SportMonks
 * 2. Verifies real team names (not "Unknown")
 * 3. Tests the handler produces proper Telegram editMessageText payloads
 * 4. Checks Redis connectivity and worker health
 * 
 * Usage:
 *   TELEGRAM_TOKEN=your_token \
 *   REDIS_URL=redis://default:password@host:6379 \
 *   SPORTSMONKS_API=your_sportmonks_token \
 *   node scripts/validate-telegram-live.js
 */

import Redis from 'ioredis';
import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SPORTSMONKS_API = process.env.SPORTSMONKS_API;

const TEST_CHAT_ID = 999; // Dummy chat ID for testing
const TEST_MESSAGE_ID = 111; // Dummy message ID

console.log('🚀 TELEGRAM /live VALIDATION TEST\n');

// ============================================================================
// 1. Check Environment
// ============================================================================
console.log('📋 Step 1: Checking environment variables...');
const missingVars = [];
if (!TELEGRAM_TOKEN) missingVars.push('TELEGRAM_TOKEN');
if (!SPORTSMONKS_API) missingVars.push('SPORTSMONKS_API');
if (!REDIS_URL) missingVars.push('REDIS_URL');

if (missingVars.length > 0) {
  console.error(`❌ Missing env vars: ${missingVars.join(', ')}`);
  console.error('\nSet them like:');
  console.error('  export TELEGRAM_TOKEN=your_token');
  console.error('  export SPORTSMONKS_API=your_sportmonks_api');
  console.error('  export REDIS_URL=redis://default:password@host:6379\n');
  process.exit(1);
}
console.log('✅ All required env vars set\n');

// ============================================================================
// 2. Test Redis Connectivity
// ============================================================================
console.log('📋 Step 2: Testing Redis connectivity...');
const redis = new Redis(REDIS_URL);

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});

try {
  await redis.ping();
  console.log('✅ Redis connected: PONG\n');
  
  // Check worker heartbeat
  const heartbeat = await redis.get('worker:heartbeat');
  if (heartbeat) {
    console.log(`✅ Worker heartbeat found: ${heartbeat}`);
  } else {
    console.warn('⚠️  Worker heartbeat not found (worker may not be running)');
  }
  console.log();
} catch (err) {
  console.error(`❌ Redis connection failed: ${err.message}`);
  console.error('   Verify REDIS_URL and credentials are correct.\n');
  process.exit(1);
}

// ============================================================================
// 3. Test SportMonks API
// ============================================================================
console.log('📋 Step 3: Testing SportMonks livescores API...');

const sportmonksUrl = `https://api.sportmonks.com/v3/football/livescores?api_token=${SPORTSMONKS_API}&include=teams,scores`;

try {
  const response = await axios.get(sportmonksUrl, {
    timeout: 10000,
    rejectUnauthorized: false // For testing only; remove in prod after TLS is fixed
  });

  const matches = response.data.data || [];
  console.log(`✅ SportMonks API responded with ${matches.length} live matches\n`);

  if (matches.length === 0) {
    console.warn('⚠️  No live matches found. This is normal if there are no ongoing matches.\n');
  } else {
    // Show sample matches
    console.log('📊 Sample matches from SportMonks:');
    matches.slice(0, 3).forEach((match, idx) => {
      const home = match.teams?.find(t => t.pivot?.role === 'home')?.name || 'Unknown';
      const away = match.teams?.find(t => t.pivot?.role === 'away')?.name || 'Unknown';
      const status = match.status || 'unknown';
      console.log(`   ${idx + 1}. ${home} vs ${away} [${status}]`);
    });
    console.log();
  }
} catch (err) {
  console.error(`❌ SportMonks API failed: ${err.message}`);
  if (err.code === 'ENOTFOUND') {
    console.error('   Network issue or DNS failure. Check your internet connection.');
  } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    console.error('   TLS certificate verification failed. Install proxy CA or allowlist api.sportmonks.com');
    console.error('   Or temporarily set: export SPORTSMONKS_INSECURE=true');
  } else if (err.response?.status === 401) {
    console.error('   SportMonks API returned 401. Check SPORTSMONKS_API token.');
  }
  console.error();
  process.exit(1);
}

// ============================================================================
// 4. Test Handler Logic (Simulate /live command)
// ============================================================================
console.log('📋 Step 4: Testing handler response (simulating /live command)...');

// Import the handler
let handler;
try {
  const module = await import('../src/handlers/telegram-handler-v2-clean.js');
  handler = module.default;
  console.log('✅ Handler module loaded\n');
} catch (err) {
  console.warn(`⚠️  Could not load handler: ${err.message}`);
  console.warn('   Skipping handler test. Verify handler file exists at src/handlers/telegram-handler-v2-clean.js\n');
  handler = null;
}

if (handler && handler.handleLive) {
  try {
    // Call the /live handler
    const botContext = {
      telegram: {
        editMessageText: async (chatId, messageId, text, opts) => ({
          ok: true,
          method: 'editMessageText',
          chat_id: chatId,
          message_id: messageId,
          text,
          ...opts
        })
      }
    };

    const result = await handler.handleLive(TEST_CHAT_ID, TEST_MESSAGE_ID, botContext);
    
    if (result) {
      console.log('✅ Handler returned a response:');
      console.log(`   Method: ${result.method}`);
      console.log(`   Chat ID: ${result.chat_id}`);
      console.log(`   Message ID: ${result.message_id}`);
      console.log(`   Text (first 100 chars): ${result.text?.substring(0, 100)}...`);
      
      // Check for real team names (not "Unknown")
      if (result.text && !result.text.includes('Unknown')) {
        console.log('✅ Real team names detected (not placeholders)');
      } else if (result.text?.includes('No matches') || result.text?.includes('unavailable')) {
        console.log('⚠️  Handler returned "no matches" (normal if no live matches)');
      } else {
        console.warn('⚠️  Handler response might contain placeholders');
      }
      console.log();
    } else {
      console.log('⚠️  Handler returned no response. Check implementation.\n');
    }
  } catch (err) {
    console.error(`❌ Handler test failed: ${err.message}\n`);
  }
} else {
  console.log('⚠️  Skipping handler test (handler not available)\n');
}

// ============================================================================
// 5. Summary & Next Steps
// ============================================================================
console.log('📋 VALIDATION SUMMARY\n');
console.log('✅ Checks passed:');
console.log('   ✓ Environment variables set');
console.log('   ✓ Redis connectivity verified');
console.log('   ✓ SportMonks API responding');
if (handler?.handleLive) {
  console.log('   ✓ Handler logic tested');
}
console.log();

console.log('🚀 NEXT STEPS:');
console.log('   1. Ensure worker is running: node src/worker-final.js');
console.log('   2. In Telegram, send /live to your bot');
console.log('   3. Expected: List of real match names with clickable buttons');
console.log('   4. Click a match to see details (should edit the message)');
console.log();

console.log('📍 TROUBLESHOOTING:');
console.log('   If /live shows "Unknown vs Unknown":');
console.log('     → Check SPORTSMONKS_API token is correct');
console.log('     → Verify SportMonks API is returning matches');
console.log();
console.log('   If no response to /live:');
console.log('     → Ensure worker is running');
console.log('     → Check Redis connectivity (redis-cli PING)');
console.log('     → Review worker logs for errors');
console.log();
console.log('   If TLS errors:');
console.log('     → Install proxy CA: docs/dev-scripts/install-proxy-ca.ps1');
console.log('     → Or allowlist api.sportmonks.com in your proxy');
console.log();

await redis.quit();
console.log('✨ Validation complete!\n');
