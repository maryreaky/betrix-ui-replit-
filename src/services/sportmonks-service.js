/**
 * SportMonks Service
 * Lightweight wrapper around the SportsMonks Football API used as a fallback
 * provider for live scores, fixtures and metadata.
 */
import fetch from 'node-fetch';
import axios from 'axios';
import https from 'https';
import dns from 'dns';
import { URL } from 'url';
import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('SportMonksService');

export default class SportMonksService {
  constructor(redis = null) {
    this.redis = redis;
    // Try multiple possible SportMonks endpoints/IPs in order of preference
    // Primary: official v3 API, Secondary: try without /v3, Tertiary: direct IP if known
    this.baseUrls = [
      (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.BASE) || 'https://api.sportsmonks.com/v3',
      'https://api.sportmonks.com/v3', // alternate spelling (without 's')
      'https://www.api.sportsmonks.com/v3' // try www prefix
    ];
    this.base = this.baseUrls[0];
    // Accept multiple possible env var names for the API token to be resilient
    this.key = (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) || process.env.SPORTSMONKS_API_KEY || process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_TOKEN || null;
    
    // Do NOT override DNS globally - that affects all Node requests
    // Instead, we'll use proxy/agent per-request
    logger.info(`[SportMonksService] Initialized with base URL: ${this.base}`);
  }

  _buildUrl(endpoint, query = {}) {
    return this._buildUrlWithBase(this.base, endpoint, query);
  }

  _buildUrlWithBase(base, endpoint, query = {}) {
    const urlBase = base.replace(/\/+$/, '');
    const parts = [urlBase, 'football', endpoint].map(p => String(p).replace(/^\/+|\/+$/g, ''));
    const q = Object.assign({}, query);
    if (this.key) q.api_token = this.key;
    const qs = Object.keys(q).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
    return `${parts.join('/')}${qs ? `?${qs}` : ''}`;
  }

