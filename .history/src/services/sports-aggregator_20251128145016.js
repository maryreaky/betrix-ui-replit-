/**
 * Sports Data Aggregator
 * Fetches and normalizes data from multiple sports APIs with priority order:
 * 0. StatPal (All Sports Data) - Primary source for all sports
 * 1. API-Sports (API-Football) - Primary source for soccer
 * 2. Football-Data.org - Secondary source
 * 3. AllSports API (RapidAPI) - Tertiary source
 * 4. SportsData.io - Additional source
 * 5. SofaScore (RapidAPI) - Real-time data
 * 6. SportsMonks - Comprehensive data
 * 7. Live Scraper (ESPN + ScoreBat) - Real data
 * 8. Goal.com - Public odds/matches
 * 9. Flashscore - Public live scores
 * 10. Demo Data - Fallback for testing
 */

import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { getEspnLiveMatches } from './espn-provider.js';
import { getNewsHeadlines } from './news-provider-enhanced.js';
import liveScraper from './live-scraper.js';
import { getLiveMatchesFromGoal } from './goal-scraper.js';
import { getLiveMatchesFromFlashscore, getLiveMatchesByLeagueFromFlashscore } from './flashscore-scraper.js';
import { ProviderHealth } from '../utils/provider-health.js';
import StatPalService from './statpal-service.js';

