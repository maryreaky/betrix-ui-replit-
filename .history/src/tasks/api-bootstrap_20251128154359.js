/**
 * API Bootstrap & Initialization
 * Validates all configured API keys on startup and immediately begins prefetching
 * live matches, upcoming fixtures, and odds from all available providers
 */

import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('APIBootstrap');

export class APIBootstrap {
  constructor(sportsAggregator, oddsAnalyzer, redis) {
    this.sportsAggregator = sportsAggregator;
    this.oddsAnalyzer = oddsAnalyzer;
    this.redis = redis;
    this.providers = {};
    this.isInitialized = false;
  }

  /**
   * Validate all configured API keys and report status
   */
  validateAPIKeys() {
    const status = {
      timestamp: new Date().toISOString(),
      providers: {}
    };

    // Check API-Football / API-Sports (RapidAPI)
    if (CONFIG.API_FOOTBALL && CONFIG.API_FOOTBALL.KEY) {
      status.providers.API_FOOTBALL = {
        enabled: true,
        key: `${CONFIG.API_FOOTBALL.KEY.substring(0, 8)}...${CONFIG.API_FOOTBALL.KEY.substring(CONFIG.API_FOOTBALL.KEY.length - 4)}`,
        base: CONFIG.API_FOOTBALL.BASE || 'https://api-football-v3.p.rapidapi.com'
      };
      this.providers.apiFootball = true;
      logger.info('✅ API-Football configured', status.providers.API_FOOTBALL);
    } else {
      status.providers.API_FOOTBALL = { enabled: false, reason: 'API_FOOTBALL_KEY or API_SPORTS_KEY not set' };
      logger.warn('⚠️  API-Football NOT configured - no live/upcoming fixtures from API-Sports');
    }

    // Check Football-Data.org
    if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
      status.providers.FOOTBALLDATA = {
        enabled: true,
        key: `${CONFIG.FOOTBALLDATA.KEY.substring(0, 8)}...${CONFIG.FOOTBALLDATA.KEY.substring(CONFIG.FOOTBALLDATA.KEY.length - 4)}`,
        base: CONFIG.FOOTBALLDATA.BASE || 'https://api.football-data.org/v4'
      };
      this.providers.footballData = true;
      logger.info('✅ Football-Data.org configured', status.providers.FOOTBALLDATA);
    } else {
      status.providers.FOOTBALLDATA = { enabled: false, reason: 'FOOTBALLDATA_API_KEY not set' };
      logger.warn('⚠️  Football-Data.org NOT configured');
    }

    // Check SportsData.io
    if (CONFIG.SPORTSDATA && CONFIG.SPORTSDATA.KEY) {
      status.providers.SPORTSDATA = {
        enabled: true,
        key: `${CONFIG.SPORTSDATA.KEY.substring(0, 8)}...${CONFIG.SPORTSDATA.KEY.substring(CONFIG.SPORTSDATA.KEY.length - 4)}`,
        base: CONFIG.SPORTSDATA.BASE || 'https://api.sportsdata.io'
      };
      this.providers.sportsData = true;
      logger.info('✅ SportsData.io configured', status.providers.SPORTSDATA);
    } else {
      status.providers.SPORTSDATA = { enabled: false, reason: 'SPORTSDATA_API_KEY not set' };
      logger.warn('⚠️  SportsData.io NOT configured');
    }

    // Check SofaScore
    if (CONFIG.SOFASCORE && CONFIG.SOFASCORE.KEY) {
      status.providers.SOFASCORE = {
        enabled: true,
        key: `${CONFIG.SOFASCORE.KEY.substring(0, 8)}...${CONFIG.SOFASCORE.KEY.substring(CONFIG.SOFASCORE.KEY.length - 4)}`,
        base: CONFIG.SOFASCORE.BASE || 'https://sofascore.p.rapidapi.com'
      };
      this.providers.sofaScore = true;
      logger.info('✅ SofaScore configured', status.providers.SOFASCORE);
    } else {
      status.providers.SOFASCORE = { enabled: false, reason: 'SOFASCORE_API_KEY not set' };
      logger.warn('⚠️  SofaScore NOT configured');
    }

    // Check SportsMonks
    if (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) {
      status.providers.SPORTSMONKS = {
        enabled: true,
        key: `${CONFIG.SPORTSMONKS.KEY.substring(0, 8)}...${CONFIG.SPORTSMONKS.KEY.substring(CONFIG.SPORTSMONKS.KEY.length - 4)}`,
        base: CONFIG.SPORTSMONKS.BASE || 'https://api.sportsmonks.com/v3'
      };
      this.providers.sportsMonks = true;
      logger.info('✅ SportsMonks configured', status.providers.SPORTSMONKS);
    } else {
      status.providers.SPORTSMONKS = { enabled: false, reason: 'SPORTSMONKS_API_KEY not set' };
      logger.warn('⚠️  SportsMonks NOT configured');
    }

