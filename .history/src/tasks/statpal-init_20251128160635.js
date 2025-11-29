/**
 * StatPal API Initialization & Validation
 * Runs at startup to validate API key and prefetch REAL data from all sports
 * Follows StatPal documentation exactly:
 * GET https://statpal.io/api/{version}/{sport}/livescores?access_key={key}
 */

import { Logger } from '../utils/logger.js';
import { HttpClient } from '../services/http-client.js';

const logger = new Logger('StatPalInit');

// All supported sports per StatPal documentation
const STATPAL_SPORTS = [
  'soccer',
  'nfl',
  'nba',
  'nhl',
  'mlb',
  'esports',
  'cricket',
  'f1',
  'handball',
  'golf',
  'horse-racing',
  'volleyball',
  'tennis',
  'rugby',
  'australian-football'
];

// All endpoints per StatPal documentation
const STATPAL_ENDPOINTS = {
  'livescores': '/livescores',
  'upcoming-schedule': '/upcoming-schedule',
  'standings': '/standings',
  'player-stats': '/player-stats',
  'team-stats': '/team-stats',
  'results': '/results',
  'live-match-stats': '/live-match-stats',
  'live-plays': '/live-plays',
  'injuries': '/injuries',
  'scoring-leaders': '/scoring-leaders',
  'rosters': '/rosters'
};

export class StatPalInit {
  constructor(redis, accessKey) {
    this.redis = redis;
    this.accessKey = accessKey;
    this.httpClient = new HttpClient();
    this.baseUrl = 'https://statpal.io/api/v1';
    this.results = {
      timestamp: new Date().toISOString(),
      apiKey: this.accessKey ? `${this.accessKey.substring(0, 8)}...${this.accessKey.substring(this.accessKey.length - 4)}` : 'MISSING',
      sports: {},
      endpoints: {},
      totalDataPoints: 0,
      errors: []
    };
  }

  /**
   * Validate API key is present
   */
  validateApiKey() {
    if (!this.accessKey || this.accessKey.length === 0) {
      const err = '❌ STATPAL_API environment variable is NOT set!';
      logger.error(err);
      this.results.errors.push(err);
      return false;
    }

    logger.info('✅ STATPAL_API key is configured');
    return true;
  }

  /**
   * Test a single sport endpoint with proper URL format
   * GET https://statpal.io/api/v1/{sport}/livescores?access_key={key}
   */
  async testSportEndpoint(sport, endpoint = 'livescores') {
    try {
      const url = `${this.baseUrl}/${sport}${STATPAL_ENDPOINTS[endpoint] || '/livescores'}`;
      const fullUrl = `${url}?access_key=${this.accessKey}`;

      logger.debug(`📡 Testing ${sport} ${endpoint}: GET ${url.substring(0, 50)}...`);

      const response = await this.httpClient.fetch(fullUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BETRIX-StatPal-Init/1.0'
        },
        timeout: 10000,
        retries: 2
      });

      if (!response) {
        logger.warn(`⚠️  ${sport} ${endpoint} returned null`);
        return null;
      }

      // Check if response is valid JSON (not HTML error page)
      if (typeof response === 'string' && response.includes('<!DOCTYPE') || response.includes('<html')) {
        logger.warn(`⚠️  ${sport} ${endpoint} returned HTML (likely 404 or 403)`);
        return null;
      }

      logger.info(`✅ ${sport.toUpperCase()} ${endpoint}: ${Array.isArray(response) ? response.length : (typeof response === 'object' ? 'object' : 'string')} items`);