const logger = new Logger('SportsAggregator');

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
    this.statpal = new StatPalService(redis); // Initialize StatPal service
    this.providerHealth = new ProviderHealth(redis);
    // API-Sports adaptive strategy (will pick the first working strategy)
    this._apiSportsStrategy = null;
    this._apiSportsStrategies = [
      {
        name: 'rapidapi',
        base: 'https://api-football-v3.p.rapidapi.com',
        headers: () => ({
          'x-rapidapi-key': CONFIG.API_FOOTBALL.KEY,
          'x-rapidapi-host': 'api-football-v3.p.rapidapi.com'
        })
      },
      {
        name: 'apisports-direct',
        base: 'https://v3.football.api-sports.io',
        headers: () => ({
          'x-apisports-key': CONFIG.API_FOOTBALL.KEY
        })
      }
    ];
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
    this.providerHealth = new ProviderHealth(redis || null);
  }

  // Check if a provider is enabled: checks CONFIG.PROVIDERS then optional Redis override
  async _isProviderEnabled(name) {
    try {
      const cfg = (CONFIG.PROVIDERS && CONFIG.PROVIDERS[name]) || null;
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

      // Try API-Sports first
      if (CONFIG.API_FOOTBALL.KEY) {
        if (await this.providerHealth.isDisabled('api-sports')) {
          logger.info('Skipping API-Sports: provider marked disabled by health helper');
        } else {
        try {
          leagues = await this._getLeaguesFromApiSports(region);
          if (leagues.length > 0) {
            this._setCached(cacheKey, leagues);
            return leagues;
          }
        } catch (e) {
          logger.warn('API-Sports league fetch failed', e.message);
          try { await this.providerHealth.markFailure('api-sports', e.status || e.statusCode || e.code || 0, e.message); } catch (e2) {}
        }
        }
      }

      // Fallback to Football-Data
      if (CONFIG.FOOTBALLDATA.KEY) {
        try {
          leagues = await this._getLeaguesFromFootballData(region);
          if (leagues.length > 0) {
            this._setCached(cacheKey, leagues);
            return leagues;
          }
        } catch (e) {
          logger.warn('Football-Data league fetch failed', e.message);
        }
      }

      // Return popular leagues if no API succeeds
      return Object.values(LEAGUE_MAPPINGS).slice(0, 6);
    } catch (err) {
      logger.error('getLeagues failed', err);
      return Object.values(LEAGUE_MAPPINGS);
    }
  }

  /**
   * Get live matches for a league - PRIMARY SOURCE: StatPal ONLY
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

      let matches = [];

      // ONLY SOURCE: StatPal (All Sports Data) - PRIMARY AND ONLY COMPREHENSIVE SOURCE 🌟
      if (!CONFIG.STATPAL.KEY) {
        logger.error('❌ StatPal API Key (STATPAL_API) not configured. Set environment variable STATPAL_API');
        return [];
      }

      if (await this.providerHealth.isDisabled('statpal-live')) {
        logger.warn('⚠️  StatPal provider currently disabled by health helper');
        return [];
      }

      try {
        logger.debug(`📡 Fetching live matches from StatPal for league ${leagueId}`);
        const statpalData = await this.statpal.getLiveScores('soccer', 'v1');
        
        if (statpalData && (Array.isArray(statpalData) ? statpalData.length > 0 : Object.keys(statpalData).length > 0)) {
          matches = Array.isArray(statpalData) ? statpalData : (statpalData.data || statpalData.matches || []);
          
          if (matches.length > 0) {
            logger.info(`✅ StatPal: Found ${matches.length} live matches (soccer)`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('statpal', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'statpal');
          } else {
            logger.warn('⚠️  StatPal returned empty match list');
            await this._recordProviderHealth('statpal', false, 'No matches available');
            return [];
          }
        } else {
          logger.warn('⚠️  StatPal returned no data');
          await this._recordProviderHealth('statpal', false, 'No data returned');
          return [];
        }
      } catch (e) {
        logger.error(`❌ StatPal live matches error: ${e.message}`);
        await this._recordProviderHealth('statpal', false, e.message);
        try { 
          await this.providerHealth.markFailure('statpal-live', e.statusCode || e.status || 500, e.message); 
        } catch(e2) {}
        return [];
      }

      // Priority 1: API-Sports (API-Football) - Primary source (PROVEN WORKING ✅)
      if (CONFIG.API_FOOTBALL.KEY) {
        try {
          matches = await this._getLiveFromApiSports(leagueId);
          if (matches.length > 0) {
            logger.info(`✅ API-Sports: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('api-sports', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'api-sports');
          }
        } catch (e) {
          logger.warn('API-Sports live matches failed', e.message);
          await this._recordProviderHealth('api-sports', false, e.message);
        }
      }

      // Priority 2: Football-Data.org - Secondary source (needs proper auth headers)
      if (CONFIG.FOOTBALLDATA.KEY) {
        if (await this.providerHealth.isDisabled('football-data')) {
          logger.info('Skipping Football-Data: provider marked disabled by health helper');
        } else {
        try {
          matches = await this._getLiveFromFootballData(leagueId);
          if (matches.length > 0) {
            logger.info(`✅ Football-Data: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('football-data', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'football-data');
          }
        } catch (e) {
          logger.warn('Football-Data live matches failed', e.message);
          await this._recordProviderHealth('football-data', false, e.message);
          try { await this.providerHealth.markFailure('football-data', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }

      // Priority 3: SportsData.io (HTTP 404 errors - needs endpoint verification)
      if (CONFIG.SPORTSDATA.KEY) {
        if (await this.providerHealth.isDisabled('sportsdata')) {
          logger.info('Skipping SportsData.io: provider marked disabled by health helper');
        } else {
        try {
          matches = await this._getLiveFromSportsData();
          if (matches.length > 0) {
            logger.info(`✅ SportsData.io: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('sportsdata', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'sportsdata');
          }
        } catch (e) {
          logger.warn('SportsData.io live matches failed', e.message);
          await this._recordProviderHealth('sportsdata', false, e.message);
          try { await this.providerHealth.markFailure('sportsdata', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }

      // Priority 4: SportsMonks (certificate hostname mismatch - needs TLS config)
      if (CONFIG.SPORTSMONKS.KEY) {
        if (await this.providerHealth.isDisabled('sportsmonks')) {
          logger.info('Skipping SportsMonks: provider marked disabled by health helper');
        } else {
        try {
          matches = await this._getLiveFromSportsMonks();
          if (matches.length > 0) {
            logger.info(`✅ SportsMonks: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('sportsmonks', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'sportsmonks');
          }
        } catch (e) {
          logger.warn('SportsMonks live matches failed', e.message);
          await this._recordProviderHealth('sportsmonks', false, e.message);
          try { await this.providerHealth.markFailure('sportsmonks', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }

      // Priority 5: SofaScore - Real-time data
      if (CONFIG.SOFASCORE.KEY) {
        if (await this.providerHealth.isDisabled('sofascore')) {
          logger.info('Skipping SofaScore: provider marked disabled by health helper');
        } else {
        try {
          matches = await this._getLiveFromSofaScore();
          if (matches.length > 0) {
            logger.info(`✅ SofaScore: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('sofascore', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'sofascore');
          }
        } catch (e) {
          logger.warn('SofaScore live matches failed', e.message);
          await this._recordProviderHealth('sofascore', false, e.message);
          try { await this.providerHealth.markFailure('sofascore', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }

      // Priority 6: AllSports API
      if (await this._isProviderEnabled('ALLSPORTS') && CONFIG.ALLSPORTS.KEY) {
        if (await this.providerHealth.isDisabled('allsports')) {
          logger.info('Skipping AllSports: provider marked disabled by health helper');
        } else {
        try {
          matches = await this._getLiveFromAllSports();
          if (matches.length > 0) {
            logger.info(`✅ AllSports: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            await this._recordProviderHealth('allsports', true, `Found ${matches.length} live matches`);
            return this._formatMatches(matches, 'allsports');
          }
        } catch (e) {
          logger.warn('AllSports live matches failed', e.message);
          await this._recordProviderHealth('allsports', false, e.message);
          try { await this.providerHealth.markFailure('allsports', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }

      // Priority 7: ScoreBat free highlights/feed (no API key required)
      if (await this._isProviderEnabled('SCOREBAT') && this.scorebat) {
        if (await this.providerHealth.isDisabled('scorebat')) {
          logger.info('Skipping ScoreBat: provider marked disabled by health helper');
        } else {
        try {
          let sb = null;
          try {
            sb = await this.scorebat.freeFeed();
          } catch (err) {
            // freeFeed may be region-limited; try featured as fallback
            sb = await this.scorebat.featured().catch(() => null);
          }
          const items = (sb && (sb.response || sb)) || sb;
            if (items && items.length > 0) {
            // map ScoreBat entries to minimal match objects
            const mapped = items.slice(0, 10).map(it => {
              const title = it.title || it.match || it.videotitle || '';
              const teams = title.split(' - ').map(s => s.trim());
              const home = teams[0] || null;
              const away = teams[1] || null;
              return {
                provider: 'scorebat',
                title,
                home,
                away,
                time: it.date || it.matchTime || null,
                url: (it.videos && it.videos[0] && it.videos[0].embed) || it.url || null,
                raw: it
              };
            });
            // attempt to enrich with live stats where possible
            let enriched = mapped;
            try {
              // telemetry: note attempt
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:attempts');
              enriched = await liveScraper.enrichMatchesWithLiveStats(mapped, { sport: 'football' });
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:success');
            } catch (e) {
              logger.warn('ScoreBat enrichment failed', e?.message || e);
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:fail');
            }
            logger.info(`✅ ScoreBat: Found ${enriched.length} feed entries`);
            this._setCached(cacheKey, enriched);
            await this._recordProviderHealth('scorebat', true, `Found ${enriched.length} feed entries`);
            return this._formatMatches(enriched, 'scorebat');
            }
        } catch (e) {
          logger.warn('ScoreBat feed failed', e.message);
          await this._recordProviderHealth('scorebat', false, e.message);
          try { await this.providerHealth.markFailure('scorebat', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
        }
        }
      }
      
      // Priority 8: OpenLigaDB (public) for supported leagues
      if (await this._isProviderEnabled('OPENLIGADB') && this.openLiga) {
        try {
          const league = LEAGUE_MAPPINGS[String(leagueId)];
          if (league && league.country && league.country.toLowerCase().includes('germany')) {
            const year = new Date().getFullYear();
            const recent = await this.openLiga.getRecentMatches(league.code || league.name, year).catch(() => []);
            if (recent && recent.length > 0) {
              // Normalize OpenLiga match objects to canonical analyzer schema
              const normalized = recent.slice(0, 10).map(m => this._normalizeOpenLigaMatch(m));
              this._setCached(cacheKey, normalized);
              await this._recordProviderHealth('openligadb', true, `Found ${normalized.length} recent matches`);
              return this._formatMatches(normalized, 'openligadb');
            }
          }
        } catch (e) {
          logger.warn('OpenLigaDB live fetch failed', e.message);
          await this._recordProviderHealth('openligadb', false, e.message);
        }
      }

      // Priority 9: ESPN (Public API, no registration required)
      if (await this._isProviderEnabled('ESPN')) {
        try {
          const espnMatches = await getEspnLiveMatches({ sport: 'football' });
          if (espnMatches && espnMatches.length > 0) {
            // try to enrich ESPN matches with detailed stats
            let enriched = espnMatches;
            try {
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:attempts');
              enriched = await liveScraper.enrichMatchesWithLiveStats(espnMatches, { sport: 'football' });
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:success');
            } catch (e) {
              logger.warn('ESPN enrichment failed', e?.message || e);
              if (this.redis) await this.redis.incr('betrix:telemetry:live_scraper:fail');
            }
            logger.info(`✅ ESPN: Found ${enriched.length} live matches`);
            this._setCached(cacheKey, enriched);
            await this._recordProviderHealth('espn', true, `Found ${enriched.length} live matches`);
            return this._formatMatches(enriched, 'espn');
          }
        } catch (e) {
          logger.warn('ESPN live matches failed', e.message);
          await this._recordProviderHealth('espn', false, e.message);
        }
      }

      // Priority 10: Goal.com public scraper (no API key required)
      if (await this._isProviderEnabled('GOAL')) {
        if (await this.providerHealth.isDisabled('goal')) {
          logger.info('Skipping Goal.com scraper: provider marked disabled by health helper');
        } else {
          try {
            const leagueMap = { '39': 'premier-league', '140': 'la-liga', '135': 'serie-a', '78': 'bundesliga', '61': 'ligue-1' };
            const leaguePath = leagueMap[String(leagueId)] || 'premier-league';
            const goalMatches = await getLiveMatchesFromGoal(leaguePath);
            if (goalMatches && goalMatches.length > 0) {
              logger.info(`✅ Goal.com: Found ${goalMatches.length} matches`);
              this._setCached(cacheKey, goalMatches);
              await this._recordProviderHealth('goal', true, `Found ${goalMatches.length} matches`);
              return this._formatMatches(goalMatches, 'goal');
            }
          } catch (e) {
            logger.warn('Goal.com scraper failed', e.message);
            await this._recordProviderHealth('goal', false, e.message);
            try { await this.providerHealth.markFailure('goal', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
          }
        }
      }

      // Priority 11: Flashscore public scraper (no API key required)
      if (await this._isProviderEnabled('FLASHSCORE')) {
        if (await this.providerHealth.isDisabled('flashscore')) {
          logger.info('Skipping Flashscore scraper: provider marked disabled by health helper');
        } else {
          try {
            const flashscoreLeagueMap = { '39': '17', '140': '87', '135': '106', '78': '34', '61': '53' };
            const flashLeagueId = flashscoreLeagueMap[String(leagueId)] || '17';
            const flashMatches = await getLiveMatchesByLeagueFromFlashscore(flashLeagueId);
            if (flashMatches && flashMatches.length > 0) {
              logger.info(`✅ Flashscore: Found ${flashMatches.length} matches`);
              this._setCached(cacheKey, flashMatches);
              await this._recordProviderHealth('flashscore', true, `Found ${flashMatches.length} matches`);
              return this._formatMatches(flashMatches, 'flashscore');
            }
          } catch (e) {
            logger.warn('Flashscore scraper failed', e.message);
            await this._recordProviderHealth('flashscore', false, e.message);
            try { await this.providerHealth.markFailure('flashscore', e.status || e.statusCode || e.code || 0, e.message); } catch(e2) {}
          }
        }
      }

      // No real data available - return empty instead of fake data
      logger.warn('All live APIs failed, returning empty match list');
      return [];
    } catch (err) {
      logger.error('getLiveMatches failed', err);
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
   * Get match odds
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

      let odds = [];

      // Priority 1: API-Sports (API-Football)
      if (CONFIG.API_FOOTBALL.KEY) {
        try {
          odds = await this._getOddsFromApiSports(leagueId);
          if (odds.length > 0) {
            logger.info(`✅ API-Sports: Found ${odds.length} odds`);
            this._setCached(cacheKey, odds);
            return odds;
          }
        } catch (e) {
          logger.warn('API-Sports odds fetch failed', e.message);
        }
      }

      // Priority 2: SofaScore
      if (CONFIG.SOFASCORE.KEY) {
        try {
          odds = await this._getOddsFromSofaScore();
          if (odds.length > 0) {
            logger.info(`✅ SofaScore: Found ${odds.length} odds`);
            this._setCached(cacheKey, odds);
            return odds;
          }
        } catch (e) {
          logger.warn('SofaScore odds failed', e.message);
        }
      }

      // Priority 3: AllSports API
      if (CONFIG.ALLSPORTS.KEY) {
        try {
          odds = await this._getOddsFromAllSports();
          if (odds.length > 0) {
            logger.info(`✅ AllSports: Found ${odds.length} odds`);
            this._setCached(cacheKey, odds);
            return odds;
          }
        } catch (e) {
          logger.warn('AllSports odds failed', e.message);
        }
      }

      // Priority 4: SportsData.io
      if (CONFIG.SPORTSDATA.KEY) {
        try {
          odds = await this._getOddsFromSportsData();
          if (odds.length > 0) {
            logger.info(`✅ SportsData.io: Found ${odds.length} odds`);
            this._setCached(cacheKey, odds);
            return odds;
          }
        } catch (e) {
          logger.warn('SportsData.io odds failed', e.message);
        }
      }

      // Priority 5: SportsMonks
      if (CONFIG.SPORTSMONKS.KEY) {
        try {
          odds = await this._getOddsFromSportsMonks();
          if (odds.length > 0) {
            logger.info(`✅ SportsMonks: Found ${odds.length} odds`);
            this._setCached(cacheKey, odds);
            return odds;
          }
        } catch (e) {
          logger.warn('SportsMonks odds failed', e.message);
        }
      }

      // Priority 6: Goal.com public odds scraper
      if (await this._isProviderEnabled('GOAL')) {
        try {
          const { getGoalOdds } = await import('./goal-scraper.js');
          const goalOdds = await getGoalOdds();
          if (goalOdds && goalOdds.length > 0) {
            logger.info(`✅ Goal.com: Found ${goalOdds.length} odds`);
            this._setCached(cacheKey, goalOdds);
            return goalOdds;
          }
        } catch (e) {
          logger.warn('Goal.com odds scraper failed', e.message);
        }
      }

      // No real data available - return empty instead of fake data
      logger.warn('All odds APIs failed, returning empty odds list');
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

      let standings = [];

      // Priority 1: API-Sports
      if (CONFIG.API_FOOTBALL.KEY) {
        try {
          standings = await this._getStandingsFromApiSports(leagueId, season);
          if (standings.length > 0) {
            logger.info(`✅ API-Sports: Found standings for ${standings.length} teams`);
            this._setCached(cacheKey, standings);
            return standings;
          }
        } catch (e) {
          logger.warn('API-Sports standings failed', e.message);
        }
      }

      // Priority 2: Football-Data
      if (CONFIG.FOOTBALLDATA.KEY) {
        try {
          standings = await this._getStandingsFromFootballData(leagueId, season);
          if (standings.length > 0) {
            logger.info(`✅ Football-Data: Found standings for ${standings.length} teams`);
            this._setCached(cacheKey, standings);
            return standings;
          }
        } catch (e) {
          logger.warn('Football-Data standings failed', e.message);
        }
      }

      // Priority 3: SportsData.io
      if (CONFIG.SPORTSDATA.KEY) {
        try {
          standings = await this._getStandingsFromSportsData(leagueId);
          if (standings.length > 0) {
            logger.info(`✅ SportsData.io: Found standings for ${standings.length} teams`);
            this._setCached(cacheKey, standings);
            return standings;
          }
        } catch (e) {
          logger.warn('SportsData.io standings failed', e.message);
        }
      }

      // Priority 4: SportsMonks
      if (CONFIG.SPORTSMONKS.KEY) {
        try {
          standings = await this._getStandingsFromSportsMonks(leagueId);
          if (standings.length > 0) {
            logger.info(`✅ SportsMonks: Found standings for ${standings.length} teams`);
            this._setCached(cacheKey, standings);
            return standings;
          }
        } catch (e) {
          logger.warn('SportsMonks standings failed', e.message);
        }
      }

      // No real data available - return empty instead of fake data
      logger.warn('All standings APIs failed, returning empty standings list');
      return [];
    } catch (err) {
      logger.error('getStandings failed', err);
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

  async _getLiveFromSportsMonks() {
    if (!CONFIG.SPORTSMONKS.KEY) return [];
    try {
      const url = `${CONFIG.SPORTSMONKS.BASE}/football/fixtures?include=teams,league,scores&filters=status_code:1&api_token=${CONFIG.SPORTSMONKS.KEY}`;
      const response = await this._fetchWithRetry(url);

      return (response.data || []).slice(0, 10);
    } catch (e) {
      logger.warn('SportsMonks live matches failed', e.message);
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
        return {
          id: m.id || null,
          home: safe(m.homeTeam && m.homeTeam.name, 'Home'),
          away: safe(m.awayTeam && m.awayTeam.name, 'Away'),
          homeScore: (m.score && m.score.fullTime && (typeof m.score.fullTime.home === 'number' ? m.score.fullTime.home : null)) || null,
          awayScore: (m.score && m.score.fullTime && (typeof m.score.fullTime.away === 'number' ? m.score.fullTime.away : null)) || null,
          status: safe(m.status, 'UNKNOWN'),
          time: (m.status === 'LIVE' && m.minute) ? `${m.minute}'` : safe(m.utcDate, 'TBA'),
          venue: safe(m.venue, 'TBA'),
          provider: 'football-data',
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

  // ==================== StatPal (All Sports Data API) ====================

  /**
   * Get live matches from StatPal for any sport
   * @param {string} sport - Sport name (soccer, nfl, nba, nhl, mlb, cricket, etc.)
   * @param {string} version - API version (v1 or v2)
   */
  async _getLiveFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getLiveScores(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} live error:`, e.message);
      return [];
    }
  }

  /**
   * Get odds from StatPal for any sport
   * @param {string} sport - Sport name
   * @param {string} version - API version
   */
  async _getOddsFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getLiveOdds(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} odds error:`, e.message);
      return [];
    }
  }

  /**
   * Get fixtures from StatPal for any sport
   * @param {string} sport - Sport name
   * @param {string} version - API version
   */
  async _getFixturesFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getFixtures(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} fixtures error:`, e.message);
      return [];
    }
  }

  /**
   * Get standings from StatPal for any sport
   * @param {string} sport - Sport name
   * @param {string} league - League ID (optional)
   * @param {string} version - API version
   */
  async _getStandingsFromStatPal(sport = 'soccer', league = null, version = 'v1') {
    try {
      const data = await this.statpal.getStandings(sport, league, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} standings error:`, e.message);
      return [];
    }
  }

  /**
   * Get player statistics from StatPal
   * @param {string} sport - Sport name
   * @param {string} playerId - Player ID
   * @param {string} version - API version
   */
  async _getPlayerStatsFromStatPal(sport = 'soccer', playerId, version = 'v1') {
    try {
      const data = await this.statpal.getPlayerStats(sport, playerId, version);
      if (!data) return null;
      return data;
    } catch (e) {
      logger.error(`StatPal player ${playerId} stats error:`, e.message);
      return null;
    }
  }

  /**
   * Get team statistics from StatPal
   * @param {string} sport - Sport name
   * @param {string} teamId - Team ID
   * @param {string} version - API version
   */
  async _getTeamStatsFromStatPal(sport = 'soccer', teamId, version = 'v1') {
    try {
      const data = await this.statpal.getTeamStats(sport, teamId, version);
      if (!data) return null;
      return data;
    } catch (e) {
      logger.error(`StatPal team ${teamId} stats error:`, e.message);
      return null;
    }
  }

  /**
   * Get injury reports from StatPal
   * @param {string} sport - Sport name
   * @param {string} version - API version
   */
  async _getInjuriesFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getInjuries(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} injuries error:`, e.message);
      return [];
    }
  }

  /**
   * Get results (past matches) from StatPal
   * @param {string} sport - Sport name
   * @param {string} version - API version
   */
  async _getResultsFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getResults(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} results error:`, e.message);
      return [];
    }
  }

  /**
   * Get scoring leaders from StatPal
   * @param {string} sport - Sport name
   * @param {string} version - API version
   */
  async _getScoringLeadersFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      const data = await this.statpal.getScoringLeaders(sport, version);
      if (!data) return [];
      return Array.isArray(data) ? data : (data.data || []);
    } catch (e) {
      logger.error(`StatPal ${sport} scoring leaders error:`, e.message);
      return [];
    }
  }
}

export default SportsAggregator;
