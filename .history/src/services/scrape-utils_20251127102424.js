import fetch from 'node-fetch';
import { Logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';

const logger = new Logger('ScrapeUtils');

/**
 * Naive robots.txt checker — fetches robots.txt for host and checks for a global Disallow: /
 * Note: This is a lightweight helper and does not implement full robots parsing.
 */
export async function isScrapingAllowedForHost(host) {
  try {
    const robotsUrl = host.endsWith('/') ? `${host}robots.txt` : `${host.replace(/\/$/, '')}/robots.txt`;
    const res = await fetch(robotsUrl, { timeout: 5000 });
    if (!res.ok) return true; // missing robots.txt => assume allowed
    const txt = await res.text();
    // very small heuristic: if robots contains "Disallow: /" for User-agent: * then block
    const lowered = txt.toLowerCase();
    const userAgentIndex = lowered.indexOf('user-agent: *');
    if (userAgentIndex >= 0) {
      const snippet = lowered.slice(userAgentIndex, userAgentIndex + 200);
      if (snippet.includes('disallow: /')) return false;
    }
    return true;
  } catch (e) {
    logger.warn('robots.txt check failed', e?.message || String(e));
    // In case of error, be conservative and allow (so site-specific logic can opt-out)
    return true;
  }
}

/**
 * Redis-backed per-host rate limiter. Allows `limit` requests per `windowSeconds` for the given host.
 * Returns true if allowed, false if rate limited.
 */
export async function hostRateLimit(redis, host, limit = 60, windowSeconds = 60) {
  try {
    if (!redis) return true; // no redis means no enforcement
    const key = `scrape:rate:${host}`;
    const n = await redis.incr(key);
    if (n === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (n > limit) return false;
    return true;
  } catch (e) {
    logger.warn('hostRateLimit failed', e?.message || String(e));
    return true;
  }
}

export default { isScrapingAllowedForHost, hostRateLimit };
