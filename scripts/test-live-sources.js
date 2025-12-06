import { getEspnLiveMatches } from '../src/services/espn-provider.js';
import { getNewsHeadlines } from '../src/services/news-provider.js';
import { getOddsFromBetExplorer, getOddsFromOddsPortal } from '../src/services/odds-scraper.js';

async function run() {
  console.log('=== Testing Live Sports Data Sources ===\n');

  // Test ESPN
  try {
    console.log('1. Fetching ESPN live matches (soccer)...');
    const matches = await getEspnLiveMatches({ sport: 'soccer' });
    console.log(`   ✓ Found ${matches.length} matches`);
    if (matches.length > 0) {
      console.log('   Sample:', JSON.stringify(matches[0], null, 2));
    }
  } catch (err) {
    console.error('   ✗ ESPN error:', err.message);
  }

  console.log('\n');

  // Test News
  try {
    console.log('2. Fetching recent sports news...');
    const news = await getNewsHeadlines({ query: 'football', max: 5 });
    console.log(`   ✓ Found ${news.length} news items`);
    if (news.length > 0) {
      console.log('   Sample:', JSON.stringify(news[0], null, 2));
    }
  } catch (err) {
    console.error('   ✗ News error:', err.message);
  }

  console.log('\n');

  // Test Odds (BetExplorer)
  try {
    console.log('3. Fetching odds from BetExplorer (best-effort scrape)...');
    const odds = await getOddsFromBetExplorer({ sport: 'football' });
    console.log(`   ✓ Result:`, JSON.stringify(odds, null, 2).slice(0, 300));
  } catch (err) {
    console.error('   ✗ BetExplorer error:', err.message);
  }

  console.log('\n=== Test Complete ===');
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exitCode = 1;
});
