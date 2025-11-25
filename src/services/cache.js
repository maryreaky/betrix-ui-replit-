class CacheService {
  constructor(redis) {
    if (!redis) throw new Error('Redis instance required');
    this.redis = redis;
  }

  async get(key) {
    try {
      const v = await this.redis.get(key).catch(()=>null);
      if (!v) return null;
      return JSON.parse(v);
    } catch (e) { return null; }
  }

  async set(key, value, ttlSeconds = 60) {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSeconds)).catch(()=>{});
      return true;
    } catch (e) { return false; }
  }

  // Simple token-bucket style rate limiter using Redis INCR + EXPIRE
  // Returns true if allowed, false if limit exceeded
  async rateLimit(key, limit = 10, windowSeconds = 60) {
    try {
      const k = `rl:${key}`;
      const cur = await this.redis.incr(k);
      if (cur === 1) await this.redis.expire(k, windowSeconds).catch(()=>{});
      return Number(cur) <= Number(limit);
    } catch (e) {
      return false;
    }
  }
}

export default CacheService;