      return response;
    } catch (e) {
      logger.debug(`⚠️  ${sport} ${endpoint} failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Fetch live scores for a single sport and cache it
   */
  async fetchAndCacheSportLiveScores(sport) {
    try {
      const data = await this.testSportEndpoint(sport, 'livescores');

      if (!data) {
        if (!this.results.sports[sport]) {
          this.results.sports[sport] = { endpoints: {} };
        }
        this.results.sports[sport].endpoints.livescores = { status: 'failed', error: 'No data returned' };
        return { sport, count: 0, data: [] };
      }

      // Extract matches array from various response shapes
      let matches = [];
      if (Array.isArray(data)) {
        matches = data;
      } else if (data.data && Array.isArray(data.data)) {
        matches = data.data;
      } else if (data.matches && Array.isArray(data.matches)) {
        matches = data.matches;
      } else if (data.results && Array.isArray(data.results)) {
        matches = data.results;
      }

      const count = Array.isArray(matches) ? matches.length : 0;
      const samples = Array.isArray(matches) ? matches.slice(0, 3) : [];

      // Store in Redis cache
      const cacheKey = `betrix:statpal:${sport}:livescores`;
      if (this.redis && count > 0) {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ sport, count, timestamp: Date.now(), data: samples }),
            'EX',
            300 // 5 min cache
          );
          logger.info(`💾 Cached ${sport} livescores: ${count} items → Redis key: ${cacheKey}`);
        } catch (e) {
          logger.warn(`Failed to cache ${sport} livescores`, e?.message);
        }
      }

      if (!this.results.sports[sport]) {
        this.results.sports[sport] = { endpoints: {} };
      }
      this.results.sports[sport].endpoints.livescores = {
        status: count > 0 ? 'success' : 'empty',
        count,
        samples
      };

      this.results.totalDataPoints += count;

      return { sport, count, data: samples };
    } catch (e) {
      logger.error(`${sport} livescores error:`, e.message);
      if (!this.results.sports[sport]) {
        this.results.sports[sport] = { endpoints: {} };
      }
      this.results.sports[sport].endpoints.livescores = { status: 'error', error: e.message };
      return { sport, count: 0, data: [] };
    }
  }

  /**
   * Fetch standings for a single sport
   */
  async fetchAndCacheSportStandings(sport) {
    try {
      const data = await this.testSportEndpoint(sport, 'standings');

      if (!data) {
        return { sport, count: 0 };
      }

      let standings = [];
      if (Array.isArray(data)) {
        standings = data;
      } else if (data.data && Array.isArray(data.data)) {
        standings = data.data;
      } else if (data.standings && Array.isArray(data.standings)) {
        standings = data.standings;
      }

      const count = Array.isArray(standings) ? standings.length : 0;

      const cacheKey = `betrix:statpal:${sport}:standings`;
      if (this.redis && count > 0) {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ sport, count, timestamp: Date.now() }),
            'EX',
            600 // 10 min cache
          );
        } catch (e) {
          logger.warn(`Failed to cache ${sport} standings`, e?.message);
        }
      }

      if (!this.results.sports[sport]) {
        this.results.sports[sport] = { endpoints: {} };
      }
      this.results.sports[sport].endpoints.standings = {
        status: count > 0 ? 'success' : 'empty',
        count
      };

      this.results.totalDataPoints += count;
      return { sport, count };
    } catch (e) {
      logger.debug(`${sport} standings error:`, e?.message);
      return { sport, count: 0 };
    }
  }

  /**
   * Fetch results (past matches) for a single sport
   */
  async fetchAndCacheSportResults(sport) {
    try {
      const data = await this.testSportEndpoint(sport, 'results');

      if (!data) {
        return { sport, count: 0 };
      }

      let results = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data.data && Array.isArray(data.data)) {
        results = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        results = data.results;
      }

      const count = Array.isArray(results) ? results.length : 0;

      const cacheKey = `betrix:statpal:${sport}:results`;
      if (this.redis && count > 0) {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ sport, count, timestamp: Date.now() }),
            'EX',
            600
          );
        } catch (e) {
          logger.warn(`Failed to cache ${sport} results`, e?.message);
        }
      }

      if (!this.results.sports[sport]) {
        this.results.sports[sport] = { endpoints: {} };
      }
      this.results.sports[sport].endpoints.results = {
        status: count > 0 ? 'success' : 'empty',
        count
      };

      this.results.totalDataPoints += count;
      return { sport, count };
    } catch (e) {
      logger.debug(`${sport} results error:`, e?.message);
      return { sport, count: 0 };
    }
  }

  /**
   * Run full initialization: validate key, test all sports, prefetch all endpoints
   */
  async initialize() {
    logger.info('🚀 StatPal Initialization Starting...');

    // Step 1: Validate API key
    if (!this.validateApiKey()) {
      logger.error('❌ StatPal API key validation failed - initialization aborted');
      return { success: false, results: this.results };
    }

    // Step 2: Fetch data for each sport
    logger.info(`🔄 Prefetching live scores for ${STATPAL_SPORTS.length} sports...`);

    const sportResults = await Promise.all(
      STATPAL_SPORTS.map(sport => this.fetchAndCacheSportLiveScores(sport))
    );

    const sportsWithData = sportResults.filter(r => r.count > 0);
    logger.info(`✅ Prefetched live scores: ${sportsWithData.length}/${STATPAL_SPORTS.length} sports have data`);

    // Step 3: Fetch standings for major sports
    logger.info('🔄 Prefetching standings...');
    await Promise.all([
      this.fetchAndCacheSportStandings('soccer'),
      this.fetchAndCacheSportStandings('nfl'),
      this.fetchAndCacheSportStandings('nba'),
      this.fetchAndCacheSportStandings('nhl'),
      this.fetchAndCacheSportStandings('mlb')
    ]);

    // Step 4: Fetch recent results
    logger.info('🔄 Prefetching results...');
    await Promise.all([
      this.fetchAndCacheSportResults('soccer'),
      this.fetchAndCacheSportResults('nfl'),
      this.fetchAndCacheSportResults('nba'),
      this.fetchAndCacheSportResults('nhl'),
      this.fetchAndCacheSportResults('mlb')
    ]);

    // Store results in Redis for monitoring
    if (this.redis) {
      try {
        await this.redis.set(
          'betrix:statpal:init:latest',
          JSON.stringify(this.results),
          'EX',
          3600
        );
      } catch (e) {
        logger.warn('Failed to store init results', e?.message);
      }
    }

    logger.info('✅ StatPal Initialization Complete!', {
      apiKey: this.results.apiKey,
      sportsWithData: sportsWithData.length,
      totalDataPoints: this.results.totalDataPoints,
      cachePrefix: 'betrix:statpal:*'
    });

    return { success: true, results: this.results };
  }
}

export default StatPalInit;
