/**
 * Sports Data Aggregator
 * Fetches and normalizes data from multiple sports APIs with priority order:
 * 1. SportMonks - Primary source for comprehensive football data
 * 2. Football-Data.org - Secondary source for football
 * 
 * StatPal, SofaScore, and API-Football support have been removed.
 */

import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import axios from 'axios';
import { getEspnLiveMatches } from './espn-provider.js';
import { getNewsHeadlines } from './news-provider-enhanced.js';
import liveScraper from './live-scraper.js';
import { getLiveMatchesFromGoal } from './goal-scraper.js';
import { getLiveMatchesFromFlashscore, getLiveMatchesByLeagueFromFlashscore } from './flashscore-scraper.js';
import { ProviderHealth } from '../utils/provider-health.js';
import SportMonksService from './sportmonks-service.js';
import RawDataCache from './raw-data-cache.js';

const logger = new Logger('SportsAggregator');
const SPORTSMONKS_BASE_URL = 'https://api.sportmonks.com/v3';

const LEAGUE_MAPPINGS = {
  // Premier League
  '39': { id: 39, name: 'Premier League', country: 'England', code: 'E0', footballDataId: 'PL' },
  // La Liga
  '140': { id: 140, name: 'La Liga', country: 'Spain', code: 'E1', footballDataId: 'SA' },
  // Serie A
  '135': { id: 135, name: 'Serie A', country: 'Italy', code: 'E2', footballDataId: 'SA' },
  // Ligue 1
  '61': { id: 61, name: 'Ligue 1', country: 'France', code: 'E3', footballDataId: 'FL1' },
  // Bundesliga
  '78': { id: 78, name: 'Bundesliga', country: 'Germany', code: 'E4', footballDataId: 'BL1' },
  // Champions League
  '2': { id: 2, name: 'Champions League', country: 'Europe', code: 'C1', footballDataId: 'CL' },
};

export class SportsAggregator {
  constructor(redis, extras = {}) {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 min cache
    this.redis = redis; // optional Redis instance for diagnostics
    this.scorebat = extras.scorebat || null;
    this.rss = extras.rss || null;
    this.openLiga = extras.openLiga || null;
    this.dataCache = new RawDataCache(redis); // Initialize raw data cache
    // Allowed providers can be passed in extras.allowedProviders as an array
    // e.g. ['SPORTSMONKS','FOOTBALLDATA'] to force the aggregator to only
    // consider those providers regardless of global CONFIG.
    this.allowedProviders = Array.isArray(extras.allowedProviders)
      ? extras.allowedProviders.map(p => String(p).toUpperCase())
      : null;

    // ONLY initialize SportMonks and Football-Data
    this.sportmonks = (this._isAllowedSync('SPORTSMONKS') && CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) ? new SportMonksService(redis) : null;
    this.providerHealth = new ProviderHealth(redis);
  }

  async _recordProviderHealth(name, ok, message = '') {
    try {
      if (!this.redis) return;
      const key = `${CONFIG.DIAGNOSTICS.PREFIX}${name}`;
      const payload = { ok: Boolean(ok), message: String(message || ''), ts: Date.now() };
      await this.redis.set(key, JSON.stringify(payload));
      await this.redis.expire(key, Number(CONFIG.DIAGNOSTICS.TTL || 3600));
    } catch (e) {
      // Non-fatal, just log
      logger.warn(`Failed to write provider health for ${name}`, e?.message || String(e));
    }
    // provider health circuit-breaker helper
    this.providerHealth = new ProviderHealth(this.redis || null);
  }

  // Check if a provider is enabled: checks CONFIG.PROVIDERS then optional Redis override
  async _isProviderEnabled(name) {
    try {
      // Accept case-insensitive provider names and normalize to upper-case for CONFIG lookup
      const normName = String(name || '').toUpperCase();
      // If allowedProviders is set, only providers listed there are considered enabled
      if (Array.isArray(this.allowedProviders) && this.allowedProviders.length > 0) {
        if (!this.allowedProviders.includes(normName)) return false;
      }

      const cfg = (CONFIG.PROVIDERS && CONFIG.PROVIDERS[normName]) || null;
      let enabled = cfg ? (cfg.enabled !== false) : true;
      if (this.redis) {
        const key = `betrix:provider:enabled:${name.toLowerCase()}`;
        const v = await this.redis.get(key).catch(() => null);
        if (v === 'true') enabled = true;
        if (v === 'false') enabled = false;
      }
      return Boolean(enabled);
    } catch (e) {
      return true;
    }
  }

  // Synchronous check used during construction to avoid async calls
  _isAllowedSync(name) {
    if (!this.allowedProviders || !Array.isArray(this.allowedProviders)) return true;
    return this.allowedProviders.includes(String(name || '').toUpperCase());
  }

  /**
   * Get all available leagues
   */
  async getLeagues(sport = 'football', region = null) {
    try {
      const cacheKey = `leagues:${sport}:${region || 'all'}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      let leagues = [];

      // Try SportMonks first for leagues
      if (this.sportmonks) {
        try {
          logger.debug('📡 Fetching leagues via SportMonks');
          const smLeagues = typeof this.sportmonks.getLeagues === 'function' ? await this.sportmonks.getLeagues() : [];
          if (smLeagues && smLeagues.length > 0) {
            this._setCached(cacheKey, smLeagues);
            await this._recordProviderHealth('sportsmonks', true, `Found ${smLeagues.length} leagues`);
            return smLeagues;
          }
        } catch (e) {
          logger.warn('SportMonks league fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // Next try Football-Data
      if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
        try {
          logger.debug('📡 Fetching leagues via Football-Data');
          const fdLeagues = await this._getLeaguesFromFootballData();
          if (fdLeagues && fdLeagues.length > 0) {
            this._setCached(cacheKey, fdLeagues);
            await this._recordProviderHealth('footballdata', true, `Found ${fdLeagues.length} leagues`);
            return fdLeagues;
          }
        } catch (e) {
          logger.warn('Football-Data league fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('footballdata', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // Fall back to built-in popular leagues if no provider returned data
      return Object.values(LEAGUE_MAPPINGS).slice(0, 6);
    } catch (err) {
      logger.error('getLeagues failed', err);
      return Object.values(LEAGUE_MAPPINGS);
    }
  }

  /**
   * Get live matches for a league
   */
  async getLiveMatches(leagueId, options = {}) {
    try {
      const cacheKey = `live:${leagueId}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 2 * 60 * 1000) { // 2 min cache for live
          return cached.data;
        }
      }

