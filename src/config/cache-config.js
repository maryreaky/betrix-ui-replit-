/**
 * Centralized Cache & Rate-Limit Configuration
 * Defines TTLs, rate limits, and backoff policies for all free-data sources
 */

export const CACHE_CONFIG = {
  // RSS Feeds (volatile, frequent updates)
  rss: {
    ttlSeconds: 60,
    rateLimit: 30,              // requests per window
    rateWindowSeconds: 60,
    description: 'BBC/Guardian/ESPN RSS feeds'
  },

  // OpenLigaDB (live match data, moderate freshness required)
  openligadb: {
    ttlSeconds: 30,
    rateLimit: 60,              // requests per minute
    rateWindowSeconds: 60,
    description: 'OpenLigaDB leagues, matches, standings'
  },

  // ScoreBat (highlights, less frequent updates)
  scorebat: {
    ttlSeconds: 120,
    rateLimit: 20,              // requests per minute
    rateWindowSeconds: 60,
    description: 'ScoreBat free highlights feed'
  },

  // football-data.co.uk CSVs (static/daily updates)
  footballdata: {
    ttlSeconds: 3600,           // 1 hour
    rateLimit: 5,               // conservative, CSV downloads are heavy
    rateWindowSeconds: 60,
    description: 'football-data.co.uk CSV fixtures/results'
  },

  // FBref/Understat (scraped, should be conservative)
  scrapers: {
    ttlSeconds: 7200,           // 2 hours
    rateLimit: 10,              // very conservative
    rateWindowSeconds: 60,
    description: 'FBref/Understat polite scrapers'
  }
};

// Prefetch scheduler backoff policy
export const PREFETCH_BACKOFF_CONFIG = {
  baseBackoffSeconds: Number(process.env.PREFETCH_BASE_BACKOFF_SECONDS || 60),
  maxBackoffSeconds: Number(process.env.PREFETCH_MAX_BACKOFF_SECONDS || 3600),
  // Exponential: 2^(failures-1) * base, capped at max
  // Failure 1: 60s, Failure 2: 120s, Failure 3: 240s, ..., max 1h
  calculateDelay(failureCount) {
    const base = this.baseBackoffSeconds;
    const max = this.maxBackoffSeconds;
    const delay = Math.pow(2, Math.max(0, failureCount - 1)) * base;
    return Math.min(max, Math.max(1, delay));
  }
};

// Prefetch scheduler interval
export const PREFETCH_INTERVAL_SECONDS = Number(process.env.PREFETCH_INTERVAL_SECONDS || 60);

// Redis key prefixes and TTL policies
export const REDIS_KEYS = {
  // Prefetch caches
  rssCache: 'prefetch:rss:football',
  scorebatCache: 'prefetch:scorebat:free',
  openligadbLeaguesCache: 'prefetch:openligadb:leagues',
  openligadbRecentCache: (league) => `prefetch:openligadb:recent:${league}`,
  footballdataCache: (comp, season) => `prefetch:footballdata:${comp}:${season}`,

  // Prefetch state
  prefetchFailures: (type) => `prefetch:failures:${type}`,
  prefetchNext: (type) => `prefetch:next:${type}`,
  prefetchLast: (type) => `prefetch:last:${type}`,

  // AI observability
  aiActive: 'ai:active',

  // Worker health
  workerHeartbeat: 'worker:heartbeat',

  // System logs
  systemLogs: 'system:logs',

  // User context
  userContext: (userId) => `context:${userId}:history`,
  userTokens: (userId) => `context:${userId}:tokens`,
  userTier: (userId) => `user:tier:${userId}`
};

// Pub/Sub channels
export const PUBSUB_CHANNELS = {
  prefetchUpdates: 'prefetch:updates',
  prefetchError: 'prefetch:error'
};

// Cache TTL defaults (in seconds)
export const DEFAULT_TTLS = {
  shortLived: 60,              // 1 minute
  mediumLived: 300,            // 5 minutes
  longLived: 3600,             // 1 hour
  veryLongLived: 86400         // 1 day
};

// Log retention
export const LOG_CONFIG = {
  maxLogEntries: 2000,
  expireAfterSeconds: 604800   // 7 days
};