    // Summary
    const enabledCount = Object.values(this.providers).filter(Boolean).length;
    status.summary = {
      enabledProviders: enabledCount,
      totalChecked: Object.keys(status.providers).length,
      readyForLiveData: enabledCount > 0
    };

    logger.info('📊 API Provider Status', status);
    
    // Store in Redis for monitoring
    try {
      this.redis.set('betrix:api:bootstrap:status', JSON.stringify(status), 'EX', 3600);
    } catch (e) {
      logger.warn('Failed to store bootstrap status in Redis', e?.message);
    }

    return status;
  }

  /**
   * Immediately prefetch live matches from StatPal for multiple sports
   */
  async prefetchLiveMatches() {
    logger.info('🔄 Starting immediate live matches prefetch from StatPal...');
    
    // Supported sports in StatPal
    const sports = [
      'soccer',      // Football/Soccer
      'nfl',         // American Football
      'nba',         // Basketball
      'nhl',         // Ice Hockey
      'mlb',         // Baseball
      'cricket',     // Cricket
      'tennis',      // Tennis
      'rugby',       // Rugby
      'volleyball'   // Volleyball
    ];

    const leagueIds = [39, 140, 135, 61, 78, 2]; // Premier League, La Liga, Serie A, Ligue 1, Bundesliga, Champions League (for soccer)
    const results = {
      timestamp: new Date().toISOString(),
      sports: {},
      totalMatches: 0
    };

    // Prefetch each sport
    for (const sport of sports) {
      const sportResults = {
        count: 0,
        samples: []
      };

      try {
        const matches = await this.sportsAggregator._getLiveFromStatPal(sport, 'v1');
        if (matches && Array.isArray(matches) && matches.length > 0) {
          sportResults.count = matches.length;
          sportResults.samples = matches.slice(0, 2);
          results.totalMatches += matches.length;
          logger.info(`✅ ${sport.toUpperCase()}: Found ${matches.length} live matches`, {
            samples: matches.slice(0, 2).map(m => ({ home: m.home, away: m.away, provider: m.provider }))
          });
        }
      } catch (e) {
        logger.debug(`⚠️  ${sport.toUpperCase()}: Failed to fetch live matches`, e?.message);
        sportResults.error = e.message;
      }

      results.sports[sport] = sportResults;
    }

    // Store results in Redis for UI access
    try {
      await this.redis.set('betrix:prefetch:live:by-sport', JSON.stringify(results), 'EX', 300);
    } catch (e) {
      logger.warn('Failed to store live matches prefetch results', e?.message);
    }

    return results;
  }

  /**
   * Immediately prefetch upcoming fixtures from StatPal for common leagues
   */
  async prefetchUpcomingFixtures() {
    logger.info('🔄 Starting immediate upcoming fixtures prefetch from StatPal...');
    
    const leagueIds = [39, 140, 135, 61, 78, 2]; // Premier League, La Liga, Serie A, Ligue 1, Bundesliga, Champions League
    const results = {
      timestamp: new Date().toISOString(),
      leagues: {}
    };

    for (const leagueId of leagueIds) {
      try {
        // Call StatPal fixtures endpoint via aggregator
        const fixtures = await this.sportsAggregator._getFixturesFromStatPal('soccer', 'v1');
        
        // Filter to only upcoming fixtures for this league (if fixtures have league info)
        let filtered = fixtures;
        if (fixtures && Array.isArray(fixtures)) {
          filtered = fixtures.filter(f => {
            const fLeagueId = f.league?.id || f.competition?.id;
            return !fLeagueId || fLeagueId === leagueId || fLeagueId === String(leagueId);
          });
        }

        results.leagues[leagueId] = {
          count: filtered ? filtered.length : 0,
          fixtures: filtered ? filtered.slice(0, 2) : []
        };
        
        if (filtered && filtered.length > 0) {
          logger.info(`✅ League ${leagueId}: Found ${filtered.length} upcoming fixtures`, {
            samples: filtered.slice(0, 2).map(f => ({ home: f.home, away: f.away, status: f.status }))
          });
        }
      } catch (e) {
        results.leagues[leagueId] = { error: e.message, count: 0 };
        logger.debug(`⚠️  League ${leagueId}: Failed to fetch upcoming fixtures`, e?.message);
      }
    }

    // Store results in Redis for UI access
    try {
      await this.redis.set('betrix:prefetch:fixtures:latest', JSON.stringify(results), 'EX', 600);
    } catch (e) {
      logger.warn('Failed to store upcoming fixtures prefetch results', e?.message);
    }

    return results;
  }

  /**
   * Immediately prefetch odds from StatPal for common leagues
   */
  async prefetchOdds() {
    logger.info('🔄 Starting immediate odds prefetch from StatPal...');
    
    const leagueIds = [39, 140, 135, 61, 78, 2]; // Premier League, La Liga, Serie A, Ligue 1, Bundesliga, Champions League
    const results = {
      timestamp: new Date().toISOString(),
      leagues: {}
    };

    for (const leagueId of leagueIds) {
      try {
        // Call StatPal odds endpoint via aggregator
        const odds = await this.sportsAggregator._getOddsFromStatPal('soccer', 'v1');
        
        // Filter to only odds for this league (if odds have league/fixture info)
        let filtered = odds;
        if (odds && Array.isArray(odds)) {
          filtered = odds.filter(o => {
            const oLeagueId = o.league?.id || o.fixture?.league?.id || o.competition?.id;
            return !oLeagueId || oLeagueId === leagueId || oLeagueId === String(leagueId);
          });
        }

        results.leagues[leagueId] = {
          count: filtered ? filtered.length : 0,
          odds: filtered ? filtered.slice(0, 2) : []
        };
        
        if (filtered && filtered.length > 0) {
          logger.info(`✅ League ${leagueId}: Found ${filtered.length} odds entries`, {
            samples: filtered.slice(0, 2).map(o => ({ 
              fixtureId: o.fixtureId, 
              bookmakers: o.bookmakers ? o.bookmakers.length : 0 
            }))
          });
        }
      } catch (e) {
        results.leagues[leagueId] = { error: e.message, count: 0 };
        logger.debug(`⚠️  League ${leagueId}: Failed to fetch odds`, e?.message);
      }
    }

    // Store results in Redis for UI access
    try {
      await this.redis.set('betrix:prefetch:odds:latest', JSON.stringify(results), 'EX', 600);
    } catch (e) {
      logger.warn('Failed to store odds prefetch results', e?.message);
    }

    return results;
  }

  /**
   * Full initialization: validate keys, then start prefetching
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('API Bootstrap already initialized, skipping');
      return;
    }

    try {
      logger.info('🚀 Starting API Bootstrap...');
      
      // Step 1: Validate all keys
      const keyStatus = this.validateAPIKeys();
      
      if (!keyStatus.summary.readyForLiveData) {
        logger.error('❌ No API providers configured. Add at least one API key to use live data features.');
        return { success: false, reason: 'No API keys configured', status: keyStatus };
      }

      logger.info(`✅ Bootstrap found ${keyStatus.summary.enabledProviders} configured providers`);

      // Step 2: Immediately prefetch data
      logger.info('⏱️  Starting immediate data prefetch (this may take 10-30 seconds)...');
      
      const liveMatches = await this.prefetchLiveMatches();
      const upcomingFixtures = await this.prefetchUpcomingFixtures();
      const odds = await this.prefetchOdds();

      const summaryData = {
        liveMatches: Object.values(liveMatches.leagues).reduce((sum, l) => sum + (l.count || 0), 0),
        upcomingFixtures: Object.values(upcomingFixtures.leagues).reduce((sum, l) => sum + (l.count || 0), 0),
        oddsAvailable: Object.values(odds.leagues).reduce((sum, l) => sum + (l.count || 0), 0)
      };

      logger.info('✅ API Bootstrap Complete!', {
        providersConfigured: keyStatus.summary.enabledProviders,
        ...summaryData
      });

      this.isInitialized = true;
      return {
        success: true,
        providers: keyStatus,
        data: summaryData
      };

    } catch (e) {
      logger.error('❌ API Bootstrap failed', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Start continuous prefetch cycle (called after successful initialization)
   */
  startContinuousPrefetch(intervalSeconds = 60) {
    logger.info(`🔁 Starting continuous prefetch cycle (every ${intervalSeconds}s)`);

    setInterval(async () => {
      try {
        const liveCount = (await this.prefetchLiveMatches()).total || 0;
        const upcomingCount = (await this.prefetchUpcomingFixtures()).total || 0;
        
        if (liveCount > 0 || upcomingCount > 0) {
          logger.info(`🔄 Prefetch cycle: ${liveCount} live, ${upcomingCount} upcoming`);
        }
      } catch (e) {
        logger.warn('Continuous prefetch cycle failed', e?.message);
      }
    }, intervalSeconds * 1000);

    logger.info('✅ Continuous prefetch cycle started');
  }
}

export default APIBootstrap;
