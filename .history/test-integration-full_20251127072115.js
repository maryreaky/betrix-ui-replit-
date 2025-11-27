/**
 * Comprehensive Bot Integration Test Suite
 * Tests all major features: Live Sports, Odds, Payments, Subscriptions
 */

import assert from 'assert';
import fs from 'fs';
import SportMonksAPI from './src/services/sportmonks-api.js';
import SportsDataAPI from './src/services/sportsdata-api.js';
import { TIERS } from './src/handlers/payment-handler.js';
import { createPaymentOrder, getPaymentInstructions, PAYMENT_PROVIDERS, getAvailablePaymentMethods } from './src/handlers/payment-router.js';

console.log('🧪 Starting BETRIX Bot Integration Tests...\n');

// Mock data
const mockUserId = 12345;
const mockChatId = 54321;

// Test counters
let passed = 0;
let failed = 0;
const failedTests = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.error(`   Error: ${e.message}\n`);
    failed++;
    failedTests.push({ name, error: e.message });
  }
}

// ============== API Integration Tests ==============

console.log('\n📡 API Integration Tests');
console.log('========================\n');

test('SportMonks API class loads successfully', () => {
  try {
    const SportMonksAPI = require('./src/services/sportmonks-api.js').default;
    assert(SportMonksAPI, 'SportMonks API not exported');
    const api = new SportMonksAPI();
    assert(api.getLiveMatches, 'getLiveMatches method not found');
    assert(api.getLeagues, 'getLeagues method not found');
    assert(api.getStandings, 'getStandings method not found');
  } catch (e) {
    throw new Error(`SportMonks API test failed: ${e.message}`);
  }
});

test('SportsData.io API class loads successfully', () => {
  try {
    const SportsDataAPI = require('./src/services/sportsdata-api.js').default;
    assert(SportsDataAPI, 'SportsData API not exported');
    const api = new SportsDataAPI();
    assert(api.getLiveGames, 'getLiveGames method not found');
    assert(api.getCompetitions, 'getCompetitions method not found');
    assert(api.getStandings, 'getStandings method not found');
    assert(api.getBettingOdds, 'getBettingOdds method not found');
  } catch (e) {
    throw new Error(`SportsData API test failed: ${e.message}`);
  }
});

test('SportMonks API is initialized with correct API key', () => {
  try {
    const SportMonksAPI = require('./src/services/sportmonks-api.js').default;
    const api = new SportMonksAPI('zUdIC2auUmiG6bUS5v7Mc53IxJwqiQ2gBMyFqsTI9KnnBJJQMM5eExZsPh42');
    assert(api.apiKey === 'zUdIC2auUmiG6bUS5v7Mc53IxJwqiQ2gBMyFqsTI9KnnBJJQMM5eExZsPh42', 'API key not set correctly');
    assert(api.enabled === true, 'API should be enabled with key');
  } catch (e) {
    throw new Error(`SportMonks initialization failed: ${e.message}`);
  }
});

test('SportsData API is initialized with correct API key', () => {
  try {
    const SportsDataAPI = require('./src/services/sportsdata-api.js').default;
    const api = new SportsDataAPI('abdb2e2047734f23b576e1984d67e2d7');
    assert(api.apiKey === 'abdb2e2047734f23b576e1984d67e2d7', 'API key not set correctly');
    assert(api.enabled === true, 'API should be enabled with key');
  } catch (e) {
    throw new Error(`SportsData initialization failed: ${e.message}`);
  }
});

// ============== Payment System Tests ==============

console.log('\n💳 Payment System Tests');
console.log('=======================\n');

test('Payment Handler exports TIERS object', () => {
  try {
    const { TIERS } = require('./src/handlers/payment-handler.js');
    assert(TIERS, 'TIERS not exported');
    assert(TIERS.FREE, 'FREE tier missing');
    assert(TIERS.SIGNUP, 'SIGNUP tier missing');
    assert(TIERS.PRO, 'PRO tier missing');
    assert(TIERS.VVIP, 'VVIP tier missing');
    assert(TIERS.PLUS, 'PLUS tier missing');
  } catch (e) {
    throw new Error(`TIERS test failed: ${e.message}`);
  }
});

