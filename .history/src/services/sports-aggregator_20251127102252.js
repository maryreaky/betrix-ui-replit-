/**
 * Sports Data Aggregator
 * Fetches and normalizes data from multiple sports APIs with priority order:
 * 1. API-Sports (API-Football) - Primary source
 * 2. Football-Data.org - Secondary source
 * 3. AllSports API (RapidAPI) - Tertiary source
 * 4. SportsData.io - Additional source
 * 5. SofaScore (RapidAPI) - Real-time data
 * 6. SportsMonks - Comprehensive data
 * 7. Demo Data - Fallback for testing
 */

import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { getEspnLiveMatches } from './espn-provider.js';
import { getNewsHeadlines } from './news-provider.js';

const logger = new Logger('SportsAggregator');

const LEAGUE_MAPPINGS = {
  // Premier League
  '39': { id: 39, name: 'Premier League', country: 'England', code: 'E0' },
  // La Liga
  '140': { id: 140, name: 'La Liga', country: 'Spain', code: 'E1' },
  // Serie A
  '135': { id: 135, name: 'Serie A', country: 'Italy', code: 'E2' },
  // Ligue 1
  '61': { id: 61, name: 'Ligue 1', country: 'France', code: 'E3' },
  // Bundesliga
  '78': { id: 78, name: 'Bundesliga', country: 'Germany', code: 'E4' },
  // Champions League
  '2': { id: 2, name: 'Champions League', country: 'Europe', code: 'C1' },
};

