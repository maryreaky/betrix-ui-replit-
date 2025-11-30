/**
 * SportMonks Service
 * Lightweight wrapper around the SportsMonks Football API used as a fallback
 * provider for live scores, fixtures and metadata.
 */
import fetch from 'node-fetch';
import axios from 'axios';
import https from 'https';
import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('SportMonksService');

export default class SportMonksService {
  constructor(redis = null) {
    this.redis = redis;
    this.base = (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.BASE) || 'https://api.sportsmonks.com/v3';
    // Accept multiple possible env var names for the API token to be resilient
    this.key = (CONFIG.SPORTSMONKS && CONFIG.SPORTSMONKS.KEY) || process.env.SPORTSMONKS_API_KEY || process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_TOKEN || null;
  }

  _buildUrl(endpoint, query = {}) {
    const urlBase = this.base.replace(/\/+$/, '');
    const parts = [urlBase, 'football', endpoint].map(p => String(p).replace(/^\/+|\/+$/g, ''));
    const q = Object.assign({}, query);
    if (this.key) q.api_token = this.key;
    const qs = Object.keys(q).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
    return `${parts.join('/')}${qs ? `?${qs}` : ''}`;
  }

  async _fetch(endpoint, query = {}) {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const url = this._buildUrl(endpoint, query);
        // Use axios for better TLS control per-service
        const insecure = (process.env.SPORTSMONKS_INSECURE === 'true');
        const agent = new https.Agent({ rejectUnauthorized: !insecure });
        const resp = await axios.get(url, { timeout: 15000, httpsAgent: agent, headers: { Accept: 'application/json' } });
        const data = resp && resp.data ? resp.data : null;
        // axios throws for non-2xx; still guard
        if (!data) {
          const safeUrl = url.replace(/(api_token|api_token=[^&]+)/gi, 'api_token=REDACTED');
          throw new Error(`Empty response from SportMonks (url: ${safeUrl})`);
        }
        return data && (data.data || data) ? (data.data || data) : data;
      } catch (e) {
        logger.warn('SportMonks fetch attempt', attempt, 'failed for', endpoint, e?.message || String(e));
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
   * Get all live matches globally (no league filter)
   * Used for comprehensive live feed
   */
  async getAllLiveMatches() {
    try {
      const data = await this._fetch('livescores', {});
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.results)) return data.results;
      return [];
    } catch (e) {
      logger.warn('getAllLiveMatches error', e?.message || String(e));
      return [];
    }
  }

  async getFixtures(params = {}) {
    return await this._fetch('fixtures', params) || [];
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