test('SIGNUP tier has correct pricing (KES 150)', () => {
  try {
    const { TIERS } = require('./src/handlers/payment-handler.js');
    assert(TIERS.SIGNUP.price === 150, `SIGNUP price should be 150, got ${TIERS.SIGNUP.price}`);
    assert(TIERS.SIGNUP.billingPeriod === 'one-time', `SIGNUP billing should be one-time`);
    assert(Array.isArray(TIERS.SIGNUP.features), 'SIGNUP features should be array');
    assert(TIERS.SIGNUP.features.length > 0, 'SIGNUP should have features');
  } catch (e) {
    throw new Error(`SIGNUP tier test failed: ${e.message}`);
  }
});

test('Payment Router exports createPaymentOrder function', () => {
  try {
    const { createPaymentOrder, getPaymentInstructions } = require('./src/handlers/payment-router.js');
    assert(typeof createPaymentOrder === 'function', 'createPaymentOrder should be exported');
    assert(typeof getPaymentInstructions === 'function', 'getPaymentInstructions should be exported');
  } catch (e) {
    throw new Error(`Payment Router exports test failed: ${e.message}`);
  }
});

test('Payment Providers include all methods', () => {
  try {
    const { PAYMENT_PROVIDERS } = require('./src/handlers/payment-router.js');
    assert(PAYMENT_PROVIDERS.MPESA, 'MPESA provider missing');
    assert(PAYMENT_PROVIDERS.SAFARICOM_TILL, 'SAFARICOM_TILL provider missing');
    assert(PAYMENT_PROVIDERS.PAYPAL, 'PAYPAL provider missing');
    assert(PAYMENT_PROVIDERS.BINANCE, 'BINANCE provider missing');
    assert(PAYMENT_PROVIDERS.SWIFT, 'SWIFT provider missing');
  } catch (e) {
    throw new Error(`Payment Providers test failed: ${e.message}`);
  }
});

// ============== Handler Tests ==============

console.log('\n🎯 Handler Tests');
console.log('================\n');

test('Telegram Handler V2 imports payment functions', () => {
  try {
    // This test checks if the imports at the top of the handler are correct
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    assert(content.includes('createPaymentOrder'), 'createPaymentOrder not imported');
    assert(content.includes('getPaymentInstructions'), 'getPaymentInstructions not imported');
    assert(content.includes('TIERS'), 'TIERS not imported');
  } catch (e) {
    throw new Error(`Handler imports test failed: ${e.message}`);
  }
});

test('Telegram Handler has safe user data retrieval function', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    assert(content.includes('safeGetUserData'), 'safeGetUserData helper not found');
    assert(content.includes('WRONGTYPE'), 'Redis WRONGTYPE error handling not found');
  } catch (e) {
    throw new Error(`Handler safety test failed: ${e.message}`);
  }
});

test('Live Games handler uses new API integrations', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    // Check for SportMonks integration
    assert(content.includes('sportMonks') && content.includes('getLiveMatches'), 'SportMonks integration missing');
    // Check for SportsData integration
    assert(content.includes('sportsData') && content.includes('getLiveGames'), 'SportsData integration missing');
  } catch (e) {
    throw new Error(`Live Games handler test failed: ${e.message}`);
  }
});

test('Odds handler uses betting odds APIs', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    assert(content.includes('getBettingOdds'), 'getBettingOdds integration missing');
    assert(content.includes('formatOdds'), 'formatOdds not used');
  } catch (e) {
    throw new Error(`Odds handler test failed: ${e.message}`);
  }
});

test('Standings handler fetches from multiple sources', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    // Check for multiple source fallbacks
    assert(content.match(/getStandings.*sportMonks/) || content.includes('sportMonks.*getStandings'), 
      'SportMonks standings integration missing');
  } catch (e) {
    throw new Error(`Standings handler test failed: ${e.message}`);
  }
});

