import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import CacheService from './cache.js';

class RSSAggregator {
  constructor(redisOrCache = null, opts = {}) {
    this.ttl = opts.ttlSeconds || 60; // cache for 60s by default
    this.rateLimit = opts.rateLimit || 30; // default 30 requests per window
    this.rateWindow = opts.rateWindowSeconds || 60;
    if (redisOrCache instanceof CacheService) this.cache = redisOrCache;
    else if (redisOrCache) this.cache = new CacheService(redisOrCache);
    else this.cache = null;
  }

  async fetchFeed(url) {
    try {
      const cacheKey = `rss:cache:${url}`;
      if (this.cache) {
        const cached = await this.cache.get(cacheKey).catch?.(() => null) || await this.cache.get(cacheKey);
        if (cached) return cached;
        const host = new URL(url).host.replace(/[:.]/g, '_');
        const allowed = await this.cache.rateLimit(`rss:${host}`, this.rateLimit, this.rateWindow).catch(() => false);
        if (!allowed) {
          // If rate limited, return stale cache if available or error
          const stale = await this.cache.get(cacheKey).catch(() => null);
          if (stale) return stale;
          throw new Error('Rate limit exceeded for RSS host');
        }
      }

      const res = await fetch(url, { timeout: 8000 });
      if (!res.ok) throw new Error(`Feed fetch failed ${res.status}`);
      const txt = await res.text();
      const $ = cheerioLoad(txt, { xmlMode: true });
      const items = [];
      $('item').each((i, el) => {
        const title = $(el).find('title').first().text() || '';
        const link = $(el).find('link').first().text() || $(el).find('guid').first().text() || '';
        const pubDate = $(el).find('pubDate').first().text() || '';
        const description = $(el).find('description').first().text() || '';
        const media = $(el).find('media\\:thumbnail, thumbnail, enclosure').first().attr('url') || null;
        items.push({ title, link, pubDate, description, media });
      });

      const out = { url, items, fetchedAt: Date.now() };
      if (this.cache) await this.cache.set(cacheKey, out, this.ttl).catch(() => {});
      return out;
    } catch (err) {
      throw err;
    }
  }

  async fetchMultiple(urls = []) {
    const promises = urls.map(u => this.fetchFeed(u).catch(e => ({ url: u, error: e.message }))); 
    return Promise.all(promises);
  }
}

export default RSSAggregator;