      // Football-Data FIRST (working, SportMonks DNS broken on Render)
      if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
        try {
          logger.debug(`📡 Fetching live matches from Football-Data for league ${leagueId}`);
          const fdMatches = await this._getLiveFromFootballData(leagueId);
          if (fdMatches && fdMatches.length > 0) {
            logger.info(`✅ Football-Data: Found ${fdMatches.length} live matches`);
            await this.dataCache.storeLiveMatches('footballdata', fdMatches);
            const formatted = this._formatMatches(fdMatches, 'footballdata') || [];
            const liveCount = formatted.filter(m => String(m.status || '').toUpperCase() === 'LIVE').length;
            logger.info(`🔍 Football-Data DIAGNOSTIC [league:${leagueId}]: raw:${fdMatches.length} | formatted:${formatted.length} | live:${liveCount}`);
            this._setCached(cacheKey, formatted);
            await this._recordProviderHealth('footballdata', true, `Found ${formatted.length} live matches`);
            return formatted;
          }
        } catch (e) {
          logger.debug('Football-Data live fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('footballdata', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // SportMonks fallback (DNS broken on Render)
      if (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) {
        try {
          logger.debug(`📡 Fallback: Fetching live matches from SportMonks for league ${leagueId}`);
          const smMatches = await this.sportmonks.getLivescores(leagueId);
          if (smMatches && smMatches.length > 0) {
            logger.info(`✅ SportMonks (fallback): Found ${smMatches.length} live matches (raw)`);
            await this.dataCache.storeLiveMatches('sportsmonks', smMatches);
            const formatted = this._formatMatches(smMatches, 'sportsmonks') || [];
            const liveOnly = formatted.filter(m => String(m.status || '').toUpperCase() === 'LIVE');
            logger.info(`🔍 SportMonks DIAGNOSTIC [league:${leagueId}]: raw:${smMatches.length} | formatted:${formatted.length} | live:${liveOnly.length}`);
            if (liveOnly.length > 0) {
              this._setCached(cacheKey, liveOnly);
              await this._recordProviderHealth('sportsmonks', true, `Found ${liveOnly.length} live matches (fallback)`);
              return liveOnly;
            }
            this._setCached(cacheKey, formatted);
            await this._recordProviderHealth('sportsmonks', false, `No matches marked LIVE (raw:${smMatches.length})`);
          }
        } catch (e) {
          logger.warn('SportMonks fallback failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // 🔄 FALLBACK: Try to read from RawDataCache (prefetched data)
      logger.debug(`📚 Attempting to read live matches from cache for league ${leagueId}`);
      try {
        // Try both sources from cache
        const fdCached = await this.dataCache.getLiveMatches('footballdata');
        const fdForLeague = (fdCached || []).filter(m => {
          const leagueFromMatch = m.competition?.id || m.competition?.league_id || m.league?.id;
          return leagueFromMatch === leagueId;
        });
        if (fdForLeague && fdForLeague.length > 0) {
          logger.info(`📚 Using cached Football-Data live matches (${fdForLeague.length} matches)`);
          const formatted = this._formatMatches(fdForLeague, 'footballdata') || [];
          this._setCached(cacheKey, formatted);
          return formatted;
        }

        const smCached = await this.dataCache.getLiveMatches('sportsmonks');
        const smForLeague = (smCached || []).filter(m => {
          const leagueFromMatch = m.league?.id || m.competition?.id;
          return leagueFromMatch === leagueId;
        });
        if (smForLeague && smForLeague.length > 0) {
          logger.info(`📚 Using cached SportMonks live matches (${smForLeague.length} matches)`);
          const formatted = this._formatMatches(smForLeague, 'sportsmonks') || [];
          this._setCached(cacheKey, formatted);
          return formatted;
        }
      } catch (cacheErr) {
        logger.debug('Failed to read live matches from RawDataCache', cacheErr?.message);
      }

      logger.warn('⚠️  No live matches available from SportMonks or Football-Data');
      return [];
    } catch (err) {
      logger.error('getLiveMatches failed:', err.message);
      return [];
    }

  }

  /**
   * Get all live matches globally (across all leagues and sports)
   * Best for "Watch All Live Matches" Telegram command
   */
  async getAllLiveMatches() {
    try {
      const cacheKey = 'live:all';
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 2 * 60 * 1000) { // 2 min cache for live
          return cached.data;
        }
      }

      let allLive = [];

      // Primary: try Football-Data global matches endpoint first (less prone to per-league 404s)
      if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
        try {
          logger.debug('📡 Fetching live matches from Football-Data (GLOBAL endpoint)');
          const fdGlobal = await this._getLiveFromFootballDataGlobal();
          logger.debug(`getAllLiveMatches: FD global returned ${fdGlobal ? fdGlobal.length : 0} matches`);
          if (fdGlobal && fdGlobal.length > 0) {
            const formatted = this._formatMatches(fdGlobal, 'football-data');
            logger.info(`✅ Football-Data (global): Found ${formatted.length} live matches`);
            await this.dataCache.storeLiveMatches('footballdata', formatted);
            this._setCached(cacheKey, formatted);
            await this._recordProviderHealth('footballdata', true, `Found ${formatted.length} live matches (global)`);
            return formatted;
          }

          // If global fetch returned nothing, fallback to per-competition fetch
          logger.debug('📡 Football-Data global returned no live matches; skipping per-league to avoid rate limits');
          // NOTE: Commenting out per-league FD calls to avoid rate-limiting
          // const competitions = ['39', '140', '135', '61', '78', '2'];
          // for (const compId of competitions) { ... }
          // Instead, fall through to SportMonks fallback
          const allLive = [];
        } catch (e) {
          logger.warn('Football-Data live fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('footballdata', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // SportMonks as fallback ONLY (DNS issue on Render, but works locally)
      if (allLive.length === 0 && CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) {
        try {
          logger.debug('📡 Fallback: Fetching live matches from SportMonks');
          const smMatches = await this.sportmonks.getAllLiveMatches();
          if (smMatches && smMatches.length > 0) {
            logger.info(`✅ SportMonks: Found ${smMatches.length} total live matches globally (fallback)`);
            await this.dataCache.storeLiveMatches('sportsmonks', smMatches);
            const formatted = this._formatMatches(smMatches, 'sportsmonks') || [];
            const liveOnly = formatted.filter(m => String(m.status || '').toUpperCase() === 'LIVE');
            logger.info(`🔍 SportMonks DIAGNOSTIC: raw:${smMatches.length} | formatted:${formatted.length} | live:${liveOnly.length}`);
            if (liveOnly.length > 0) {
              this._setCached(cacheKey, liveOnly);
              await this._recordProviderHealth('sportsmonks', true, `Found ${liveOnly.length} live matches (fallback)`);
              return liveOnly;
            }
            await this._recordProviderHealth('sportsmonks', false, `No matches marked LIVE (raw:${smMatches.length})`);
          }
        } catch (e) {
          logger.warn('SportMonks fallback failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // 🔄 FALLBACK: Try to read from RawDataCache (prefetched data) before giving up
      logger.debug('📚 Attempting to read live matches from cache');
      try {
        const fdCached = await this.dataCache.getLiveMatches('footballdata');
        if (fdCached && fdCached.length > 0) {
          logger.info(`📚 Using cached Football-Data live matches (${fdCached.length} matches)`);
          const formatted = this._formatMatches(fdCached, 'football-data') || [];
          this._setCached(cacheKey, formatted);
          return formatted;
        }

        const smCached = await this.dataCache.getLiveMatches('sportsmonks');
        if (smCached && smCached.length > 0) {
          logger.info(`📚 Using cached SportMonks live matches (${smCached.length} matches)`);
          const formatted = this._formatMatches(smCached, 'sportsmonks') || [];
          this._setCached(cacheKey, formatted);
          return formatted;
        }
      } catch (cacheErr) {
        logger.warn('Failed to read live matches from RawDataCache', cacheErr?.message);
      }

      logger.warn('⚠️  No live matches available globally from either provider');
      return [];
    } catch (err) {
      logger.error('getAllLiveMatches failed:', err.message);
      return [];
    }
  }

  /**
   * Get upcoming fixtures from SportMonks and Football-Data
   * @param {string} leagueId - Optional league ID (if omitted, fetches from all major competitions)
   * @param {object} options - Optional parameters
   */
  async getFixtures(leagueId = null, options = {}) {
    try {
      if (!leagueId) {
        // Fetch upcoming fixtures from all major football competitions
        const competitions = [39, 140, 135, 61, 78, 2]; // PL, LaLiga, SerieA, Ligue1, Bundesliga, CL
        let allFixtures = [];

        for (const compId of competitions) {
          try {
            const fixtures = await this.getUpcomingMatches(compId, { sport: 'football' });
            if (fixtures && Array.isArray(fixtures)) {
              allFixtures.push(...fixtures);
            }
          } catch (e) {
            logger.debug(`Fixtures fetch for ${compId} failed:`, e?.message);
          }
        }

        return allFixtures;
      }

      // Single league upcoming fixture fetch
      return await this.getUpcomingMatches(leagueId, options);
    } catch (err) {
      logger.warn('getFixtures failed:', err.message);
      return [];
    }
  }

  /**
   * Get upcoming matches from SportMonks and Football-Data
   * @param {number} leagueId - League ID
   * @param {object} options - Optional parameters
   */
  async getUpcomingMatches(leagueId, options = {}) {
    try {
      const cacheKey = `upcoming:${leagueId}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 min cache for upcoming
          return cached.data;
        }
      }

      // ONLY fetch from SportMonks and Football-Data
      // Try SportMonks first (preferred for upcoming fixtures)
      if (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) {
        try {
          logger.debug('📡 Fetching upcoming matches from SportMonks');
          const smFixtures = await this.sportmonks.getFixtures({ league_id: leagueId });
          if (smFixtures && smFixtures.length > 0) {
            logger.info(`✅ SportMonks: Found ${smFixtures.length} upcoming matches`);
            // Store raw data
            await this.dataCache.storeFixtures('sportsmonks', leagueId, smFixtures);
            this._setCached(cacheKey, smFixtures);
            await this._recordProviderHealth('sportsmonks', true, `Found ${smFixtures.length} upcoming matches`);
            return this._formatMatches(smFixtures, 'sportsmonks');
          }
        } catch (e) {
          logger.warn('SportMonks upcoming fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // Fallback to Football-Data if SportMonks unavailable
      if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
        try {
          logger.debug('📡 Fetching upcoming matches from Football-Data');
          const fdMatches = await this._getUpcomingFromFootballData(leagueId);
          if (fdMatches && fdMatches.length > 0) {
            logger.info(`✅ Football-Data: Found ${fdMatches.length} upcoming matches`);
            // Store raw data
            await this.dataCache.storeFixtures('footballdata', leagueId, fdMatches);
            this._setCached(cacheKey, fdMatches);
            await this._recordProviderHealth('footballdata', true, `Found ${fdMatches.length} upcoming matches`);
            return this._formatMatches(fdMatches, 'footballdata');
          }
        } catch (e) {
          logger.warn('Football-Data upcoming fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('footballdata', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // 🔄 FALLBACK: Try to read from RawDataCache (prefetched data)
      logger.debug(`📚 Attempting to read upcoming fixtures from cache for league ${leagueId}`);
      try {
        // Try both sources from cache
        const smCached = await this.dataCache.getFixtures('sportsmonks', leagueId);
        if (smCached && smCached.length > 0) {
          logger.info(`📚 Using cached SportMonks fixtures (${smCached.length} matches)`);
          this._setCached(cacheKey, smCached);
          return this._formatMatches(smCached, 'sportsmonks');
        }

        const fdCached = await this.dataCache.getFixtures('footballdata', leagueId);
        if (fdCached && fdCached.length > 0) {
          logger.info(`📚 Using cached Football-Data fixtures (${fdCached.length} matches)`);
          this._setCached(cacheKey, fdCached);
          return this._formatMatches(fdCached, 'footballdata');
        }
      } catch (cacheErr) {
        logger.warn('Failed to read from RawDataCache', cacheErr?.message);
      }

      logger.warn('⚠️  No upcoming matches available from SportMonks or Football-Data');
      return [];
    } catch (err) {
      logger.error('getUpcomingMatches failed:', err.message);
      return [];
    }
  }

  /**
   * Get live sports news
   */
  async getLiveNews(sport = 'football', max = 10) {
    try {
      const cacheKey = `news:${sport}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 min cache for news
          return cached.data;
        }
      }

      const news = await getNewsHeadlines({ query: sport, max });
      this._setCached(cacheKey, news);
      logger.info(`✅ News: Found ${news.length} headlines for "${sport}"`);
      return news;
    } catch (err) {
      logger.warn('News fetch failed', err.message);
      return [];
    }
  }

  /**
   * Get match odds (SportMonks only; Football-Data does not provide odds)
   */
  async getOdds(leagueId, options = {}) {
    try {
      const cacheKey = `odds:${leagueId}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 10 * 60 * 1000) { // 10 min cache
          return cached.data;
        }
      }

      // Try SportMonks for odds (Football-Data does not provide this)
      if (this.sportmonks && typeof this.sportmonks.getOdds === 'function') {
        try {
          logger.debug('📡 Fetching odds from SportMonks');
          const odds = await this.sportmonks.getOdds(leagueId);
          if (odds && odds.length > 0) {
            logger.info(`✅ SportMonks: Found ${odds.length} odds entries`);
            this._setCached(cacheKey, odds);
            await this._recordProviderHealth('sportsmonks', true, `Found ${odds.length} odds`);
            return odds;
          }
        } catch (e) {
          logger.debug('SportMonks odds fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // No odds available from configured providers
      logger.info('ℹ️  No odds available from SportMonks (Football-Data does not provide odds)');
      return [];
    } catch (err) {
      logger.error('getOdds failed', err);
      return [];
    }
  }

  /**
   * Get league standings/table
   */
  async getStandings(leagueId, season = null) {
    try {
      const cacheKey = `standings:${leagueId}:${season || 'current'}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 min cache
          return cached.data;
        }
      }

      // Attempt SportMonks for standings first
      if (this.sportmonks && typeof this.sportmonks.getStandings === 'function') {
        try {
          logger.debug('📡 Fetching standings via SportMonks');
          const smStandings = await this.sportmonks.getStandings(leagueId, season);
          if (smStandings && smStandings.length > 0) {
            logger.info(`✅ SportMonks: Found ${smStandings.length} standings entries`);
            this._setCached(cacheKey, smStandings);
            await this._recordProviderHealth('sportsmonks', true, `Found ${smStandings.length} standings`);
            return smStandings;
          }
        } catch (e) {
          logger.warn('SportMonks standings fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('sportsmonks', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // Fallback to Football-Data where possible
      if (CONFIG.FOOTBALLDATA && CONFIG.FOOTBALLDATA.KEY) {
        try {
          logger.debug('📡 Fetching standings via Football-Data');
          const fdStandings = await this._getStandingsFromFootballData(leagueId, season);
          if (fdStandings && fdStandings.length > 0) {
            logger.info(`✅ Football-Data: Found ${fdStandings.length} standings entries`);
            this._setCached(cacheKey, fdStandings);
            await this._recordProviderHealth('footballdata', true, `Found ${fdStandings.length} standings`);
            return fdStandings;
          }
        } catch (e) {
          logger.warn('Football-Data standings fetch failed', e?.message || String(e));
          try { await this._recordProviderHealth('footballdata', false, e?.message || String(e)); } catch(_) {}
        }
      }

      // No standings available from configured providers
      return [];
    } catch (err) {
      logger.error('getStandings failed', err);
      return [];
    }
  }

  /**
   * Get head-to-head history between two teams using SportMonks
   */
  async getHeadToHead(homeTeamId, awayTeamId) {
    try {
      if (!this.sportmonks) return { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0 };
      if (typeof this.sportmonks._fetch === 'function') {
        const endpoint = `head-to-head/${encodeURIComponent(homeTeamId)}/${encodeURIComponent(awayTeamId)}`;
        const data = await this.sportmonks._fetch(endpoint, {});
        if (!data) return { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0 };
        const records = Array.isArray(data) ? data : (data.results || data.data || []);
        const total = records.length;
        let homeWins = 0, awayWins = 0, draws = 0;
        for (const r of records) {
          const h = r.home_score ?? (r.result && r.result.home) ?? null;
          const a = r.away_score ?? (r.result && r.result.away) ?? null;
          if (h === null || a === null) continue;
          if (Number(h) > Number(a)) homeWins++; else if (Number(a) > Number(h)) awayWins++; else draws++;
        }
        return { totalMatches: total, homeWins, awayWins, draws, raw: records };
      }
      return { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0 };
    } catch (e) {
      logger.warn('getHeadToHead failed', e?.message || String(e));
      return { totalMatches: 0, homeWins: 0, awayWins: 0, draws: 0 };
    }
  }

  /**
   * Get recent form / latest matches for a team using SportMonks
   */
  async getRecentForm(teamId, limit = 5) {
    try {
      if (!this.sportmonks) return [];
      if (typeof this.sportmonks._fetch === 'function') {
        const endpoint = `teams/${encodeURIComponent(teamId)}/latest`;
        const data = await this.sportmonks._fetch(endpoint, {});
        const matches = Array.isArray(data) ? data : (data.results || data.data || []);
        return (matches || []).slice(0, limit);
      }
      return [];
    } catch (e) {
      logger.warn('getRecentForm failed', e?.message || String(e));
      return [];
    }
  }

  // ==================== API-Sports ====================

  /**
   * Adaptive fetch for API-Sports (API-Football).
   * Tries configured strategies (RapidAPI headers, direct apisports header) and
   * caches the successful strategy for subsequent calls.
   */
  async _fetchApiSports(path, options = {}, retries = 2) {
    // If API-Football is not allowed by the aggregator's runtime whitelist, abort
    if (!this._isAllowedSync('API_FOOTBALL')) {
      throw new Error('API-Football is not allowed by the SportsAggregator configuration');
    }

    // Check if API key is configured
    if (!CONFIG.API_FOOTBALL.KEY) {
      throw new Error('API_FOOTBALL_KEY or API_SPORTS_KEY environment variable not set');
    }

    const lastError = { err: null };

    // If we already determined a working strategy, try it first
    const strategies = this._apiSportsStrategy
      ? [this._apiSportsStrategy, ...this._apiSportsStrategies.filter(s => s.name !== this._apiSportsStrategy.name)]
      : this._apiSportsStrategies;

    for (const strat of strategies) {
      const base = (strat.base || '').replace(/\/$/, '');
      const url = path.startsWith('http') ? path : `${base}${path}`;
      const headers = Object.assign({}, (options.headers || {}), strat.headers ? strat.headers() : {});
      try {
        const resp = await this._fetchWithRetry(url, Object.assign({}, options, { headers }), retries);
        // mark strategy as working for future calls
        this._apiSportsStrategy = strat;
        logger.info(`API-Sports: using strategy ${strat.name} -> ${base}`);
        return resp;
      } catch (e) {
        lastError.err = e;
        logger.debug(`API-Sports strategy failed (${strat.name}): ${e.message}`);
        // try next strategy
        continue;
      }
    }

    // all strategies failed
    throw lastError.err || new Error('API-Sports: all strategies failed');
  }

  async _getLeaguesFromApiSports(region) {
    const path = '/leagues';
    const response = await this._fetchApiSports(path);

    const leagues = (response.response || []).filter(l => l.type === 'League').slice(0, 10);
    return leagues.map(l => ({
      id: l.league.id,
      name: l.league.name,
      country: l.country.name,
      logo: l.league.logo,
      type: 'football'
    }));
  }

  async _getLiveFromApiSports(leagueId) {
    // Try multiple endpoint strategies - API-Sports might use different query formats
    const strategies = [
      // Strategy 1: League-based live query (standard)
      {
        url: `https://v3.football.api-sports.io/fixtures?league=${leagueId}&status=LIVE`,
        name: 'league_live'
      },
      // Strategy 2: Date-based query for today
      {
        url: `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2024&status=LIVE`,
        name: 'league_season_live'
      }
    ];
    
    const headers = {
      'x-apisports-key': CONFIG.API_FOOTBALL.KEY
    };
    
    for (const strategy of strategies) {
      try {
        const response = await this._fetchWithRetry(strategy.url, { headers }, 1);
        if (response.response && response.response.length > 0) {
          logger.info(`API-Sports (${strategy.name}): Got ${response.response.length} matches`);
          return response.response.slice(0, 10);
        }
      } catch (e) {
        logger.debug(`API-Sports ${strategy.name} failed: ${e.message}`);
      }
    }
    
    logger.warn(`API-Sports live matches for league ${leagueId}: No data from any strategy`);
    return [];
  }

  async _getOddsFromApiSports(leagueId) {
    // Try multiple endpoint strategies for odds
    const strategies = [
      {
        url: `https://v3.football.api-sports.io/odds?league=${leagueId}&status=LIVE`,
        name: 'odds_live'
      },
      {
        url: `https://v3.football.api-sports.io/odds?league=${leagueId}`,
        name: 'odds_all'
      }
    ];
    
    const headers = {
      'x-apisports-key': CONFIG.API_FOOTBALL.KEY
    };
    
    for (const strategy of strategies) {
      try {
        const response = await this._fetchWithRetry(strategy.url, { headers }, 1);
        if (response.response && response.response.length > 0) {
          logger.info(`API-Sports odds (${strategy.name}): Got ${response.response.length} matches`);
          return response.response.slice(0, 10).map(m => ({
            fixture: m.fixture,
            bookmakers: m.bookmakers || []
          }));
        }
      } catch (e) {
        logger.debug(`API-Sports ${strategy.name} failed: ${e.message}`);
      }
    }
    
    logger.warn(`API-Sports odds for league ${leagueId}: No data from any strategy`);
    return [];
  }

  async _getStandingsFromApiSports(leagueId, season) {
    const path = `/standings?league=${leagueId}`;
    const response = await this._fetchApiSports(path);

    return (response.response || [{ standings: [] }])[0].standings || [];
  }

  // ==================== Football-Data ====================

  async _getLeaguesFromFootballData(region) {
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions`;
    const response = await this._fetchWithRetry(url, {
      headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
    });

    const comps = (response.competitions || []).filter(c => c.type === 'LEAGUE').slice(0, 10);
    return comps.map(c => ({
      id: c.id,
      name: c.name,
      country: c.area.name,
      type: 'football'
    }));
  }

  /**
   * Global Football-Data live fetch (date range)
   * Uses the Football-Data global matches endpoint to reduce per-league 404s
   */
  async _getLiveFromFootballDataGlobal() {
    try {
      if (!CONFIG.FOOTBALLDATA || !CONFIG.FOOTBALLDATA.KEY) {
        logger.debug('Football-Data global: not configured');
        return [];
      }
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const url = `${CONFIG.FOOTBALLDATA.BASE}/matches?dateFrom=${today}&dateTo=${tomorrow}`;
      logger.debug(`📡 Football-Data global fetch: ${url}`);
      const response = await this._fetchWithRetry(url, { headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY } }, 2);
      logger.debug(`Football-Data global response: ${response ? `${(response.matches || []).length} total matches` : 'no response'}`);
      const matches = (response.matches || []).filter(m => (m.status === 'LIVE' || m.status === 'IN_PLAY'));
      logger.debug(`Football-Data global: ${matches.length} live/in_play matches found`);
      return matches.slice(0, 200);
    } catch (e) {
      logger.warn('Football-Data global live fetch failed', e?.message || String(e));
      return [];
    }
  }

  async _getLiveFromFootballData(leagueId) {
    // Map API-Sports league ID to Football-Data league code
    const mapping = LEAGUE_MAPPINGS[String(leagueId)];
    const fdLeagueId = mapping ? mapping.footballDataId : String(leagueId);
    
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions/${fdLeagueId}/matches?status=LIVE`;
    try {
      const response = await this._fetchWithRetry(url, {
        headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
      }, 2);
      return (response.matches || []).slice(0, 10);
    } catch (e) {
      logger.warn(`Football-Data live matches for league ${fdLeagueId} failed: ${e.message}`);
      return [];
    }
  }

  async _getStandingsFromFootballData(leagueId, season) {
    // Map API-Sports league ID to Football-Data league code
    const mapping = LEAGUE_MAPPINGS[String(leagueId)];
    const fdLeagueId = mapping ? mapping.footballDataId : String(leagueId);
    
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions/${fdLeagueId}/standings`;
    try {
      const response = await this._fetchWithRetry(url, {
        headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
      }, 2);
      return (response.standings || [{ table: [] }])[0].table || [];
    } catch (e) {
      logger.warn(`Football-Data standings for league ${fdLeagueId} failed: ${e.message}`);
      return [];
    }
  }

  async _getUpcomingFromFootballData(leagueId) {
    // Map API-Sports league ID to Football-Data league code
    const mapping = LEAGUE_MAPPINGS[String(leagueId)];
    const fdLeagueId = mapping ? mapping.footballDataId : String(leagueId);
    
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions/${fdLeagueId}/matches?status=SCHEDULED`;
    try {
      const response = await this._fetchWithRetry(url, {
        headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
      }, 2);
      return (response.matches || []).slice(0, 20); // Return up to 20 upcoming matches
    } catch (e) {
      logger.warn(`Football-Data upcoming matches for league ${fdLeagueId} failed: ${e.message}`);
      return [];
    }
  }

  // ==================== SofaScore (RapidAPI) ====================

  async _getLiveFromSofaScore() {
    if (!CONFIG.SOFASCORE.KEY) return [];
    try {
      // SofaScore doesn't have a direct live matches endpoint but we can use events
      const url = 'https://sofascore.p.rapidapi.com/v1/events/live';
      const response = await this._fetchWithRetry(url, {
        headers: {
          'X-RapidAPI-Key': CONFIG.SOFASCORE.KEY,
          'X-RapidAPI-Host': CONFIG.SOFASCORE.HOST
        }
      });

      // response may be undefined or not contain events; guard safely
      const events = (response && response.events) ? response.events : [];
      return events.slice(0, 10);
    } catch (e) {
      logger.warn('SofaScore live matches failed', e.message);
      return [];
    }
  }

  async _getOddsFromSofaScore() {
    if (!CONFIG.SOFASCORE.KEY) return [];
    try {
      const url = 'https://sofascore.p.rapidapi.com/v1/betting/live-odds';
      const response = await this._fetchWithRetry(url, {
        headers: {
          'X-RapidAPI-Key': CONFIG.SOFASCORE.KEY,
          'X-RapidAPI-Host': CONFIG.SOFASCORE.HOST
        }
      });

      const odds = (response && response.odds) ? response.odds : [];
      return odds.slice(0, 10);
    } catch (e) {
      logger.warn('SofaScore odds failed', e.message);
      return [];
    }
  }

  // ==================== AllSports API (RapidAPI) ====================

  async _getLiveFromAllSports() {
    if (!CONFIG.ALLSPORTS.KEY) return [];
    try {
      const url = 'https://allsportsapi.p.rapidapi.com/events/live';
      const response = await this._fetchWithRetry(url, {
        headers: {
          'X-RapidAPI-Key': CONFIG.ALLSPORTS.KEY,
          'X-RapidAPI-Host': CONFIG.ALLSPORTS.HOST
        }
      });

      return (response.result || response.results || []).slice(0, 10);
    } catch (e) {
      logger.warn('AllSports live matches failed', e.message);
      return [];
    }
  }

  async _getOddsFromAllSports() {
    if (!CONFIG.ALLSPORTS.KEY) return [];
    try {
      const url = 'https://allsportsapi.p.rapidapi.com/odds/live';
      const response = await this._fetchWithRetry(url, {
        headers: {
          'X-RapidAPI-Key': CONFIG.ALLSPORTS.KEY,
          'X-RapidAPI-Host': CONFIG.ALLSPORTS.HOST
        }
      });

      return (response.result || response.results || []).slice(0, 10);
    } catch (e) {
      logger.warn('AllSports odds failed', e.message);
      return [];
    }
  }

  // ==================== SportsData.io ====================

  async _getLiveFromSportsData() {
    if (!CONFIG.SPORTSDATA.KEY) return [];
    try {
      // SportsData.io live matches endpoint
      const url = `${CONFIG.SPORTSDATA.BASE}/v3/soccer/scores/json/LiveGames?key=${CONFIG.SPORTSDATA.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (Array.isArray(response) ? response : response.games || []).slice(0, 10);
    } catch (e) {
      logger.warn('SportsData.io live matches failed', e.message);
      return [];
    }
  }

  async _getOddsFromSportsData() {
    if (!CONFIG.SPORTSDATA.KEY) return [];
    try {
      const url = `${CONFIG.SPORTSDATA.BASE}/v3/soccer/odds/json/LiveOdds?key=${CONFIG.SPORTSDATA.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (Array.isArray(response) ? response : response.odds || []).slice(0, 10);
    } catch (e) {
      logger.warn('SportsData.io odds failed', e.message);
      return [];
    }
  }

  async _getStandingsFromSportsData(leagueId) {
    if (!CONFIG.SPORTSDATA.KEY) return [];
    try {
      const url = `${CONFIG.SPORTSDATA.BASE}/v3/soccer/standings/json/Standings/${leagueId}?key=${CONFIG.SPORTSDATA.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (Array.isArray(response) ? response : response.standings || []).slice(0, 20);
    } catch (e) {
      logger.warn('SportsData.io standings failed', e.message);
      return [];
    }
  }

  // ==================== SportsMonks ====================

  async _getLiveFromSportsMonks(sport = 'football') {
    try {
      if (!CONFIG.SPORTSMONKS || !CONFIG.SPORTSMONKS.KEY) {
        logger.warn('⚠️  SportMonks API Key not configured');
        return [];
      }

      const apiToken = CONFIG.SPORTSMONKS.KEY;
      const url = `${SPORTSMONKS_BASE_URL}/football/livescores?api_token=${apiToken}`;
      
      logger.info(`[INFO] Fetching SportMonks livescores from: ${url}`);
      
      const res = await axios.get(url, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });

      const items = res.data && res.data.data ? res.data.data : [];
      
      if (!Array.isArray(items) || items.length === 0) {
        logger.warn(`⚠️  SportMonks returned no live matches (${items.length} items)`);
        return [];
      }

      logger.info(`✅ SportMonks: Found ${items.length} live matches`);

      // Normalize SportMonks fixture shape to internal shape used by menu builder
      const normalized = items.slice(0, 10).map((it) => {
        // SportMonks returns `name`: "Home vs Away" format
        let home = it.home_team || it.home || undefined;
        let away = it.away_team || it.away || undefined;
        
        if ((!home || !away) && it.name && typeof it.name === 'string' && it.name.includes(' vs ')) {
          const parts = it.name.split(' vs ');
          home = home || parts[0]?.trim();
          away = away || parts[1]?.trim();
        }

        // Scores may be present under `scores` or `result` fields
        let home_score = undefined;
        let away_score = undefined;
        if (it.scores && it.scores.localteam_score !== undefined) {
          home_score = it.scores.localteam_score;
          away_score = it.scores.visitorteam_score;
        } else if (it.result && typeof it.result === 'object') {
          home_score = it.result.home || undefined;
          away_score = it.result.away || undefined;
        }

        const status = it.result_info || it.state || (`Starts ${it.starting_at || it.starting_at_timestamp || ''}`);

        return {
          id: it.id || `${it.fixture_id || Math.random().toString(36).slice(2, 9)}`,
          home,
          away,
          home_team: home,
          away_team: away,
          home_score,
          away_score,
          status,
          league: (it.league && it.league.name) || it.league_id || undefined,
          start_time: it.starting_at || it.starting_at_timestamp || undefined,
          raw: it
        };
      });

      return normalized;
    } catch (error) {
      logger.error(`❌ SportMonks fetch failed: ${error.message}`);
      if (error.response) {
        logger.error(`  Status: ${error.response.status}`);
        logger.error(`  Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
      return [];
    }
  }

  async _getOddsFromSportsMonks() {
    if (!CONFIG.SPORTSMONKS.KEY) return [];
    try {
      const url = `${CONFIG.SPORTSMONKS.BASE}/odds/live?include=fixture,bookmakers&api_token=${CONFIG.SPORTSMONKS.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (response.data || []).slice(0, 10);
    } catch (e) {
      logger.warn('SportsMonks odds failed', e.message);
      return [];
    }
  }

  async _getStandingsFromSportsMonks(leagueId) {
    if (!CONFIG.SPORTSMONKS.KEY) return [];
    try {
      const url = `${CONFIG.SPORTSMONKS.BASE}/standings/seasons/latest?league_id=${leagueId}&api_token=${CONFIG.SPORTSMONKS.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (response.data || []).slice(0, 20);
    } catch (e) {
      logger.warn('SportsMonks standings failed', e.message);
      return [];
    }
  }

  // ==================== Utilities ====================

  async _fetchWithRetry(url, options = {}, retries = 3) {
    let attempt = 0;
    let lastErr = null;
    while (attempt < retries) {
      try {
        attempt += 1;
        const resp = await fetch(url, options);
        if (resp && resp.ok) {
          try {
            return await resp.json();
          } catch (parseErr) {
            // if JSON parse fails, return raw text as fallback
            const txt = await resp.text().catch(() => null);
            logger.warn(`Failed to parse JSON from ${url}, returning text fallback`);
            return txt;
          }
        }

        if (resp && resp.status === 429) {
          const wait = Math.min(5000, 500 * attempt);
          logger.warn(`Rate limited by ${url}, retrying after ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }

        // For 4xx/5xx errors, capture status and body for diagnostic logs
        const body = await resp.text().catch(() => null);
        const err = new Error(`HTTP ${resp.status} ${resp.statusText} - ${body ? body.substring(0, 200) : ''}`);
        lastErr = err;
        // exponential backoff
        const backoff = Math.min(2000 * attempt, 8000);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      } catch (e) {
        lastErr = e;
        if (attempt >= retries) break;
        const backoff = Math.min(500 * attempt, 3000);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    // All attempts exhausted
    logger.warn(`_fetchWithRetry failed for ${url}: ${lastErr?.message || lastErr}`);
    throw lastErr || new Error('Fetch failed');
  }

  _setCached(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  _normalizeOpenLigaMatch(m) {
    // Map OpenLiga match fields to canonical analyzer schema
    try {
      const home = (m.Team1 && (m.Team1.TeamName || m.Team1.Name)) || m.home || 'Home';
      const away = (m.Team2 && (m.Team2.TeamName || m.Team2.Name)) || m.away || 'Away';
      const homeScore = m.MatchResults && m.MatchResults[0] && m.MatchResults[0].PointsTeam1 || null;
      const awayScore = m.MatchResults && m.MatchResults[0] && m.MatchResults[0].PointsTeam2 || null;
      const matchTime = m.MatchDateTime || null;
      const status = m.MatchIsFinished ? 'FINISHED' : (m.MatchDateTime && new Date(m.MatchDateTime) > new Date() ? 'SCHEDULED' : 'LIVE');
      
      return {
        id: m.MatchID || null,
        home: String(home),
        away: String(away),
        homeScore: homeScore !== null ? Number(homeScore) : null,
        awayScore: awayScore !== null ? Number(awayScore) : null,
        status,
        time: matchTime ? new Date(matchTime).toLocaleString() : 'TBA',
        venue: m.Location && m.Location.LocationCity ? `${m.Location.LocationCity}, ${m.Location.LocationStadium || ''}` : 'TBA',
        provider: 'openligadb',
        raw: m
      };
    } catch (e) {
      logger.warn('OpenLiga normalization error', e?.message || String(e));
      return {
        id: null,
        home: 'Team1',
        away: 'Team2',
        homeScore: null,
        awayScore: null,
        status: 'UNKNOWN',
        time: 'TBA',
        venue: 'TBA',
        provider: 'openligadb',
        raw: m
      };
    }
  }

  _formatMatches(matches, source) {
    return matches.map(m => {
      // already normalized from OpenLiga
      if (source === 'openligadb') return m;

      // helper to safely extract nested values and coerce to string where appropriate
      const safe = (val, fallback = 'TBA') => {
        try {
          if (val === null || typeof val === 'undefined') return fallback;
          if (typeof val === 'string' || typeof val === 'number') return String(val);
          if (typeof val === 'object') {
            // if object contains common fields, try those
            if (val.name) return String(val.name);
            if (val.fullName) return String(val.fullName);
            return JSON.stringify(val);
          }
          return String(val);
        } catch (e) {
          return fallback;
        }
      };

      if (source === 'api-sports') {
        return {
          id: (m.fixture && (m.fixture.id || m.fixture.fixture_id)) || m.id || null,
          home: safe(m.teams && m.teams.home && m.teams.home.name, 'Home'),
          away: safe(m.teams && m.teams.away && m.teams.away.name, 'Away'),
          homeScore: (m.goals && (typeof m.goals.home === 'number' ? m.goals.home : (m.goals.home || null))) || (m.score && m.score.fulltime && m.score.fulltime.home) || null,
          awayScore: (m.goals && (typeof m.goals.away === 'number' ? m.goals.away : (m.goals.away || null))) || (m.score && m.score.fulltime && m.score.fulltime.away) || null,
          status: safe(m.fixture && (m.fixture.status && (m.fixture.status.long || m.fixture.status.short || m.fixture.status))),
          time: (m.fixture && m.fixture.status === 'LIVE' && m.fixture.elapsed) ? `${m.fixture.elapsed}'` : safe(m.fixture && (m.fixture.date || m.fixture.timestamp), 'TBA'),
          venue: safe(m.fixture && m.fixture.venue && m.fixture.venue.name, 'TBA'),
          provider: 'api-sports',
          raw: m
        };
      }

      if (source === 'football-data') {
        // Football-Data provides consistent structure but ensure we handle all field variations
        let homeName = safe(m.homeTeam && (m.homeTeam.name || m.homeTeam.fullName || m.homeTeam.shortName), 'Home');
        let awayName = safe(m.awayTeam && (m.awayTeam.name || m.awayTeam.fullName || m.awayTeam.shortName), 'Away');
        
        // Fallback to direct team properties if nested structure missing
        if (homeName === 'Home' && m.homeTeamName) homeName = safe(m.homeTeamName, 'Home');
        if (awayName === 'Away' && m.awayTeamName) awayName = safe(m.awayTeamName, 'Away');
        
        // Try different score field locations
        let homeScore = null;
        let awayScore = null;
        
        if (m.score && typeof m.score === 'object') {
          if (m.score.fullTime) {
            homeScore = (typeof m.score.fullTime.home === 'number') ? m.score.fullTime.home : null;
            awayScore = (typeof m.score.fullTime.away === 'number') ? m.score.fullTime.away : null;
          } else if (m.score.current) {
            homeScore = (typeof m.score.current.home === 'number') ? m.score.current.home : null;
            awayScore = (typeof m.score.current.away === 'number') ? m.score.current.away : null;
          }
        }
        
        // Fallback for direct score properties
        if (homeScore === null && (typeof m.homeTeamScore === 'number')) homeScore = m.homeTeamScore;
        if (awayScore === null && (typeof m.awayTeamScore === 'number')) awayScore = m.awayTeamScore;
        
        logger.debug(`[FOOTBALLDATA_FORMAT] ${homeName} vs ${awayName} | status:${m.status} | score:${homeScore}:${awayScore}`);
        
        return {
          id: m.id || null,
          home: homeName,
          away: awayName,
          homeScore: homeScore,
          awayScore: awayScore,
          status: safe(m.status, 'UNKNOWN'),
          time: (m.status === 'LIVE' && m.minute) ? `${m.minute}'` : safe(m.utcDate, 'TBA'),
          venue: safe(m.venue || (m.stage && m.stage.name), 'TBA'),
          league: safe(m.competition && (m.competition.name || m.competition.shortName), 'Unknown'),
          provider: 'football-data',
          raw: m
        };
      }

      // SportMonks provider
      if (source === 'sportsmonks') {
        // SportMonks API returns nested team data with various possible structures
        // Priority order for team extraction:
        // 1. participants[] array (primary structure)
        // 2. teams object with home/away properties
        // 3. homeTeam/awayTeam direct properties
        // 4. league_stage.round.fixtures include relation with real_team data
        
        let homeName = 'Home';
        let awayName = 'Away';
        let homeScore = null;
        let awayScore = null;
        
        // DEBUG: Log raw match structure to understand SportMonks API response
        if (!m._logged) {
          logger.debug(`[SPORTSMONKS_RAW] Match ID: ${m.id} | Keys: ${Object.keys(m).join(', ')}`);
          if (m.participants) logger.debug(`[SPORTSMONKS_RAW] Participants structure: ${JSON.stringify(m.participants?.slice(0, 2))}`);
          if (m.teams) logger.debug(`[SPORTSMONKS_RAW] Teams structure: ${JSON.stringify(m.teams)}`);
          m._logged = true; // prevent duplicate logging
        }
        
        // Strategy 1: Try participants array (primary)
        const participants = m.participants || m.teams || [];
        if (Array.isArray(participants) && participants.length >= 2) {
          // Participants usually [home, away] order - each has { id, name, fullName, score, goals, etc }
          const home = participants[0];
          const away = participants[1];
          
          if (home) {
            homeName = safe(
              (home.name || home.fullName || (home.meta && home.meta.name) || (home.team && home.team.name) || 
               (home.data && (home.data.name || home.data.fullName))),
              'Home'
            );
            homeScore = (home.score !== undefined) ? home.score : 
                       ((home.goals !== undefined) ? home.goals : 
                       ((home.meta && home.meta.goals) || (home.result || null)));
          }
          
          if (away) {
            awayName = safe(
              (away.name || away.fullName || (away.meta && away.meta.name) || (away.team && away.team.name) || 
               (away.data && (away.data.name || away.data.fullName))),
              'Away'
            );
            awayScore = (away.score !== undefined) ? away.score : 
                       ((away.goals !== undefined) ? away.goals : 
                       ((away.meta && away.meta.goals) || (away.result || null)));
          }
        }
        
        // Strategy 2: Try teams object if participants failed
        if (homeName === 'Home' && m.teams && typeof m.teams === 'object' && !Array.isArray(m.teams)) {
          if (m.teams.home) {
            homeName = safe(m.teams.home.name || m.teams.home.fullName, 'Home');
            homeScore = m.teams.home.goals || m.teams.home.score || null;
          }
          if (m.teams.away) {
            awayName = safe(m.teams.away.name || m.teams.away.fullName, 'Away');
            awayScore = m.teams.away.goals || m.teams.away.score || null;
          }
        }
        
        // Strategy 3: Try direct properties
        if (homeName === 'Home' && (m.homeTeam || m.home_team)) {
          const ht = m.homeTeam || m.home_team;
          homeName = safe(ht.name || ht.fullName, 'Home');
          homeScore = ht.goals || ht.score || null;
        }
        if (awayName === 'Away' && (m.awayTeam || m.away_team)) {
          const at = m.awayTeam || m.away_team;
          awayName = safe(at.name || at.fullName, 'Away');
          awayScore = at.goals || at.score || null;
        }
        
        // SportMonks state mapping: map common state_id values to canonical statuses
        // Note: providers may use slightly different numeric codes; be tolerant.
        let status = 'UNKNOWN';
        const sid = Number(m.state_id || m.state || 0);
        if (sid === 1) status = 'SCHEDULED';
        else if (sid === 2 || sid === 3) status = 'LIVE';
        else if (sid === 4) status = 'FINISHED';
        else if (sid === 5) status = 'POSTPONED';
        // fallback: if textual state or result_info suggests live, prefer LIVE
        if (!['LIVE','SCHEDULED','FINISHED','POSTPONED'].includes(String(status))) {
          const textState = (m.state || m.result_info || '').toString().toLowerCase();
          if (textState.includes('live') || textState.includes('in progress') || textState.includes('ht') || textState.includes('1st')) {
            status = 'LIVE';
          }
        }
        
        // Extract time: if LIVE, use minute; otherwise use starting_at
        let timeStr = 'TBA';
        if (status === 'LIVE' && m.minute) timeStr = `${m.minute}'`;
        else if (m.starting_at) timeStr = safe(m.starting_at);
        else if (m.scheduled_at) timeStr = safe(m.scheduled_at);
        
        logger.debug(`[SPORTSMONKS_FORMAT] ${homeName} vs ${awayName} | status:${status} | home:${homeScore} away:${awayScore}`);
        
        return {
          id: m.id || null,
          home: homeName,
          away: awayName,
          homeScore: (typeof homeScore === 'number') ? homeScore : (homeScore ? Number(homeScore) : null),
          awayScore: (typeof awayScore === 'number') ? awayScore : (awayScore ? Number(awayScore) : null),
          status: status,
          time: timeStr,
          league: (m.league && (m.league.name || m.league.fullName)) || (m.league_id || 'Unknown'),
          venue: safe(m.venue && (m.venue.name || m.venue.fullName), 'TBA'),
          provider: 'sportsmonks',
          raw: m
        };
      }

      // ESPN provider (home/away are objects with {name, score} shape)
      if (source === 'espn') {
        return {
          id: m.id || null,
          home: safe(m.home && m.home.name, 'Home'),
          away: safe(m.away && m.away.name, 'Away'),
          homeScore: (m.home && typeof m.home.score === 'number') ? m.home.score : null,
          awayScore: (m.away && typeof m.away.score === 'number') ? m.away.score : null,
          status: safe(m.status, 'UNKNOWN'),
          time: safe(m.startTime || m.date, 'TBA'),
          league: m.league || 'ESPN',
          provider: 'espn',
          raw: m
        };
      }

      // StatPal normalization: handle many possible field names/shapes
      if (source === 'statpal') {
        const pick = (...keys) => {
          for (const k of keys) {
            if (!k) continue;
            // nested path support (e.g., 'teams.home.name')
            if (k.indexOf('.') > -1) {
              const parts = k.split('.');
              let cur = m;
              let ok = true;
              for (const p of parts) {
                if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
                  cur = cur[p];
                } else { ok = false; break; }
              }
              if (ok && (typeof cur === 'string' || typeof cur === 'number')) return cur;
              if (ok && cur && typeof cur === 'object' && cur.name) return cur.name;
              continue;
            }
            if (Object.prototype.hasOwnProperty.call(m, k)) {
              const v = m[k];
              if (v === null || typeof v === 'undefined') continue;
              if (typeof v === 'string' || typeof v === 'number') return v;
              if (typeof v === 'object') {
                if (v.name) return v.name;
                if (v.title) return v.title;
                if (v.fullName) return v.fullName;
                // attempt to stringify small objects
                try { return JSON.stringify(v); } catch (e) { continue; }
              }
            }
          }
          return null;
        };

        const home = pick('home', 'home_team', 'homeTeam', 'localteam', 'team_home', 'teams.home', 'home.name', 'home.team', 'home_team_name', 'main_team', 'fixture.home', 'teams.0', 'participants.0.name');
        const away = pick('away', 'away_team', 'awayTeam', 'visitorteam', 'team_away', 'teams.away', 'away.name', 'away.team', 'away_team_name', 'visitor_team', 'fixture.away', 'teams.1', 'participants.1.name');

        const homeScore = pick('homeScore', 'home_score', 'score.home', 'scores.home', 'goals.home', 'home.goals', 'main_score', 'fixture.home_score');
        const awayScore = pick('awayScore', 'away_score', 'score.away', 'scores.away', 'goals.away', 'away.goals', 'visitor_score', 'fixture.away_score');

        const status = pick('status', 'match_status', 'state', 'status_text', 'stage');
        const time = pick('time', 'match_time', 'start_time', 'minute', 'elapsed', 'status_time', 'kick_off', 'utc_date');

        // If home/away still null, try to extract from title or other fields
        let homeVal = home;
        let awayVal = away;
        if (!homeVal || !awayVal) {
          const title = m.title || m.event_title || m.fixture_title || '';
          if (title && title.includes(' vs ')) {
            const parts = title.split(' vs ');
            if (!homeVal) homeVal = parts[0]?.trim();
            if (!awayVal) awayVal = parts[1]?.trim();
          }
        }

        return {
          id: m.id || m.match_id || m.fixture_id || null,
          home: safe(homeVal, 'Home'),
          away: safe(awayVal, 'Away'),
          homeScore: (typeof homeScore === 'number') ? homeScore : (homeScore ? Number(homeScore) : null),
          awayScore: (typeof awayScore === 'number') ? awayScore : (awayScore ? Number(awayScore) : null),
          status: safe(status, 'UNKNOWN'),
          time: safe(time, 'TBA'),
          provider: 'statpal',
          raw: m
        };
      }

      // default: try to coerce obvious fields and return a safe minimal object
      return {
        id: m.id || m.fixture?.id || null,
        home: safe(m.home || (m.teams && m.teams.home && m.teams.home.name) || (m.title && m.title.split && String(m.title).split(' - ')[0]) , 'Home'),
        away: safe(m.away || (m.teams && m.teams.away && m.teams.away.name) || (m.title && m.title.split && String(m.title).split(' - ')[1]) , 'Away'),
        homeScore: (m.homeScore || m.goals?.home || null),
        awayScore: (m.awayScore || m.goals?.away || null),
        status: safe(m.status || (m.fixture && m.fixture.status) || 'UNKNOWN'),
        time: safe(m.time || (m.fixture && m.fixture.elapsed) || m.date || 'TBA'),
        venue: safe(m.venue || (m.fixture && m.fixture.venue && m.fixture.venue.name) || 'TBA'),
        provider: source || 'unknown',
        raw: m
      };
    });
  }

  /**
   * Lightweight health check for the primary provider (API-Sports)
   * Returns an object { apiSports: boolean, reason?: string }
   */
  async checkPrimaryProviderHealth() {
    if (!CONFIG.API_FOOTBALL || !CONFIG.API_FOOTBALL.KEY) {
      await this._recordProviderHealth('api-sports', false, 'API key not configured');
      return { apiSports: false, reason: 'no_api_key' };
    }

    try {
      // Attempt a small, low-cost request (leagues) to verify connectivity
      const resp = await this._fetchApiSports('/leagues', {}, 1);
      const count = (resp && (resp.response || resp.leagues || [])).length || 0;
      const ok = count >= 0;
      await this._recordProviderHealth('api-sports', ok, `leagues:${count}`);
      return { apiSports: ok, reason: ok ? 'ok' : 'no_data' };
    } catch (e) {
      await this._recordProviderHealth('api-sports', false, e?.message || String(e));
      return { apiSports: false, reason: e?.message || String(e) };
    }
  }

  /**
   * Convenience: check whether live feed appears healthy based on cached provider health
   */
  async isLiveFeedHealthy() {
    try {
      if (!this.redis) {
        // If no redis present, run a primary provider health check
        const r = await this.checkPrimaryProviderHealth();
        return r.apiSports === true;
      }
      const key = `${CONFIG.DIAGNOSTICS.PREFIX}api-sports`;
      const raw = await this.redis.get(key).catch(() => null);
      if (!raw) {
        const r = await this.checkPrimaryProviderHealth();
        return r.apiSports === true;
      }
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.ok);
    } catch (e) {
      return false;
    }
  }

  _getDemoMatches() {
    return [
      {
        id: 1,
        home: 'Manchester United',
        away: 'Liverpool',
        homeScore: 2,
        awayScore: 1,
        status: 'LIVE',
        time: '45\'',
        venue: 'Old Trafford'
      },
      {
        id: 2,
        home: 'Chelsea',
        away: 'Arsenal',
        homeScore: 1,
        awayScore: 1,
        status: 'LIVE',
        time: '62\'',
        venue: 'Stamford Bridge'
      },
      {
        id: 3,
        home: 'Manchester City',
        away: 'Newcastle',
        homeScore: 3,
        awayScore: 0,
        status: 'FINISHED',
        time: '90+3\'',
        venue: 'Etihad'
      }
    ];
  }

  _getDemoOdds() {
    return [
      {
        home: 'Manchester United',
        away: 'Liverpool',
        homeOdds: 2.10,
        drawOdds: 3.40,
        awayOdds: 3.20,
        bookmaker: 'Bet365'
      },
      {
        home: 'Chelsea',
        away: 'Arsenal',
        homeOdds: 1.95,
        drawOdds: 3.60,
        awayOdds: 3.60,
        bookmaker: 'Bet365'
      }
    ];
  }

  _getDemoStandings() {
    return [
      { position: 1, team: 'Manchester City', played: 10, won: 8, drawn: 1, lost: 1, points: 25 },
      { position: 2, team: 'Liverpool', played: 10, won: 7, drawn: 2, lost: 1, points: 23 },
      { position: 3, team: 'Arsenal', played: 10, won: 6, drawn: 2, lost: 2, points: 20 },
      { position: 4, team: 'Chelsea', played: 10, won: 5, drawn: 3, lost: 2, points: 18 },
      { position: 5, team: 'Newcastle', played: 10, drawn: 4, won: 4, lost: 2, points: 16 }
    ];
  }

  // ==================== REMOVED: StatPal (disabled) ====================
  // StatPal has been removed from the deployment. All StatPal data access
  // methods have been removed or disabled. Use SportMonks or Football-Data instead.

  // ==================== REMOVED: StatPal helper methods (disabled) ====================
  // All StatPal-specific getters have been removed as part of StatPal deprecation.
  // Use SportMonks or Football-Data API methods instead.

  /**
   * Find a single match by id across known live sources.
   * Tries cached live data, SportMonks livescores (football only).
   */
  async getMatchById(matchId, sport = 'soccer') {
    try {
      // Simple search helper over an array of normalized matches
      const findIn = (arr) => {
        if (!Array.isArray(arr)) return null;
        return arr.find(m => String(m.id) === String(matchId) || (m.raw && (String(m.raw.id) === String(matchId) || String(m.raw.match_id) === String(matchId))));
      };

      // 1) search in-memory caches (live caches)
      for (const [k, v] of this.cache.entries()) {
        if (k.startsWith('live:') && v && Array.isArray(v.data)) {
          const found = findIn(v.data);
          if (found) return this._formatMatches([found], 'sportsmonks')[0];
        }
      }

      // 2) try SportMonks livescores (football only)
      if (sport === 'soccer' || sport === 'football') {
        // Prefer the aggregator's direct SportMonks fetch (more tolerant to env/config)
        try {
          const arr = await this._getLiveFromSportsMonks(sport);
          const f = findIn(arr);
          if (f) return this._formatMatches([f], 'sportsmonks')[0];
        } catch (e) {
          logger.debug('Aggregator SportMonks live lookup failed', e?.message || String(e));
        }

        // Fallback: try wrapper service if present
        if (this.sportmonks && CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) {
          try {
            const sm = await this.sportmonks.getLivescores();
            if (Array.isArray(sm)) {
              const f2 = findIn(sm);
              if (f2) return this._formatMatches([f2], 'sportsmonks')[0];
            }
          } catch (e) {
            logger.debug('SportMonks service match lookup failed', e?.message || String(e));
          }
        }
      }

      return null;
    } catch (e) {
      logger.warn('getMatchById failed', e?.message || String(e));
      return null;
    }
  }
}

export default SportsAggregator;