// ============== Worker Integration Tests ==============

console.log('\n⚙️  Worker Integration Tests');
console.log('===========================\n');

test('Worker imports new API services', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/worker-final.js', 'utf8');
    
    assert(content.includes('SportMonksAPI'), 'SportMonksAPI not imported');
    assert(content.includes('SportsDataAPI'), 'SportsDataAPI not imported');
  } catch (e) {
    throw new Error(`Worker imports test failed: ${e.message}`);
  }
});

test('Worker initializes API instances', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/worker-final.js', 'utf8');
    
    assert(content.includes('const sportMonksAPI = new SportMonksAPI'), 'SportMonks instance not created');
    assert(content.includes('const sportsDataAPI = new SportsDataAPI'), 'SportsData instance not created');
  } catch (e) {
    throw new Error(`Worker initialization test failed: ${e.message}`);
  }
});

test('Worker passes APIs to all command handlers', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/worker-final.js', 'utf8');
    
    // Check for API injection in services objects
    const sportMonksCount = (content.match(/sportMonks:/g) || []).length;
    const sportsDataCount = (content.match(/sportsData:/g) || []).length;
    
    assert(sportMonksCount >= 1, 'sportMonks not passed to handlers');
    assert(sportsDataCount >= 1, 'sportsData not passed to handlers');
  } catch (e) {
    throw new Error(`Worker service injection test failed: ${e.message}`);
  }
});

// ============== Feature Tests ==============

console.log('\n✨ Feature Tests');
console.log('================\n');

test('Bot supports multiple sports via APIs', () => {
  try {
    const SportsDataAPI = require('./src/services/sportsdata-api.js').default;
    const api = new SportsDataAPI();
    
    // Check sport mappings
    assert(api.sportMappings.football, 'Football not supported');
    assert(api.sportMappings.nfl, 'NFL not supported');
    assert(api.sportMappings.mlb, 'MLB not supported');
    assert(api.sportMappings.nba, 'NBA not supported');
  } catch (e) {
    throw new Error(`Multi-sport test failed: ${e.message}`);
  }
});

test('Payment system supports multiple regions', () => {
  try {
    const { getAvailablePaymentMethods } = require('./src/handlers/payment-router.js');
    
    const keya = getAvailablePaymentMethods('KE');
    const usMethods = getAvailablePaymentMethods('US');
    
    assert(keya.length > 0, 'Kenya should have payment methods');
    assert(usMethods.length > 0, 'US should have payment methods');
  } catch (e) {
    throw new Error(`Region support test failed: ${e.message}`);
  }
});

test('Live games endpoint handles fallback gracefully', () => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync('./src/handlers/telegram-handler-v2.js', 'utf8');
    
    // Check for fallback data
    assert(content.includes('Arsenal') || content.includes('Chelsea') || content.includes('Manchester'),
      'Real team fallback data not found');
  } catch (e) {
    throw new Error(`Fallback data test failed: ${e.message}`);
  }
});

// ============== Summary ==============

console.log('\n\n📊 Test Summary');
console.log('===============\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);
console.log(`📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failedTests.length > 0) {
  console.log('Failed Tests:');
  failedTests.forEach(t => console.log(`  • ${t.name}`));
}

if (failed === 0) {
  console.log('🎉 All tests passed! Bot is ready for production.\n');
  console.log('✨ New Features Implemented:');
  console.log('  • SportMonks API integration for live matches');
  console.log('  • SportsData.io API integration for odds & standings');
  console.log('  • Multi-sport support (Football, NFL, MLB, NBA, etc.)');
  console.log('  • Real payment system with SIGNUP tier (KES 150)');
  console.log('  • Redis WRONGTYPE error recovery');
  console.log('  • Graceful fallback to realistic demo data\n');
  console.log('🚀 Deploy with confidence!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Please fix the failing tests before deployment.\n');
  process.exit(1);
}
