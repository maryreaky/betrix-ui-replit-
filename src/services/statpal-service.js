/**
 * StatPal Sports Data API Service
 * Comprehensive integration for all sports data:
 * - Live Scores (Soccer, NFL, NBA, NHL, MLB, Cricket, Tennis, Esports, F1, etc.)
 * - Odds & Betting Data
 * - Fixtures & Schedules
 * - Standings & Tables
 * - Player Stats & Team Stats
 * - Injuries & News
 * 
 * Supports all sports: soccer, nfl, nba, nhl, mlb, cricket, tennis, f1, esports, handball, golf, horse-racing, volleyball
 * API Versions: v1 (most sports), v2 (soccer advanced features)
 */

import { CONFIG } from '../config.js';
import { HttpClient } from './http-client.js';
import { Logger } from '../utils/logger.js';
import { ProviderHealth } from '../utils/provider-health.js';

const logger = new Logger('StatPalService');

class StatPalService {
  constructor(redis = null) {
    this.redis = redis;
    // HttpClient exposes a static `fetch` helper; use the class as the client namespace
    this.httpClient = HttpClient;
    this.providerHealth = new ProviderHealth(redis);
    this.apiKey = CONFIG.STATPAL.KEY;
    this.baseUrl = CONFIG.STATPAL.BASE;
    
    if (!this.apiKey) {
      logger.warn('⚠️  STATPAL_API_KEY not configured. Set STATPAL_API_KEY or STATPAL_ACCESS_KEY environment variable.');
    }
  }

  /**
   * Supported sports for StatPal API
   */
  static SPORTS = {
    SOCCER: 'soccer',
    NFL: 'nfl',
    NBA: 'nba',
    NHL: 'nhl',
    MLB: 'mlb',
    CRICKET: 'cricket',
    TENNIS: 'tennis',
    ESPORTS: 'esports',
    F1: 'f1',
    HANDBALL: 'handball',
    GOLF: 'golf',
    HORSERACING: 'horse-racing',
    VOLLEYBALL: 'volleyball',
  };

