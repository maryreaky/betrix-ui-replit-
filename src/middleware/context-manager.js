/**
 * User Context Manager
 * Maintains conversation history and user preferences
 */

import { Logger } from "../utils/logger.js";

const logger = new Logger("ContextManager");

const MAX_CONTEXT_HISTORY = 20;
const CONTEXT_TTL = 86400 * 7; // 7 days

// Rough token estimator: 1 token ≈ 4 characters (approximation)
function estimateTokens(text) {
  try {
    if (!text) return 0;
    const chars = String(text).length;
    return Math.max(1, Math.ceil(chars / 4));
  } catch (e) {
    return 1;
  }
}

class ContextManager {
  constructor(redis) {
    this.redis = redis;
  }

  /**
   * Add message to user's conversation history
   */
  async recordMessage(userId, message, sender = "user") {
    try {
      const key = `context:${userId}:history`;
      const entry = {
        sender,
        message,
        timestamp: Date.now(),
        tokens: estimateTokens(message),
      };

      await this.redis.lpush(key, JSON.stringify(entry));
      await this.redis.ltrim(key, 0, MAX_CONTEXT_HISTORY);
      await this.redis.expire(key, CONTEXT_TTL);
      // Maintain a rolling token sum for quick checks
      try {
        const tokenKey = `context:${userId}:tokens`;
        await this.redis.incrby(tokenKey, entry.tokens);
        await this.redis.expire(tokenKey, CONTEXT_TTL);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      logger.warn("Record message failed", err);
    }
  }

  /**
   * Get conversation history
   */
  async getContext(userId) {
    try {
      const key = `context:${userId}:history`;
      const messages = await this.redis.lrange(key, 0, -1);

      return messages
        .map(m => {
          try {
            return JSON.parse(m);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch (err) {
      logger.warn("Get context failed", err);
      return [];
    }
  }

  /**
   * Trim context so total tokens <= maxTokens. Removes oldest messages first.
   */
  async trimContextToTokenBudget(userId, maxTokens = 1500) {
    try {
      const tokenKey = `context:${userId}:tokens`;
      let current = 0;
      try {
        const v = await this.redis.get(tokenKey);
        current = v ? Number(v) : 0;
      } catch (e) {
        current = 0;
      }

      if (current <= maxTokens) return;

      const key = `context:${userId}:history`;
      // Pop from the tail (oldest) until under budget
      while (current > maxTokens) {
        const item = await this.redis.rpop(key);
        if (!item) break;
        try {
          const parsed = JSON.parse(item);
          const t = parsed?.tokens || estimateTokens(parsed?.message || '');
          current = Math.max(0, current - t);
        } catch (e) {
          // ignore parse errors
        }
      }

      // store updated token count
      try {
        await this.redis.set(tokenKey, String(current));
        await this.redis.expire(tokenKey, CONTEXT_TTL);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      logger.warn('trimContext failed', err?.message || String(err));
    }
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    try {
      const key = `prefs:${userId}`;
      const prefs = await this.redis.hgetall(key);

      return {
        favoriteLeagues: (prefs.leagues || "").split(",").filter(Boolean),
        preferredLanguage: prefs.language || "en",
        alertsEnabled: prefs.alerts !== "false",
        analysisDepth: prefs.analysisDepth || "medium",
        ...prefs,
      };
    } catch (err) {
      return { preferredLanguage: "en", alertsEnabled: true };
    }
  }

  /**
   * Update user preferences
   */
  async setPreferences(userId, preferences) {
    try {
      const key = `prefs:${userId}`;
      await this.redis.hset(key, preferences);
      await this.redis.expire(key, CONTEXT_TTL);
    } catch (err) {
      logger.warn("Set preferences failed", err);
    }
  }

  /**
   * Get user's viewed matches
   */
  async getViewHistory(userId, limit = 10) {
    try {
      const key = `history:${userId}:matches`;
      const matches = await this.redis.zrevrange(key, 0, limit - 1);
      return matches;
    } catch (err) {
      return [];
    }
  }

  /**
   * Record match view
   */
  async recordView(userId, fixtureId) {
    try {
      const key = `history:${userId}:matches`;
      await this.redis.zadd(key, Date.now(), fixtureId);
      await this.redis.expire(key, CONTEXT_TTL);
    } catch (err) {
      logger.warn("Record view failed", err);
    }
  }

  /**
   * Clear context for user
   */
  async clearContext(userId) {
    try {
      const keys = await this.redis.keys(`context:${userId}:*`);
      if (keys.length) {
        await this.redis.del(keys);
      }
    } catch (err) {
      logger.warn("Clear context failed", err);
    }
  }
}

export { ContextManager };
