/**
 * Performance Optimization Engine
 * Smart caching, prefetching, and performance monitoring for superior speed
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('PerformanceOptimizer');

export class PerformanceOptimizer {
  constructor(redis) {
    this.redis = redis;
    this.localCache = new Map();
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      slowRequests: 0
    };
    this.requestTimes = [];
  }

  /**
   * Smart cache with multi-tier fallback
   */
  async smartCache(key, fetchFn, ttlSeconds = 300, forceRefresh = false) {
    try {
      // 1. Check local cache first (fastest)
      if (!forceRefresh && this.localCache.has(key)) {
        const cached = this.localCache.get(key);
        if (cached.expiry > Date.now()) {
          this.metrics.cacheHits++;
          return cached.value;
        } else {
          this.localCache.delete(key);
        }
      }

      // 2. Check Redis cache
      if (this.redis && !forceRefresh) {
        const redisCached = await this.redis.get(key).catch(() => null);
        if (redisCached) {
          const value = JSON.parse(redisCached);
          // Update local cache
          this.localCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
          this.metrics.cacheHits++;
          return value;
        }
      }

      // 3. Cache miss - fetch fresh data
      this.metrics.cacheMisses++;
      const start = Date.now();
      const value = await fetchFn();
      const responseTime = Date.now() - start;

      // Track performance
      this.trackResponseTime(responseTime);

      // Store in both caches
      this.localCache.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
      if (this.redis) {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value)).catch(() => {});
      }

      return value;
    } catch (err) {
      logger.error(`SmartCache error for key ${key}`, err);
      // Return cached data even if expired (fallback)
      if (this.localCache.has(key)) {
        return this.localCache.get(key).value;
      }
      throw err;
    }
  }

  /**
   * Batch multiple cache requests
   */
  async batchCache(requests, ttlSeconds = 300) {
    try {
      const results = {};
      const promises = [];

      requests.forEach((req, idx) => {
        const promise = this.smartCache(req.key, req.fetchFn, ttlSeconds)
          .then(value => {
            results[req.key] = value;
          })
          .catch(err => {
            logger.warn(`Batch cache error for ${req.key}`, err);
            results[req.key] = null;
          });
        promises.push(promise);
      });

      await Promise.all(promises);
      return results;
    } catch (err) {
      logger.error('Batch cache error', err);
      return {};
    }
  }

  /**
   * Prefetch data for anticipated user actions
   */
  async prefetchData(userId, preferences = {}) {
    try {
      const prefetchQueue = [];

      // Prefetch favorite teams
      if (preferences.favoriteTeams && preferences.favoriteTeams.length > 0) {
        preferences.favoriteTeams.forEach(teamId => {
          prefetchQueue.push({
            key: `team:${teamId}:stats`,
            fetchFn: () => ({ team: teamId, stats: {} }),
            ttl: 600
          });
        });
      }

      // Prefetch favorite leagues
      if (preferences.favoriteLeagues && preferences.favoriteLeagues.length > 0) {
        preferences.favoriteLeagues.forEach(leagueId => {
          prefetchQueue.push({
            key: `league:${leagueId}:live`,
            fetchFn: () => ({ league: leagueId, matches: [] }),
            ttl: 120
          });
        });
      }

      // Execute prefetches in parallel
      const prefetchResults = await Promise.allSettled(
        prefetchQueue.map(item =>
          this.smartCache(item.key, item.fetchFn, item.ttl)
        )
      );

      logger.info(`Prefetched ${prefetchResults.length} items for user ${userId}`);
      return prefetchResults;
    } catch (err) {
      logger.error('Prefetch error', err);
      return [];
    }
  }

  /**
   * Track response times for monitoring
   */
  trackResponseTime(ms) {
    this.requestTimes.push({ time: ms, timestamp: Date.now() });

    // Keep only last 100 requests
    if (this.requestTimes.length > 100) {
      this.requestTimes.shift();
    }

    // Calculate average
    const sum = this.requestTimes.reduce((acc, r) => acc + r.time, 0);
    this.metrics.avgResponseTime = sum / this.requestTimes.length;

    // Track slow requests (> 1000ms)
    if (ms > 1000) {
      this.metrics.slowRequests++;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? ((this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100).toFixed(1)
      : 0;

    return {
      cacheHitRate: `${cacheHitRate}%`,
      totalCacheHits: this.metrics.cacheHits,
      totalCacheMisses: this.metrics.cacheMisses,
      avgResponseTime: `${this.metrics.avgResponseTime.toFixed(0)}ms`,
      slowRequests: this.metrics.slowRequests,
      localCacheSize: this.localCache.size
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      slowRequests: 0
    };
    this.requestTimes = [];
  }

  /**
   * Clear caches
   */
  async clearCaches() {
    try {
      this.localCache.clear();
      if (this.redis) {
        // Clear BETRIX-related keys
        const pattern = 'betrix:*';
        const keys = await this.redis.keys(pattern).catch(() => []);
        if (keys.length > 0) {
          await this.redis.del(...keys).catch(() => {});
        }
      }
      logger.info('Caches cleared');
    } catch (err) {
      logger.error('Clear caches error', err);
    }
  }

  /**
   * Optimize data payload (compression/filtering)
   */
  optimizePayload(data, tier = 'FREE') {
    // Remove unnecessary fields based on tier
    const optimized = { ...data };

    if (tier === 'FREE') {
      // Free tier: minimal data
      delete optimized.advanced_stats;
      delete optimized.predictions;
      delete optimized.arbitrage_data;
    }

    // Always remove sensitive data
    delete optimized.api_keys;
    delete optimized.internal_ids;

    return optimized;
  }

  /**
   * Create response with optimal encoding
   */
  encodeResponse(data, format = 'json') {
    if (format === 'json') {
      return JSON.stringify(data);
    } else if (format === 'compact') {
      // Remove whitespace for smaller payload
      return JSON.stringify(data).replace(/\s/g, '');
    }
    return data;
  }

  /**
   * Implement request debouncing
   */
  createDebounce(fn, delayMs = 300) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delayMs);
    };
  }

  /**
   * Implement request throttling
   */
  createThrottle(fn, intervalMs = 1000) {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= intervalMs) {
        lastCall = now;
        return fn(...args);
      }
    };
  }

  /**
   * Memory usage report
   */
  getMemoryReport() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
      cacheSize: `${(this.localCache.size)}`,
      cacheMemory: `${(Array.from(this.localCache.values()).reduce((sum, item) => sum + JSON.stringify(item).length, 0) / 1024).toFixed(2)} KB`
    };
  }

  /**
   * Optimize database queries
   */
  buildOptimizedQuery(baseQuery, filters = {}, pagination = {}) {
    let query = baseQuery;

    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        query += ` AND ${key} = ?`;
      }
    });

    // Add pagination
    if (pagination.limit) {
      query += ` LIMIT ${pagination.limit}`;
      if (pagination.offset) {
        query += ` OFFSET ${pagination.offset}`;
      }
    }

    return query;
  }

  /**
   * Rate limit protection
   */
  createRateLimiter(maxRequests, windowMs) {
    const requests = new Map();

    return (userId) => {
      const now = Date.now();
      const userRequests = requests.get(userId) || [];

      // Remove old requests outside window
      const recentRequests = userRequests.filter(time => now - time < windowMs);

      if (recentRequests.length >= maxRequests) {
        const resetTime = recentRequests[0] + windowMs;
        return {
          allowed: false,
          retryAfter: Math.ceil((resetTime - now) / 1000)
        };
      }

      recentRequests.push(now);
      requests.set(userId, recentRequests);

      return { allowed: true };
    };
  }
}

export default PerformanceOptimizer;