  /**
   * Get live scores for any sport
   * @param {string} sport - Sport name (e.g., 'soccer', 'nfl', 'nba')
   * @param {string} version - API version ('v1' or 'v2', default 'v1')
   * @returns {Promise<Object>} Live scores data
   */
  async getLiveScores(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-live')) {
        logger.info('StatPal live scores provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/livescores?access_key=${this.apiKey}`;
      logger.debug(`📡 Fetching StatPal live scores: ${sport} (${version})`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:livescores`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal livescores returned empty`);
      }

      logger.info(`✅ StatPal live scores fetched: ${sport}`);
      try { await this.providerHealth.clear('statpal-live'); } catch (e) {}
      return data;
    } catch (error) {
      logger.error(`❌ StatPal live scores error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-live', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get live odds for a sport
   * @param {string} sport - Sport name
   * @param {string} version - API version
   * @returns {Promise<Object>} Odds data
   */
  async getLiveOdds(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-odds')) {
        logger.info('StatPal odds provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/odds?access_key=${this.apiKey}`;
      logger.debug(`📊 Fetching StatPal odds: ${sport}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:odds`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal odds returned empty`);
      }

      logger.info(`✅ StatPal odds fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal odds error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-odds', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get upcoming fixtures/schedule for a sport
   * @param {string} sport - Sport name
   * @param {string} version - API version
   * @returns {Promise<Object>} Fixtures data
   */
  async getFixtures(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-fixtures')) {
        logger.info('StatPal fixtures provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/fixtures?access_key=${this.apiKey}`;
      logger.debug(`📅 Fetching StatPal fixtures: ${sport}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:fixtures`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal fixtures returned empty`);
      }

      logger.info(`✅ StatPal fixtures fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal fixtures error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-fixtures', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get standings/table for a sport
   * @param {string} sport - Sport name
   * @param {string} league - League ID or name (optional)
   * @param {string} version - API version
   * @returns {Promise<Object>} Standings data
   */
  async getStandings(sport = 'soccer', league = null, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-standings')) {
        logger.info('StatPal standings provider currently disabled');
        return null;
      }

      let url = `${this.baseUrl}/${version}/${sport}/standings`;
      if (league) {
        url += `/${league}`;
      }
      url += `?access_key=${this.apiKey}`;

      logger.debug(`🏆 Fetching StatPal standings: ${sport}${league ? '/' + league : ''}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:standings`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal standings returned empty`);
      }

      logger.info(`✅ StatPal standings fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal standings error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-standings', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get player statistics
   * @param {string} sport - Sport name
   * @param {string} playerId - Player ID
   * @param {string} version - API version
   * @returns {Promise<Object>} Player stats
   */
  async getPlayerStats(sport = 'soccer', playerId, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-players')) {
        logger.info('StatPal player stats provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/players/${playerId}?access_key=${this.apiKey}`;
      logger.debug(`👤 Fetching StatPal player stats: ${sport}/${playerId}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:player:${playerId}`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal player stats returned empty`);
      }

      logger.info(`✅ StatPal player stats fetched: ${playerId}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal player stats error:`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-players', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get team statistics
   * @param {string} sport - Sport name
   * @param {string} teamId - Team ID
   * @param {string} version - API version
   * @returns {Promise<Object>} Team stats
   */
  async getTeamStats(sport = 'soccer', teamId, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-teams')) {
        logger.info('StatPal team stats provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/teams/${teamId}?access_key=${this.apiKey}`;
      logger.debug(`🏢 Fetching StatPal team stats: ${sport}/${teamId}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:team:${teamId}`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal team stats returned empty`);
      }

      logger.info(`✅ StatPal team stats fetched: ${teamId}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal team stats error:`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-teams', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get injury reports
   * @param {string} sport - Sport name
   * @param {string} version - API version
   * @returns {Promise<Object>} Injury data
   */
  async getInjuries(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-injuries')) {
        logger.info('StatPal injuries provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/injuries?access_key=${this.apiKey}`;
      logger.debug(`🏥 Fetching StatPal injuries: ${sport}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:injuries`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal injuries returned empty`);
      }

      logger.info(`✅ StatPal injuries fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal injuries error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-injuries', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get live play-by-play data
   * @param {string} sport - Sport name
   * @param {string} matchId - Match/Game ID
   * @param {string} version - API version
   * @returns {Promise<Object>} Play-by-play data
   */
  async getLivePlayByPlay(sport = 'soccer', matchId, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-playbyplay')) {
        logger.info('StatPal play-by-play provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/live-plays/${matchId}?access_key=${this.apiKey}`;
      logger.debug(`▶️ Fetching StatPal play-by-play: ${sport}/${matchId}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:playbyplay:${matchId}`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal play-by-play returned empty`);
      }

      logger.info(`✅ StatPal play-by-play fetched: ${matchId}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal play-by-play error:`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-playbyplay', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get match statistics (live match detailed stats)
   * @param {string} sport - Sport name
   * @param {string} matchId - Match/Game ID
   * @param {string} version - API version
   * @returns {Promise<Object>} Live match stats
   */
  async getLiveMatchStats(sport = 'soccer', matchId, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-matchstats')) {
        logger.info('StatPal match stats provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/live-match-stats/${matchId}?access_key=${this.apiKey}`;
      logger.debug(`📈 Fetching StatPal live match stats: ${sport}/${matchId}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:matchstats:${matchId}`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal live match stats returned empty`);
      }

      logger.info(`✅ StatPal live match stats fetched: ${matchId}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal live match stats error:`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-matchstats', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get results (past matches)
   * @param {string} sport - Sport name
   * @param {string} version - API version
   * @returns {Promise<Object>} Results data
   */
  async getResults(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-results')) {
        logger.info('StatPal results provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/results?access_key=${this.apiKey}`;
      logger.debug(`📋 Fetching StatPal results: ${sport}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:results`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal results returned empty`);
      }

      logger.info(`✅ StatPal results fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal results error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-results', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get scoring leaders for a sport
   * @param {string} sport - Sport name
   * @param {string} version - API version
   * @returns {Promise<Object>} Scoring leaders data
   */
  async getScoringLeaders(sport = 'soccer', version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-leaders')) {
        logger.info('StatPal scoring leaders provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/scoring-leaders?access_key=${this.apiKey}`;
      logger.debug(`⭐ Fetching StatPal scoring leaders: ${sport}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:leaders`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal scoring leaders returned empty`);
      }

      logger.info(`✅ StatPal scoring leaders fetched: ${sport}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal scoring leaders error (${sport}):`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-leaders', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Get rosters (player lists)
   * @param {string} sport - Sport name
   * @param {string} teamId - Team ID
   * @param {string} version - API version
   * @returns {Promise<Object>} Roster data
   */
  async getRosters(sport = 'soccer', teamId, version = 'v1') {
    try {
      if (await this.providerHealth.isDisabled('statpal-rosters')) {
        logger.info('StatPal rosters provider currently disabled');
        return null;
      }

      const url = `${this.baseUrl}/${version}/${sport}/rosters/${teamId}?access_key=${this.apiKey}`;
      logger.debug(`📑 Fetching StatPal roster: ${sport}/${teamId}`);

      const data = await this.httpClient.fetch(url, {
        headers: { 'Accept': 'application/json' }
      }, `statpal:${sport}:roster:${teamId}`, 2, 8000);

      if (!data || (Array.isArray(data) && data.length === 0) || (data && typeof data === 'object' && Object.keys(data).length === 0)) {
        throw new Error(`StatPal rosters returned empty`);
      }

      logger.info(`✅ StatPal roster fetched: ${teamId}`);
      return data;
    } catch (error) {
      logger.error(`❌ StatPal roster error:`, error.message);
      try {
        await this.providerHealth.markFailure('statpal-rosters', error.statusCode || 500, error.message);
      } catch (e) {}
      return null;
    }
  }

  /**
   * Health check - test if API is working
   * @returns {Promise<boolean>} True if API is accessible
   */
  async healthCheck() {
    try {
      logger.debug('🏥 StatPal health check starting...');
      const result = await this.getLiveScores('soccer', 'v1');
      const healthy = result !== null;
      logger.info(`🏥 StatPal health check: ${healthy ? '✅ OK' : '❌ FAILED'}`);
      return healthy;
    } catch (error) {
      logger.error('🏥 StatPal health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get all sports available
   * @returns {Array<string>} List of supported sports
   */
  static getAvailableSports() {
    return Object.values(this.SPORTS);
  }
}

export default StatPalService;
