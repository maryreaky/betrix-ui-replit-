/**
 * Provider Health / Circuit Breaker helper
 * - Uses Redis when available to mark providers disabled with TTL
 * - Falls back to an in-memory map when Redis is unavailable (useful for tests)
 */
export class ProviderHealth {
  constructor(redis = null) {
    this.redis = redis;
    this.mem = new Map(); // name -> { disabledUntil, reason }
  }

  _redisKey(name) {
    return `betrix:provider:disabled:${name.toLowerCase()}`;
  }

  async isDisabled(name) {
    try {
      if (this.redis) {
        const v = await this.redis.get(this._redisKey(name)).catch(() => null);
        if (v) return true;
      }
    } catch (e) {
      // ignore redis check failures
    }
    const mem = this.mem.get(name);
    if (!mem) return false;
    return (Date.now() < (mem.disabledUntil || 0));
  }

  async markDisabled(name, seconds, reason = '') {
    const disabledUntil = Date.now() + (Number(seconds || 0) * 1000);
    this.mem.set(name, { disabledUntil, reason });
    try {
      if (this.redis) {
        const key = this._redisKey(name);
        await this.redis.set(key, JSON.stringify({ reason: String(reason || ''), ts: Date.now() }));
        await this.redis.expire(key, Number(seconds || 60));
      }
    } catch (e) {
      // ignore redis write failures
    }
  }

  async markFailure(name, statusCode, message = '') {
    // Non-retryable errors: 401,403,404 -> disable for 30m
    // Rate limit: 429 -> disable for 5m
    // Server errors: 500-599 -> short backoff 1m
    const code = Number(statusCode || 0);
    if ([401, 403, 404].includes(code)) {
      await this.markDisabled(name, 30 * 60, `non-retryable:${code} ${message}`);
      return;
    }
    if (code === 429) {
      await this.markDisabled(name, 5 * 60, `rate-limit:${message}`);
      return;
    }
    if (code >= 500 && code < 600) {
      await this.markDisabled(name, 60, `server-error:${code}`);
      return;
    }
    // Default short backoff
    await this.markDisabled(name, 30, `failure:${code} ${message}`);
  }

  async clear(name) {
    // Remove any disabled markers for a provider (in-memory and Redis)
    try {
      this.mem.delete(name);
    } catch (e) {
      // ignore
    }
    try {
      if (this.redis) {
        await this.redis.del(this._redisKey(name)).catch(() => null);
      }
    } catch (e) {
      // ignore redis delete failures
    }
  }
}
