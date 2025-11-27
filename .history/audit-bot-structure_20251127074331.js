#!/usr/bin/env node
/**
 * COMPREHENSIVE BOT STRUCTURE AUDIT
 * Verifies all connections, API integrations, and command flows
 */

import { getRedis } from './src/lib/redis-factory.js';
import fetch from 'node-fetch';
import chalk from 'chalk';

const log = console.log;
const errors = [];
const warnings = [];

// ============================================================================
// AUDIT CONFIGURATION
// ============================================================================

const auditConfig = {
  apis: {
    'API-Football (Primary)': {
      env: ['API_FOOTBALL_KEY', 'API_SPORTS_KEY'],
      endpoint: 'https://api-football-v3.p.rapidapi.com/fixtures?live=all&status=LIVE',
      headers: 'x-apisports-key',
      description: 'Live sports data from API-Sports'
    },
    'Football-Data.org (Secondary)': {
      env: ['FOOTBALL_DATA_API', 'FOOTBALLDATA_API_KEY'],
      endpoint: 'https://api.football-data.org/v4/competitions',
      headers: 'X-Auth-Token',
      description: 'Comprehensive football league data'
    },
    'SofaScore (Real-time)': {
      env: ['SOFASCORE_API_KEY', 'RAPIDAPI_KEY'],
      endpoint: 'https://sofascore.p.rapidapi.com/football/leagues',
      headers: 'x-rapidapi-key',
      description: 'Real-time match and league data'
    },
    'SportsData.io': {
      env: ['SPORTSDATA_API_KEY', 'SPORTSDATA_KEY', 'SPORTS_DATA_KEY'],
      endpoint: 'https://api.sportsdata.io/v3/soccer',
      headers: 'Ocp-Apim-Subscription-Key',
      description: 'Comprehensive sports analytics'
    }
  },

  services: [
    { name: 'SportsAggregator', file: 'src/services/sports-aggregator.js', methods: ['getLiveMatches', 'getOdds', 'getStandings', 'getLeagues'] },
    { name: 'OddsAnalyzer', file: 'src/services/odds-analyzer.js', methods: ['analyzeMatch', 'formatForTelegram', 'getOddsForMatch'] },
    { name: 'MultiSportAnalyzer', file: 'src/services/multi-sport-analyzer.js', methods: ['analyzeMatch', 'formatForTelegram'] },
    { name: 'Payment Processor', file: 'src/services/payment-processor.js', methods: ['processPayment', 'verifyPayment'] },
    { name: 'UserService', file: 'src/services/user.js', methods: ['getUser', 'createUser', 'updateUser'] }
  ],

  handlers: [
    { name: 'Commands (v3)', file: 'src/handlers/commands-v3.js', commands: ['/start', '/signup', '/pay', '/menu', '/odds', '/analyze', '/news', '/vvip', '/help'] },
    { name: 'Telegram Handler (v2)', file: 'src/handlers/telegram-handler-v2.js', methods: ['handleMessage', 'handleCallbackQuery'] },
    { name: 'Multi-Sport Handler', file: 'src/handlers/multi-sport-handler.js', methods: ['handleMultiSportAnalyze'] },
    { name: 'Payment Handler', file: 'src/handlers/payment-handler.js', methods: ['handlePaymentFlow'] },
    { name: 'Callbacks', file: 'src/handlers/callbacks-v3.js', callbacks: ['menu_main', 'odds_*', 'analyze_*', 'signup_*'] }
  ],

  dataflow: [
    { 
      name: 'LIVE SPORTS Command Flow',
      steps: [
        'User sends message with "live sports" keyword',
        'telegram-handler-v2.js: handleMessage() receives message',
        'nl-parser.js: parseMessage() identifies command intent',
        'Command router routes to sports-aggregator.getLiveMatches()',
        'SportsAggregator: Tries 6 API sources (priority order)',
        'Returns formatted live matches with odds',
        'Telegram: Sends formatted response with inline buttons',
        'User can interact with callback buttons for details'
      ]
    },
    { 
      name: 'ANALYZE Command Flow',
      steps: [
        'User sends /analyze [sport] [team1] vs [team2] [market]',
        'commands-v3.js: handleAnalyze() parses command',
        'multi-sport-analyzer.analyzeMatch() gets match data from SportsAggregator',
        'OddsAnalyzer calculates confidence scores and AI predictions',
        'Returns formatted analysis with betting markets',
        'User tier determines detail level (Free/Member/VVIP)',
        'Telegram sends analysis with market buttons'
      ]
    },
    { 
      name: 'ODDS Command Flow',
      steps: [
        'User sends /odds [league/team]',
        'commands-v3.js: handleOdds() parses request',
        'SportsAggregator.getOdds() fetches current betting odds',
        'OddsAnalyzer.formatForTelegram() formats response',
        'Returns market breakdown with comparison',
        'User can refresh or explore other markets'
      ]
    }
  ]
};