  async _fetch(endpoint, query = {}) {
    const attempts = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        // Try each base URL variant on first attempt of each cycle
        const baseUrlIndex = attempt === 1 ? 0 : (attempt === 2 ? 1 : 0);
        const currentBase = this.baseUrls[baseUrlIndex % this.baseUrls.length];
        
        const url = this._buildUrlWithBase(currentBase, endpoint, query);
        const safeUrlForLog = url.replace(/(api_token=[^&]+)/gi, 'api_token=REDACTED');
        
        if (attempt === 1) {
          logger.info(`[SportMonksService] Requesting (attempt ${attempt}): ${safeUrlForLog}`);
        }
        
        // Use axios for better TLS control per-service
        const insecure = (process.env.SPORTSMONKS_INSECURE === 'true');
        const agent = new https.Agent({ 
          rejectUnauthorized: !insecure,
          keepAlive: true,
          maxSockets: 50
        });
        
        const resp = await axios.get(url, { 
          timeout: 15000, 
          httpsAgent: agent, 
          headers: { Accept: 'application/json' }
        });
        
        const data = resp && resp.data ? resp.data : null;
        // axios throws for non-2xx; still guard
        if (!data) {
          const safeUrl = url.replace(/(api_token|api_token=[^&]+)/gi, 'api_token=REDACTED');
          throw new Error(`Empty response from SportMonks (url: ${safeUrl})`);
        }
        return data && (data.data || data) ? (data.data || data) : data;
      } catch (e) {
        try {
          // Redact token for logs
          const safeUrl = (e && e.config && e.config.url) ? String(e.config.url).replace(/(api_token=[^&]+)/gi, 'api_token=REDACTED') : this._buildUrl(endpoint, query).replace(/(api_token=[^&]+)/gi, 'api_token=REDACTED');
          const status = e && e.response && e.response.status ? e.response.status : 'N/A';
          const dataSnippet = e && e.response && e.response.data ? (typeof e.response.data === 'string' ? e.response.data.substring(0,200) : JSON.stringify(e.response.data).substring(0,200)) : null;
          logger.warn(`[SportMonksService] attempt ${attempt}/${attempts} failed | endpoint:${endpoint} | status:${status} | error:${e?.message || String(e)}`);
          if (dataSnippet) logger.info(`[SportMonksService] response body: ${dataSnippet}`);
        } catch (logErr) {
          logger.error('Error logging SportMonks fetch failure:', logErr.message);
        }
        if (attempt < attempts) {
          // exponential backoff
          const waitMs = 300 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        return null;
      }
    }
  }

  async getLivescores(leagueId = null) {
    try {
      const q = {};
      if (leagueId) q.league_id = leagueId;
      // SportMonks endpoint: livescores
      const data = await this._fetch('livescores', q);
      if (!data) return [];
      // data may be array or object wrapper
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.data)) return data.data;
      // some responses include a `result` or `results` array
      if (data && Array.isArray(data.results)) return data.results;
      return [];
    } catch (e) {
      logger.warn('getLivescores error', e?.message || String(e));
      return [];
    }
  }

  /**
   * Generic paginated fetch helper - will iterate pages until exhausted or until a safety cap
   */
  async _fetchAll(endpoint, query = {}) {
    try {
      const perPage = Number(process.env.SPORTSMONKS_PER_PAGE || 250);
      const maxPages = Number(process.env.SPORTSMONKS_MAX_PAGES || 20);
      let page = 1;
      let results = [];

      while (page <= maxPages) {
        const q = Object.assign({}, query, { page, per_page: perPage });
        const pageData = await this._fetch(endpoint, q);
        if (!pageData) break;

        // pageData may be array or object with data[]
        const arr = Array.isArray(pageData) ? pageData : (Array.isArray(pageData.data) ? pageData.data : (Array.isArray(pageData.results) ? pageData.results : null));
        if (arr && arr.length > 0) {
          results = results.concat(arr);
        } else if (Array.isArray(pageData) && pageData.length === 0) {
          break;
        } else if (!arr && page === 1) {
          // single-page non-array response - return it as-is
          return pageData;
        }

        // Try to detect explicit pagination metadata
        const meta = pageData && pageData.meta ? pageData.meta : (pageData && pageData.pagination ? pageData.pagination : null);
        if (meta && meta.pagination && meta.pagination.total_pages) {
          if (page >= meta.pagination.total_pages) break;
        }

        // If returned items are less than perPage, assume last page
        if (arr && arr.length < perPage) break;

        page += 1;
      }

      return results;
    } catch (e) {
      logger.warn('_fetchAll failed', e?.message || String(e));
      return null;
    }
  }

  /**
   * Get all live matches globally (no league filter)
   * Used for comprehensive live feed
   */
  async getAllLiveMatches() {
    try {
      // Try to fetch all pages where supported. Fallback to single _fetch if pagination isn't supported.
      const paged = await this._fetchAll('livescores', {});
      if (paged && Array.isArray(paged) && paged.length > 0) return paged;
      const single = await this._fetch('livescores', {});
      if (!single) return [];
      if (Array.isArray(single)) return single;
      if (single && Array.isArray(single.data)) return single.data;
      if (single && Array.isArray(single.results)) return single.results;
      return [];
    } catch (e) {
      logger.warn('getAllLiveMatches error', e?.message || String(e));
      return [];
    }
  }

  async getFixtures(params = {}) {
    // Use paginated fetch to retrieve a large set of fixtures when available
    const paged = await this._fetchAll('fixtures', params);
    if (paged && Array.isArray(paged)) return paged;
    const single = await this._fetch('fixtures', params);
    return single || [];
  }

  async getLeagues(params = {}) {
    return await this._fetch('leagues', params) || [];
  }

  async getSeasons(params = {}) {
    return await this._fetch('seasons', params) || [];
  }

  async getTeams(params = {}) {
    return await this._fetch('teams', params) || [];
  }

  async getPlayers(params = {}) {
    return await this._fetch('players', params) || [];
  }

  async getVenues(params = {}) {
    return await this._fetch('venues', params) || [];
  }

  // Convenience: fetch a set of common endpoints in parallel
  async fetchAll() {
    const endpoints = ['livescores', 'fixtures', 'leagues', 'seasons', 'teams', 'players', 'venues'];
    try {
      const promises = endpoints.map(ep => this._fetch(ep));
      const results = await Promise.all(promises);
      const out = {};
      endpoints.forEach((ep, i) => out[ep] = results[i] || []);
      return out;
    } catch (e) {
      logger.warn('fetchAll failed', e?.message || String(e));
      return null;
    }
  }
}