export class SportsAggregator {
  constructor(redis) {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 min cache
    this.redis = redis; // optional Redis instance for diagnostics
    // API-Sports adaptive strategy (will pick the first working strategy)
    this._apiSportsStrategy = null;
    this._apiSportsStrategies = [
      {
        name: 'rapidapi',
        base: CONFIG.API_FOOTBALL.BASE || 'https://api-football-v3.p.rapidapi.com',
        headers: () => ({
          'x-rapidapi-key': CONFIG.API_FOOTBALL.KEY,
          'x-rapidapi-host': 'api-football-v3.p.rapidapi.com'
        })
      },
      {
        name: 'apisports-direct',
        base: process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io',
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
        try {
          leagues = await this._getLeaguesFromApiSports(region);
          if (leagues.length > 0) {
            this._setCached(cacheKey, leagues);
            return leagues;
          }
        } catch (e) {
          logger.warn('API-Sports league fetch failed', e.message);
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

      let matches = [];

      // Priority 1: SportsData.io (prefer when configured)
      if (CONFIG.SPORTSDATA.KEY) {
        try {
          matches = await this._getLiveFromSportsData();
          if (matches.length > 0) {
            logger.info(`✅ SportsData.io: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'sportsdata');
          }
        } catch (e) {
          logger.warn('SportsData.io live matches failed', e.message);
        }
      }

      // Priority 2: SportsMonks
      if (CONFIG.SPORTSMONKS.KEY) {
        try {
          matches = await this._getLiveFromSportsMonks();
          if (matches.length > 0) {
            logger.info(`✅ SportsMonks: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'sportsmonks');
          }
        } catch (e) {
          logger.warn('SportsMonks live matches failed', e.message);
        }
      }

      // Priority 3: API-Sports (API-Football) - Primary source (adaptive headers)
      if (CONFIG.API_FOOTBALL.KEY) {
        try {
          matches = await this._getLiveFromApiSports(leagueId);
          if (matches.length > 0) {
            logger.info(`✅ API-Sports: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'api-sports');
          }
        } catch (e) {
          logger.warn('API-Sports live matches failed', e.message);
        }
      }

      // Priority 4: Football-Data.org - Secondary source
      if (CONFIG.FOOTBALLDATA.KEY) {
        try {
          matches = await this._getLiveFromFootballData(leagueId);
          if (matches.length > 0) {
            logger.info(`✅ Football-Data: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'football-data');
          }
        } catch (e) {
          logger.warn('Football-Data live matches failed', e.message);
        }
      }

      // Priority 5: SofaScore - Real-time data
      if (CONFIG.SOFASCORE.KEY) {
        try {
          matches = await this._getLiveFromSofaScore();
          if (matches.length > 0) {
            logger.info(`✅ SofaScore: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'sofascore');
          }
        } catch (e) {
          logger.warn('SofaScore live matches failed', e.message);
        }
      }

      // Priority 6: AllSports API
      if (CONFIG.ALLSPORTS.KEY) {
        try {
          matches = await this._getLiveFromAllSports();
          if (matches.length > 0) {
            logger.info(`✅ AllSports: Found ${matches.length} live matches`);
            this._setCached(cacheKey, matches);
            return this._formatMatches(matches, 'allsports');
          }
        } catch (e) {
          logger.warn('AllSports live matches failed', e.message);
        }
      }

      // Priority 7: ESPN (Public API, no registration required)
      try {
        const espnMatches = await getEspnLiveMatches({ sport: 'football' });
        if (espnMatches && espnMatches.length > 0) {
          logger.info(`✅ ESPN: Found ${espnMatches.length} live matches`);
          this._setCached(cacheKey, espnMatches);
          return this._formatMatches(espnMatches, 'espn');
        }
      } catch (e) {
        logger.warn('ESPN live matches failed', e.message);
      }

      // Fallback to demo data
      logger.warn('All live APIs failed, using demo data');
      return this._getDemoMatches();
    } catch (err) {
      logger.error('getLiveMatches failed', err);
      return this._getDemoMatches();
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

      // Fallback to demo data
      logger.warn('All odds APIs failed, using demo data');
      return this._getDemoOdds();
    } catch (err) {
      logger.error('getOdds failed', err);
      return this._getDemoOdds();
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

      // Fallback to demo data
      logger.warn('All standings APIs failed, using demo data');
      return this._getDemoStandings();
    } catch (err) {
      logger.error('getStandings failed', err);
      return this._getDemoStandings();
    }
  }

  // ==================== API-Sports ====================

  /**
   * Adaptive fetch for API-Sports (API-Football).
   * Tries configured strategies (RapidAPI headers, direct apisports header) and
   * caches the successful strategy for subsequent calls.
   */
  async _fetchApiSports(path, options = {}, retries = 2) {
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
    const path = `/fixtures?league=${leagueId}&status=LIVE`;
    const response = await this._fetchApiSports(path);

    return (response.response || []).slice(0, 10);
  }

  async _getOddsFromApiSports(leagueId) {
    const path = `/odds?league=${leagueId}&status=LIVE`;
    const response = await this._fetchApiSports(path);

    return (response.response || []).slice(0, 10).map(m => ({
      fixture: m.fixture,
      bookmakers: m.bookmakers || []
    }));
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
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions/${leagueId}/matches?status=LIVE`;
    const response = await this._fetchWithRetry(url, {
      headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
    });

    return (response.matches || []).slice(0, 10);
  }

  async _getStandingsFromFootballData(leagueId, season) {
    const url = `${CONFIG.FOOTBALLDATA.BASE}/competitions/${leagueId}/standings`;
    const response = await this._fetchWithRetry(url, {
      headers: { 'X-Auth-Token': CONFIG.FOOTBALLDATA.KEY }
    });

    return (response.standings || [{ table: [] }])[0].table || [];
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

  async _fetchWithRetry(url, options, retries = 2) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          return await response.json();
        }
        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 1000)); // Rate limited, retry
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  _setCached(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  _formatMatches(matches, source) {
    return matches.map(m => {
      if (source === 'api-sports') {
        return {
          id: m.fixture.id,
          home: m.teams.home.name,
          away: m.teams.away.name,
          homeScore: m.goals.home,
          awayScore: m.goals.away,
          status: m.fixture.status,
          time: m.fixture.status === 'LIVE' ? `${m.fixture.elapsed}'` : m.fixture.date,
          venue: m.fixture.venue?.name || 'TBA'
        };
      }
      if (source === 'football-data') {
        return {
          id: m.id,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          homeScore: m.score.fullTime.home,
          awayScore: m.score.fullTime.away,
          status: m.status,
          time: m.status === 'LIVE' ? `${m.minute}'` : m.utcDate,
          venue: m.venue || 'TBA'
        };
      }
      return m;
    });
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
}

export default SportsAggregator;