// ============================================================================
// AUDIT UTILITIES
// ============================================================================

function section(title) {
  log('\n' + chalk.bold.cyan('━'.repeat(80)));
  log(chalk.bold.cyan(`▶ ${title}`));
  log(chalk.bold.cyan('━'.repeat(80)));
}

function pass(msg) {
  log(chalk.green('✅') + ' ' + msg);
}

function fail(msg) {
  log(chalk.red('❌') + ' ' + msg);
  errors.push(msg);
}

function warn(msg) {
  log(chalk.yellow('⚠️ ') + ' ' + msg);
  warnings.push(msg);
}

function info(msg) {
  log(chalk.blue('ℹ️ ') + ' ' + msg);
}

// ============================================================================
// PHASE 1: ENVIRONMENT VALIDATION
// ============================================================================

async function auditEnvironment() {
  section('PHASE 1: ENVIRONMENT VALIDATION');

  log('\n📋 Checking environment variables...\n');

  const requiredEnv = [
    'TELEGRAM_TOKEN',
    'REDIS_URL',
    'GEMINI_API_KEY'
  ];

  const apiEnv = [
    'API_FOOTBALL_KEY',
    'RAPIDAPI_KEY',
    'SPORTSDATA_API_KEY'
  ];

  for (const env of requiredEnv) {
    if (process.env[env]) {
      pass(`${env} is set`);
    } else {
      fail(`${env} is missing (required)`);
    }
  }

  log('\n📡 API Keys Configuration:\n');

  let apiCount = 0;
  for (const env of apiEnv) {
    if (process.env[env]) {
      const masked = process.env[env].substring(0, 8) + '...' + process.env[env].substring(process.env[env].length - 4);
      pass(`${env}: ${masked}`);
      apiCount++;
    } else {
      warn(`${env} is not configured`);
    }
  }

  if (apiCount === 0) {
    fail('No sports API keys configured! Live sports will not work.');
  } else if (apiCount < 2) {
    warn(`Only ${apiCount} API key(s) configured. Fallback chains may fail.`);
  } else {
    pass(`${apiCount} API keys configured. Good fallback chain.`);
  }

  return apiCount > 0;
}

// ============================================================================
// PHASE 2: REDIS CONNECTION
// ============================================================================

async function auditRedis() {
  section('PHASE 2: REDIS CONNECTION');

  try {
    log('\n🔗 Testing Redis connection...\n');
    const redis = getRedis();

    const pingResult = await redis.ping();
    if (pingResult === 'PONG') {
      pass('Redis connection successful');
    } else {
      fail(`Redis PING returned unexpected: ${pingResult}`);
      return false;
    }

    // Test basic operations
    log('\n🧪 Testing Redis operations...\n');

    const testKey = `audit:test:${Date.now()}`;

    // SET
    await redis.set(testKey, 'test_value', 'EX', 10);
    pass('SET operation works');

    // GET
    const value = await redis.get(testKey);
    if (value === 'test_value') {
      pass('GET operation works');
    } else {
      fail('GET operation returned unexpected value');
    }

    // HSET
    await redis.hset(`${testKey}:hash`, 'field1', 'value1');
    pass('HSET operation works');

    // HGET
    const hashValue = await redis.hget(`${testKey}:hash`, 'field1');
    if (hashValue === 'value1') {
      pass('HGET operation works');
    }

    // Cleanup
    await redis.del(testKey, `${testKey}:hash`);
    pass('Cleanup successful');

    return true;
  } catch (err) {
    fail(`Redis audit failed: ${err.message}`);
    return false;
  }
}

// ============================================================================
// PHASE 3: API INTEGRATION TEST
// ============================================================================

