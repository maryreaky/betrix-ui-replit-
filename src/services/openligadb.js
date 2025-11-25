import fetch from 'node-fetch';
import CacheService from './cache.js';

class OpenLigaDBService {
  constructor(baseUrl = 'https://api.openligadb.de', cacheOrRedis = null, opts = {}) {
    this.base = baseUrl.replace(/\/$/, '');
    this.cacheTtl = opts.ttlSeconds || 30;
    if (cacheOrRedis instanceof CacheService) this.cache = cacheOrRedis;
    else if (cacheOrRedis) this.cache = new CacheService(cacheOrRedis);
    else this.cache = null;
    this.rateLimit = opts.rateLimit || 60; // per minute
    this.rateWindow = opts.rateWindowSeconds || 60;
  }

  async getAvailableLeagues() {
    const url = `${this.base}/getavailableleagues`;
    const cacheKey = `openligadb:leagues`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey).catch(() => null);
      if (cached) return cached;
      const allowed = await this.cache.rateLimit('openligadb:leagues', this.rateLimit, this.rateWindow).catch(() => false);
      if (!allowed) {
        const stale = await this.cache.get(cacheKey).catch(() => null);
        if (stale) return stale;
        throw new Error('Rate limited for OpenLigaDB leagues');
      }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenLigaDB leagues fetch failed: ${res.status}`);
    const json = await res.json();
    if (this.cache) await this.cache.set(cacheKey, json, this.cacheTtl).catch(() => {});
    return json;
  }

  // Fetch match data for a league + season + group (matchday)
  async getMatchData(leagueShortcut, season, groupOrderId) {
    if (!leagueShortcut || !season) throw new Error('leagueShortcut and season required');
    const group = groupOrderId || 1;
    const url = `${this.base}/getmatchdata/${encodeURIComponent(leagueShortcut)}/${encodeURIComponent(season)}/${encodeURIComponent(group)}`;
    const cacheKey = `openligadb:matchdata:${leagueShortcut}:${season}:${group}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey).catch(() => null);
      if (cached) return cached;
      const allowed = await this.cache.rateLimit(`openligadb:${leagueShortcut}`, this.rateLimit, this.rateWindow).catch(() => false);
      if (!allowed) {
        const stale = await this.cache.get(cacheKey).catch(() => null);
        if (stale) return stale;
        throw new Error('Rate limited for OpenLigaDB matchdata');
      }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenLigaDB matchdata fetch failed: ${res.status}`);
    const json = await res.json();
    if (this.cache) await this.cache.set(cacheKey, json, this.cacheTtl).catch(() => {});
    return json;
  }

  // Helper: fetch a few recent groups for a season (best-effort)
  async getRecentMatches(leagueShortcut, season, groups = 4) {
    const promises = [];
    for (let g = 1; g <= groups; g++) promises.push(this.getMatchData(leagueShortcut, season, g).catch(() => []));
    const results = await Promise.all(promises);
    return results.flat();
  }
}

export default OpenLigaDBService;
