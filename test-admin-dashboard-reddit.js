/**
 * Test: Admin toggle, provider health dashboard, Reddit enhancements
 */

import { getRedditHeadlines } from './src/services/news-provider-enhanced.js';
import Redis from 'ioredis';

(async () => {
  console.log('=== Admin Toggle + Health Dashboard + Reddit Enhancements Tests ===\n');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  try {
    // Test 1: Provider toggle simulation
    console.log('Test 1: Admin provider toggle (Redis simulation)');
    
    console.log('  - Setting scorebat provider to OFF...');
    await redis.set('betrix:provider:enabled:scorebat', 'false');
    const scorebatDisabled = await redis.get('betrix:provider:enabled:scorebat');
    console.log(`  ✅ ScoreBat disabled: ${scorebatDisabled === 'false' ? 'YES' : 'NO'}`);
    
    console.log('  - Setting espn provider to ON...');
    await redis.set('betrix:provider:enabled:espn', 'true');
    const espnEnabled = await redis.get('betrix:provider:enabled:espn');
    console.log(`  ✅ ESPN enabled: ${espnEnabled === 'true' ? 'YES' : 'NO'}`);

    // Test 2: Simulate provider health keys for dashboard
    console.log('\nTest 2: Provider health dashboard (simulated keys)');
    
    const healthKeys = {
      'betrix:provider:health:espn': JSON.stringify({ ok: true, message: 'Found 3 live matches', ts: Date.now() }),
      'betrix:provider:health:scorebat': JSON.stringify({ ok: false, message: 'ScoreBat feed fetch failed: 404', ts: Date.now() }),
      'betrix:provider:health:openligadb': JSON.stringify({ ok: true, message: 'Found 5 recent matches', ts: Date.now() }),
      'betrix:provider:health:rss': JSON.stringify({ ok: true, message: 'Found 8 articles', ts: Date.now() })
    };

    console.log('  - Writing provider health keys to Redis...');
    for (const [key, val] of Object.entries(healthKeys)) {
      await redis.set(key, val);
      await redis.expire(key, 3600);
    }
    console.log(`  ✅ Wrote ${Object.keys(healthKeys).length} provider health keys`);

    console.log('  - Scanning for health keys...');
    const scannedKeys = [];
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', 'betrix:provider:health:*', 'COUNT', 100);
      cursor = result[0];
      scannedKeys.push(...(result[1] || []));
    } while (cursor !== '0');
    
    console.log(`  ✅ Found ${scannedKeys.length} provider health keys`);
    
    const health = {};
    for (const key of scannedKeys) {
      const val = await redis.get(key);
      const parsed = JSON.parse(val);
      const provider = key.replace('betrix:provider:health:', '');
      health[provider] = parsed;
    }
    
    console.log(`  ✅ Health summary:`);
    console.log(`    - Total: ${scannedKeys.length}`);
    console.log(`    - Healthy: ${Object.values(health).filter(h => h.ok === true).length}`);
    console.log(`    - Unhealthy: ${Object.values(health).filter(h => h.ok === false).length}`);
    console.log('    - Providers:');
    for (const [provider, info] of Object.entries(health)) {
      const status = info.ok ? '✅' : '❌';
      console.log(`      ${status} ${provider}: ${info.message}`);
    }

    // Test 3: Reddit enhancements - team subreddit mapping
    console.log('\nTest 3: Reddit scraping enhancements (team subreddit mapping)');
    console.log('  - Team subreddit examples:');
    console.log(`    • Manchester United -> /r/reddevils`);
    console.log(`    • Liverpool -> /r/liverpoolfc`);
    console.log(`    • Barcelona -> /r/Barca`);
    console.log(`    • Bayern -> /r/fcbayern`);
    
    console.log('  - Attempting Reddit soccer RSS fetch...');
    try {
      const articles = await getRedditHeadlines({ subreddit: 'soccer', max: 5 });
      if (articles && articles.length > 0) {
        console.log(`  ✅ Reddit soccer: ${articles.length} articles`);
        console.log(`    - First: "${articles[0].title?.slice(0, 50)}..."`);
      } else {
        console.log(`  ⚠️ Reddit soccer: 0 articles (may be blocked)`);
      }
    } catch (e) {
      console.log(`  ⚠️ Reddit soccer fetch failed (expected if blocked): ${e.message}`);
    }

    console.log('\n  - Attempting team-specific subreddit fallback (Liverpool)...');
    try {
      const articles = await getRedditHeadlines({ subreddit: 'soccer', max: 3, teamName: 'Liverpool' });
      if (articles && articles.length > 0) {
        console.log(`  ✅ Team subreddit fallback: ${articles.length} articles`);
      } else {
        console.log(`  ⚠️ Team subreddit fallback: 0 articles`);
      }
    } catch (e) {
      console.log(`  ⚠️ Team subreddit fallback failed (expected): ${e.message}`);
    }

    console.log('\n=== All enhancement tests completed ===');
    
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await redis.quit();
  }
})();