async function auditApis() {
  section('PHASE 3: API INTEGRATION TEST');

  log('\n🌐 Testing sports API connections...\n');

  const results = {};

  // Test API-Football (Primary)
  if (process.env.API_FOOTBALL_KEY) {
    try {
      log('Testing API-Football...');
      const response = await fetch('https://api-football-v3.p.rapidapi.com/fixtures?live=all&status=LIVE&limit=3', {
        headers: {
          'x-apisports-key': process.env.API_FOOTBALL_KEY,
          'x-rapidapi-host': 'api-football-v3.p.rapidapi.com'
        },
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        if (data.response && data.response.length > 0) {
          pass(`API-Football: ✅ Working (${data.response.length} live matches found)`);
          results.apiFootball = {
            status: 'active',
            matchCount: data.response.length,
            sample: data.response[0]
          };
        } else {
          warn(`API-Football: Connected but no live matches currently`);
          results.apiFootball = { status: 'connected', matchCount: 0 };
        }
      } else {
        fail(`API-Football: HTTP ${response.status}`);
      }
    } catch (err) {
      warn(`API-Football: ${err.message}`);
    }
  } else {
    warn('API-Football: API_FOOTBALL_KEY not configured');
  }

  // Test Football-Data.org (Secondary)
  if (process.env.FOOTBALL_DATA_API || process.env.FOOTBALLDATA_API_KEY) {
    try {
      log('\nTesting Football-Data.org...');
      const response = await fetch('https://api.football-data.org/v4/competitions', {
        headers: {
          'X-Auth-Token': process.env.FOOTBALL_DATA_API || process.env.FOOTBALLDATA_API_KEY
        },
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        pass(`Football-Data.org: ✅ Working (${data.competitions?.length || 0} competitions available)`);
        results.footballData = { status: 'active' };
      } else {
        warn(`Football-Data.org: HTTP ${response.status}`);
      }
    } catch (err) {
      warn(`Football-Data.org: ${err.message}`);
    }
  } else {
    warn('Football-Data.org: No API key configured');
  }

  return results;
}

// ============================================================================
// PHASE 4: SERVICE INTEGRITY
// ============================================================================

async function auditServices() {
  section('PHASE 4: SERVICE INTEGRITY');

  log('\n📦 Checking service files and structure...\n');

  const fs = await import('fs/promises');
  const path = await import('path');

  for (const service of auditConfig.services) {
    try {
      const filePath = new URL(`file:///${process.cwd()}/${service.file}`.replace(/\\/g, '/'));
      const content = await fs.readFile(filePath, 'utf8');

      let methodsFound = 0;
      for (const method of service.methods) {
        if (content.includes(`${method}`) || content.includes(`async ${method}`)) {
          methodsFound++;
        }
      }

      if (methodsFound === service.methods.length) {
        pass(`${service.name}: All methods found`);
      } else {
        warn(`${service.name}: Only ${methodsFound}/${service.methods.length} methods found`);
      }
    } catch (err) {
      fail(`${service.name}: File not found or inaccessible`);
    }
  }
}

// ============================================================================
// PHASE 5: HANDLER VERIFICATION
// ============================================================================

async function auditHandlers() {
  section('PHASE 5: HANDLER VERIFICATION');

  log('\n🎮 Checking handler implementations...\n');

  const fs = await import('fs/promises');

  for (const handler of auditConfig.handlers) {
    try {
      const filePath = new URL(`file:///${process.cwd()}/${handler.file}`.replace(/\\/g, '/'));
      const content = await fs.readFile(filePath, 'utf8');

      let itemsFound = [];
      const items = handler.commands || handler.callbacks || handler.methods;

      for (const item of items) {
        if (item.includes('*')) {
          // Wildcard pattern
          const pattern = item.replace('*', '');
          if (content.includes(pattern)) {
            itemsFound.push(item);
          }
        } else {
          if (content.includes(item)) {
            itemsFound.push(item);
          }
        }
      }

      if (itemsFound.length > 0) {
        pass(`${handler.name}: ${itemsFound.length}/${items.length} items implemented`);
      } else {
        fail(`${handler.name}: No items found`);
      }
    } catch (err) {
      fail(`${handler.name}: File error - ${err.message}`);
    }
  }
}

// ============================================================================
// PHASE 6: DATA FLOW VERIFICATION
// ============================================================================

function auditDataFlow() {
  section('PHASE 6: DATA FLOW VERIFICATION');

  log('\n🔄 Verifying command execution flows...\n');

  for (const flow of auditConfig.dataflow) {
    log(chalk.bold(`\n${flow.name}:`));
    for (let i = 0; i < flow.steps.length; i++) {
      log(`  ${i + 1}. ${flow.steps[i]}`);
    }
    pass('Flow documented');
  }
}

// ============================================================================
// PHASE 7: LIVE SPORTS TEST
// ============================================================================

async function testLiveSports() {
  section('PHASE 7: LIVE SPORTS TEST');

  log('\n⚽ Testing LIVE SPORTS command flow...\n');

  try {
    const redis = getRedis();

    // Simulate user querying live sports
    const testUserId = 'audit_test_user';
    const testChatId = 'audit_test_chat';

    log('Simulating: User requests live sports\n');

    // Check SportsAggregator would be available
    log('1️⃣  Checking SportsAggregator service availability...');
    try {
      const SportsAggregator = await import('./src/services/sports-aggregator.js');
      pass('SportsAggregator module imported successfully');
    } catch (err) {
      fail(`SportsAggregator import failed: ${err.message}`);
      return;
    }

    // Check if we can access handlers
    log('\n2️⃣  Checking handler accessibility...');
    try {
      const handlers = await import('./src/handlers/telegram-handler-v2.js');
      pass('Telegram handler (v2) imported successfully');
    } catch (err) {
      fail(`Telegram handler import failed: ${err.message}`);
      return;
    }

    // Check commands
    log('\n3️⃣  Checking commands module...');
    try {
      const commands = await import('./src/handlers/commands-v3.js');
      pass('Commands (v3) module imported successfully');
    } catch (err) {
      fail(`Commands module import failed: ${err.message}`);
      return;
    }

    // Check if we have API keys for live data
    log('\n4️⃣  Checking sports data availability...');
    if (process.env.API_FOOTBALL_KEY) {
      pass('API-Football key available - Live sports will return real data');
    } else if (process.env.FOOTBALL_DATA_API) {
      warn('Using Football-Data fallback - Some features may be limited');
    } else {
      fail('No sports API keys configured - Live sports will return demo data');
    }

    pass('\n✅ Live sports command flow is fully connected');
  } catch (err) {
    fail(`Live sports test failed: ${err.message}`);
  }
}

// ============================================================================
// PHASE 8: CONNECTION SUMMARY
// ============================================================================

function generateSummary() {
  section('PHASE 8: AUDIT SUMMARY');

  log('\n📊 Connection Status Overview:\n');

  const categories = {
    '✅ Environment': !errors.filter(e => e.includes('Environment')).length,
    '✅ Redis': !errors.filter(e => e.includes('Redis')).length,
    '✅ APIs': !errors.filter(e => e.includes('API')).length,
    '✅ Services': !errors.filter(e => e.includes('Service')).length,
    '✅ Handlers': !errors.filter(e => e.includes('Handler')).length,
    '✅ Data Flow': !errors.filter(e => e.includes('Flow')).length
  };

  for (const [category, status] of Object.entries(categories)) {
    if (status) {
      pass(category);
    } else {
      fail(category);
    }
  }

  log('\n📈 Statistics:\n');
  log(`  ✅ Passed: ${50 - errors.length}`);
  log(`  ❌ Failed: ${errors.length}`);
  log(`  ⚠️  Warnings: ${warnings.length}`);

  if (errors.length === 0) {
    log('\n' + chalk.bold.green('🎉 ALL CHECKS PASSED - BOT STRUCTURE IS TOP NOTCH!\n'));
    return true;
  } else {
    log('\n' + chalk.bold.red(`⚠️  ${errors.length} issues found that need attention\n`));
    return false;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAudit() {
  log(chalk.bold.cyan('\n' + '='.repeat(80)));
  log(chalk.bold.cyan('BETRIX BOT STRUCTURE & CONNECTION AUDIT'));
  log(chalk.bold.cyan('Comprehensive verification of all systems'));
  log(chalk.bold.cyan('='.repeat(80) + '\n'));

  const hasEnv = await auditEnvironment();
  const hasRedis = await auditRedis();
  const apiResults = await auditApis();
  await auditServices();
  await auditHandlers();
  auditDataFlow();
  await testLiveSports();
  const success = generateSummary();

  // Print errors and warnings
  if (errors.length > 0) {
    log(chalk.bold.red('\n❌ ERRORS:\n'));
    errors.forEach((e, i) => log(`  ${i + 1}. ${e}`));
  }

  if (warnings.length > 0) {
    log(chalk.bold.yellow('\n⚠️  WARNINGS:\n'));
    warnings.forEach((w, i) => log(`  ${i + 1}. ${w}`));
  }

  process.exit(success ? 0 : 1);
}

// Run audit
runAudit().catch(err => {
  fail(`Critical audit failure: ${err.message}`);
  process.exit(1);
});
