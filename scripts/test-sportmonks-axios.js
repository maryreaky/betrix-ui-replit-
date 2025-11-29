/**
 * Test SportMonks integration with axios
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { SportsAggregator } from '../src/services/sports-aggregator.js';

async function testSportMonks() {
  try {
    console.log('🧪 Testing SportMonks integration...\n');
    
    const aggregator = new SportsAggregator();
    console.log('📡 Calling _getLiveFromSportsMonks()...\n');
    
    const matches = await aggregator._getLiveFromSportsMonks('football');
    
    console.log(`\n✅ Result: ${matches.length} live matches returned\n`);
    
    if (matches.length > 0) {
      console.log('📋 First 3 matches:');
      matches.slice(0, 3).forEach((m, i) => {
        console.log(`\n  ${i + 1}. ${m.home} vs ${m.away}`);
        console.log(`     Home Team: ${m.home_team || '(null)'}`);
        console.log(`     Away Team: ${m.away_team || '(null)'}`);
        console.log(`     Status: ${m.status}`);
        if (m.home_score !== undefined && m.away_score !== undefined) {
          console.log(`     Score: ${m.home_score} - ${m.away_score}`);
        }
        console.log(`     League: ${m.league || '(unknown)'}`);
      });
    } else {
      console.log('⚠️  No matches returned - checking if API is accessible...');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    process.exit(1);
  }
}

testSportMonks();
