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
    this.providerHealth = new ProviderHealth(this.redis || null);
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

      // Prefer StatPal as the single authoritative source for leagues
      if (CONFIG.STATPAL && CONFIG.STATPAL.KEY) {
        try {
          logger.debug('📡 Fetching leagues via StatPal (derived from fixtures)');
          const fixtures = await this.statpal.getFixtures(sport === 'football' ? 'soccer' : sport, CONFIG.STATPAL.V1 || 'v1');
          let leaguesFromStatpal = [];
          if (fixtures && Array.isArray(fixtures)) {
            const map = new Map();
            fixtures.forEach(f => {
              const league = f.league || f.competition || f.tournament || null;
              if (league) {
                const id = String(league.id || league.league_id || league.name || JSON.stringify(league));
                if (!map.has(id)) {
                  map.set(id, {
                    id: id,
                    name: league.name || league.title || league.code || 'Unknown',
                    country: league.country || league.area || ''
                  });
                }
              }
            });
            leaguesFromStatpal = Array.from(map.values());
          } else if (fixtures && fixtures.data && Array.isArray(fixtures.data)) {
            // some StatPal responses wrap data under `data`
            const map = new Map();
            fixtures.data.forEach(f => {
              const league = f.league || f.competition || null;
              if (league) {
                const id = String(league.id || league.name || JSON.stringify(league));
                if (!map.has(id)) map.set(id, { id, name: league.name || 'Unknown', country: league.country || '' });
              }
            });
            leaguesFromStatpal = Array.from(map.values());
          }

          if (leaguesFromStatpal.length > 0) {
            this._setCached(cacheKey, leaguesFromStatpal);
            return leaguesFromStatpal;
          }
        } catch (e) {
          logger.warn('StatPal league derivation failed', e?.message || String(e));
        }
      }

      // Fall back to built-in popular leagues if StatPal didn't return data
      return Object.values(LEAGUE_MAPPINGS).slice(0, 6);
    } catch (err) {
      logger.error('getLeagues failed', err);
      return Object.values(LEAGUE_MAPPINGS);
    }
  }

  /**
   * Get live matches for a league - STATPAL ONLY
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

      if (!CONFIG.STATPAL.KEY) {
        logger.error('❌ StatPal API Key (STATPAL_API env var) not configured');
        return [];
      }

      try {
        logger.debug(`📡 Fetching live matches from StatPal for league ${leagueId}`);
        const statpalData = await this.statpal.getLiveScores('soccer', 'v1');
        
        if (!statpalData) {
          logger.warn('⚠️  StatPal returned null data');
          return [];
        }
        
        // Normalize StatPal response shapes. StatPal responses vary between
        // - an array of matches
        // - { data: [...] }
        // - { data: { matches: [...] } }
        // - { results: [...] } or { matches: [...] }
        // - nested objects where the first encountered array is the payload
        const extractMatches = (obj) => {
          if (!obj) return [];
          if (Array.isArray(obj)) return obj;
          // Common top-level array holders
          if (Array.isArray(obj.data)) return obj.data;
          if (Array.isArray(obj.matches)) return obj.matches;
          if (Array.isArray(obj.results)) return obj.results;
          // data as object containing arrays
          if (obj.data && typeof obj.data === 'object') {
            if (Array.isArray(obj.data.matches)) return obj.data.matches;
            if (Array.isArray(obj.data.results)) return obj.data.results;
            // find first array value inside data
            for (const v of Object.values(obj.data)) {
              if (Array.isArray(v)) return v;
            }
          }
          // fallback: check any top-level property that is an array
          for (const v of Object.values(obj)) {
            if (Array.isArray(v)) return v;
          }
          // maybe the payload is an object keyed by league ids -> arrays
          const arrays = [];
          for (const v of Object.values(obj)) {
            if (v && typeof v === 'object') {
              for (const sub of Object.values(v)) {
                if (Array.isArray(sub)) arrays.push(...sub);
              }
            }
          }
          if (arrays.length > 0) return arrays;
          return [];
        };

        let matches = extractMatches(statpalData);

        // StatPal sometimes returns an array of competitions where each element
        // contains a `match` array with actual match objects. Detect and flatten
        // that shape so downstream normalization sees raw match objects.
        if (Array.isArray(matches) && matches.length > 0) {
          const first = matches[0];
          // If first item looks like a competition wrapper with a `match` array
          if (first && typeof first === 'object' && Array.isArray(first.match)) {
            matches = matches.flatMap(c => Array.isArray(c.match) ? c.match : []);
          }
          // Some payloads have the matches under a nested array name like `matches` or `data.match`
          if (matches.length === 0 && Array.isArray(statpalData)) {
            // try to find any nested arrays named 'match' or 'matches' and flatten
            const flattened = [];
            for (const item of statpalData) {
              if (item && typeof item === 'object') {
                if (Array.isArray(item.match)) flattened.push(...item.match);
                else if (Array.isArray(item.matches)) flattened.push(...item.matches);
                else if (item.data && Array.isArray(item.data.match)) flattened.push(...item.data.match);
              }
            }
            if (flattened.length > 0) matches = flattened;
          }
        }
        
        if (matches.length > 0) {
          // Validate that matches have team data
          const validMatches = matches.filter(m => {
            // Check if match has home/away or similar fields
            const hasTeams = m && (
              (m.home && m.away) ||
              (m.teams && ((m.teams.home || m.teams[0]) && (m.teams.away || m.teams[1]))) ||
              (m.homeTeam && m.awayTeam) ||
              (m.main_team && m.visitor_team) ||
              (m.participants && m.participants.length >= 2) ||
              (m.title && m.title.includes(' vs '))
            );
            return hasTeams;
          });
          
          if (validMatches.length === 0) {
            logger.warn('⚠️  StatPal returned matches but none have valid team data. Sample:', 
              matches.slice(0, 1).map(m => Object.keys(m)));
            // Try formatting anyway - it'll use fallbacks
            const formatted = this._formatMatches(matches, 'statpal');
            this._setCached(cacheKey, formatted);
            return formatted;
          }
          
          logger.info(`✅ StatPal: Found ${matches.length} live matches (soccer)`);
          this._setCached(cacheKey, matches);
          await this._recordProviderHealth('statpal', true, `Found ${matches.length} live matches`);
          return this._formatMatches(matches, 'statpal');
        } else {
          logger.warn('⚠️  StatPal returned empty match list or unrecognized payload shape');
          // Debug: log raw payload structure for inspection if DEBUG enabled
          if (process.env.DEBUG_STATPAL_PAYLOADS === 'true') {
            logger.info('🔍 Raw StatPal payload (first 1000 chars):', 
              JSON.stringify(statpalData).substring(0, 1000));
          }
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
    } catch (err) {
      logger.error('getLiveMatches failed:', err.message);
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

      // Use StatPal exclusively for odds
      if (!CONFIG.STATPAL || !CONFIG.STATPAL.KEY) {
        logger.error('❌ StatPal API Key (STATPAL_API env var) not configured - odds unavailable');
        return [];
      }

      if (await this.providerHealth.isDisabled('statpal-odds')) {
        logger.warn('⚠️  StatPal odds provider currently disabled');
        return [];
      }

      try {
        const oddsData = await this._getOddsFromStatPal('soccer', CONFIG.STATPAL.V1 || 'v1');
        if (oddsData && oddsData.length > 0) {
          const formatted = this._formatStatPalOdds(oddsData, 'soccer');
          logger.info(`✅ StatPal: Found ${formatted.length} odds entries (normalized)`);
          this._setCached(cacheKey, formatted);
          await this._recordProviderHealth('statpal', true, `Found ${formatted.length} odds`);
          return formatted;
        }
        logger.warn('⚠️  StatPal returned empty odds list');
        return [];
      } catch (e) {
        logger.warn('StatPal odds fetch failed', e?.message || String(e));
        try { await this.providerHealth.markFailure('statpal-odds', e.status || e.statusCode || 500, e.message); } catch (e2) {}
        return [];
      }
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

      // Use StatPal as single source for standings
      if (!CONFIG.STATPAL || !CONFIG.STATPAL.KEY) {
        logger.error('❌ StatPal API Key (STATPAL_API env var) not configured - standings unavailable');
        return [];
      }

      if (await this.providerHealth.isDisabled('statpal-standings')) {
        logger.warn('⚠️  StatPal standings provider currently disabled');
        return [];
      }

      try {
        const sd = await this._getStandingsFromStatPal('soccer', leagueId, CONFIG.STATPAL.V1 || 'v1');
        if (sd && sd.length > 0) {
          logger.info(`✅ StatPal: Found standings for ${sd.length} entries`);
          this._setCached(cacheKey, sd);
          return sd;
        }
        logger.warn('⚠️  StatPal returned empty standings');
        return [];
      } catch (e) {
        logger.warn('StatPal standings fetch failed', e?.message || String(e));
        try { await this.providerHealth.markFailure('statpal-standings', e.status || e.statusCode || 500, e.message); } catch (e2) {}
        return [];
      }
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

  // ==================== StatPal (All Sports Data API) ====================

  /**
   * Get live matches from StatPal for any sport
   * @param {string} sport - Sport name (soccer, nfl, nba, nhl, mlb, cricket, etc.)
   * @param {string} version - API version (v1 or v2)
   */
  async _getLiveFromStatPal(sport = 'soccer', version = 'v1') {
    try {
      // Try to get cached data from StatPal initialization first
      const cacheKey = `betrix:statpal:${sport}:livescores`;
      let cachedData = null;
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            cachedData = JSON.parse(cached);
            logger.debug(`📦 Got ${sport} live scores from cache (${cachedData.count} items)`);
            return cachedData.data || [];
          }
        } catch (e) {
          logger.debug(`Cache lookup for ${sport} failed`, e?.message);
        }
      }

      // Fallback to real-time fetch
      const data = await this.statpal.getLiveScores(sport, version);
      if (!data) return [];

      // Normalize and flatten common StatPal shapes so callers always get
      // an array of match objects with `home`/`away` fields.
      let items = Array.isArray(data) ? data : (data.data || []);

      // If items look like competition wrappers with a `match` array, flatten
      if (Array.isArray(items) && items.length > 0 && items[0] && typeof items[0] === 'object' && Array.isArray(items[0].match)) {
        items = items.flatMap(c => Array.isArray(c.match) ? c.match : []);
      }

      // If still wrapped (e.g., data -> competitions -> match), try deeper extraction
      if ((!Array.isArray(items) || items.length === 0) && data && typeof data === 'object') {
        // check data.matches or nested arrays
        if (Array.isArray(data.matches)) items = data.matches;
        else if (data.data && Array.isArray(data.data.matches)) items = data.data.matches;
      }

      // Finally, attempt to format fixtures into canonical match shape
      try {
        const formatted = this._formatStatPalFixtures(items, sport);
        return formatted;
      } catch (e) {
        // fallback: return raw items
        return items;
      }
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
   * Format StatPal fixtures into the canonical match shape used by the aggregator
   */
  _formatStatPalFixtures(fixtures, sport = 'soccer') {
    if (!fixtures || fixtures.length === 0) return [];
    try {
      return fixtures.map(f => {
        const match = {
          id: f.id || f.match_id || f.fixture_id || null,
          home: f.home || f.home_team || f.localteam || (f.teams && f.teams.home) || (f.teams && f.teams.home && f.teams.home.name) || f.team_home || null,
          away: f.away || f.away_team || f.visitorteam || (f.teams && f.teams.away) || (f.teams && f.teams.away && f.teams.away.name) || f.team_away || null,
          homeScore: f.homeScore || f.home_score || (f.score && f.score.home) || null,
          awayScore: f.awayScore || f.away_score || (f.score && f.score.away) || null,
          status: f.status || f.match_status || (f.state && f.state.name) || 'SCHEDULED',
          time: f.time || f.match_time || f.start_time || f.utc || f.date || null,
          venue: f.venue || (f.location && f.location.name) || null,
          provider: 'statpal',
          raw: f
        };

        return this._formatMatches([match], 'statpal')[0];
      });
    } catch (e) {
      logger.warn('Failed to normalize StatPal fixtures', e?.message || String(e));
      return fixtures;
    }
  }

  /**
   * Normalize StatPal odds payload into canonical bookmaker/market/outcome shape
   */
  _formatStatPalOdds(oddsRaw, sport = 'soccer') {
    if (!oddsRaw || (Array.isArray(oddsRaw) && oddsRaw.length === 0)) return [];
    try {
      const items = Array.isArray(oddsRaw) ? oddsRaw : (oddsRaw.data || []);
      return items.map(item => {
        // Determine fixture identifier (various shapes)
        const fixtureObj = item.fixture || item.event || item.match || item.game || item;
        const fixtureId = fixtureObj && (fixtureObj.id || fixtureObj.fixture_id || item.match_id || item.id || fixtureObj.match_id || null);

        // Extract bookmakers array from common shapes
        let boks = item.bookmakers || item.bookies || item.odds || item.markets || item.providers || [];
        if (!Array.isArray(boks) && boks && typeof boks === 'object') {
          boks = Object.values(boks);
        }

        const bookmakers = (boks || []).map(b => {
          const marketsRaw = b.markets || b.markets_full || b.odds || b.markets || b.rows || b.markets || b.markets || b.selections || b.bets || [];
          const marketsArr = Array.isArray(marketsRaw) ? marketsRaw : (marketsRaw && typeof marketsRaw === 'object' ? Object.values(marketsRaw) : []);
          const markets = (marketsArr || []).map(m => {
            const outcomesRaw = m.outcomes || m.selections || m.prices || m.odds || m.rows || m.options || [];
            const outcomesArr = Array.isArray(outcomesRaw) ? outcomesRaw : (outcomesRaw && typeof outcomesRaw === 'object' ? Object.values(outcomesRaw) : []);
            return {
              key: m.key || m.market || m.name || m.code || m.label || 'unknown',
              label: m.label || m.name || m.key || null,
              outcomes: (outcomesArr || []).map(o => ({
                name: o.name || o.label || o.side || o.selection || o.team || '',
                price: o.price || o.odds || o.decimal || o.price_decimal || null,
                raw: o
              })),
              raw: m
            };
          });

          return {
            title: b.title || b.bookmaker || b.name || b.key || b.provider || 'unknown',
            last_update: b.last_update || b.updated_at || b.ts || b.updated || null,
            markets,
            raw: b
          };
        });

        return {
          fixtureId: fixtureId || null,
          bookmakers,
          provider: 'statpal',
          raw: item
        };
      });
    } catch (e) {
      logger.warn('Failed to normalize StatPal odds', e?.message || String(e));
      return oddsRaw;
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
