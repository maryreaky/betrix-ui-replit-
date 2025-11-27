import { Logger } from './src/utils/logger.js';
import { initializeSportsAggregator } from './src/services/sports-aggregator.js';

const logger = new Logger('LiveFlowTest');

async function testLiveFlow() {
  try {
    logger.info('Testing live flow...');
    
    // Initialize aggregator
    const sportsAggregator = await initializeSportsAggregator();
    
    // Test fetching live matches from popular leagues
    const popularLeagues = ['39', '140', '135', '61', '78', '2', '3'];
    
    let totalMatches = 0;
    for (const leagueId of popularLeagues) {
      try {
        const matches = await sportsAggregator.getLiveMatches(leagueId);
        logger.info(`League ${leagueId}: ${matches.length} matches`);
        totalMatches += matches.length;
        if (matches.length > 0) {
          logger.info(`Sample: ${matches[0].home} vs ${matches[0].away}`);
        }
      } catch (e) {
        logger.warn(`League ${leagueId} fetch failed: ${e.message}`);
      }
    }
    
    logger.info(`✅ Total live matches found: ${totalMatches}`);
    logger.info('Live flow test completed');
    process.exit(0);
  } catch (e) {
    logger.error('Test failed:', e);
    process.exit(1);
  }
}

testLiveFlow();
