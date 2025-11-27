import Redis from 'ioredis';

let _instance = null;

class MockRedis {
  constructor() {
    this.kv = new Map();
    this.zsets = new Map();
  }

  async get(key) { return this.kv.has(key) ? this.kv.get(key) : null; }
  async set(key, value) { this.kv.set(key, value); return 'OK'; }
  async del(key) { this.kv.delete(key); return 1; }

  async lpop(key) {
    const arr = this.kv.get(key) || [];
    const v = arr.shift();
    this.kv.set(key, arr);
    return v || null;
  }

  async rpush(key, value) {
    const arr = this.kv.get(key) || [];
    arr.push(value);
    this.kv.set(key, arr);
    return arr.length;
  }

  async lrange(key, start, stop) {
    const arr = this.kv.get(key) || [];
    return arr.slice(start, stop + 1);
  }

  async zadd(key, score, member) {
    const set = this.zsets.get(key) || new Map();
    set.set(String(member), Number(score));
    this.zsets.set(key, set);
    return 1;
  }

  async zincrby(key, inc, member) {
    const set = this.zsets.get(key) || new Map();
    const cur = Number(set.get(String(member)) || 0);
    const next = cur + Number(inc);
    set.set(String(member), next);
    this.zsets.set(key, set);
    return next;
  }

  async zrevrange(key, start, stop, withscores) {
    const set = this.zsets.get(key) || new Map();
    const items = Array.from(set.entries()).map(([member, score]) => ({ member, score }));
    items.sort((a, b) => b.score - a.score);
    const slice = items.slice(start, stop === -1 ? undefined : stop + 1);
    if (withscores === 'WITHSCORES') {
      const out = [];
      for (const it of slice) { out.push(it.member, String(it.score)); }
      return out;
    }
    return slice.map(i => i.member);
  }

  async zcard(key) {
    const set = this.zsets.get(key) || new Map();
    return set.size;
  }

  async zrange(key, start, stop) {
    const set = this.zsets.get(key) || new Map();
    const items = Array.from(set.entries()).map(([member, score]) => ({ member, score }));
    items.sort((a, b) => a.score - b.score);
    const slice = items.slice(start, stop === -1 ? undefined : stop + 1);
    return slice.map(i => i.member);
  }

  async incr(key) {
    const cur = Number(this.kv.get(key) || 0) + 1;
    this.kv.set(key, String(cur));
    return cur;
  }

  async setex(key, seconds, value) {
    this.kv.set(key, value);
    return 'OK';
  }

  async ping() { return 'PONG'; }
}

export function getRedis(opts = {}) {
  if (_instance) return _instance;

  const redisUrl = process.env.REDIS_URL;
  const useMock = process.env.USE_MOCK_REDIS === '1' || !redisUrl;
  
  if (useMock) {
    console.log('[redis-factory] ⚠️  Using MockRedis (no REDIS_URL or USE_MOCK_REDIS=1)');
    _instance = new MockRedis();
    return _instance;
  }

  // Parse Redis URL for logging (safe, never logs password)
  try {
    const url = new URL(redisUrl);
    console.log(`[redis-factory] 🔗 Connecting to Redis: ${url.protocol}//${url.hostname}:${url.port} (${url.pathname})`);
  } catch (e) {
    console.log('[redis-factory] 🔗 Connecting to Redis with provided URL');
  }

  // Create ioredis instance with proper configuration
  _instance = new Redis(redisUrl, {
    // Connection options
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: false,
    
    // Merge with provided options
    ...(opts || {}),
    
    // These options cannot be overridden
    retryStrategy: opts.retryStrategy || ((times) => {
      const delay = Math.min(times * 50, 5000);
      if (times === 1) {
        console.log('[redis-factory] 🔄 Redis connection failed, attempting reconnect...');
      }
      if (times % 5 === 0) {
        console.log(`[redis-factory] 🔄 Retry attempt ${times}, waiting ${delay}ms...`);
      }
      return delay;
    })
  });

  // Connection event handlers
  _instance.on('error', (err) => {
    if (err && err.message) {
      if (err.message.includes('NOAUTH')) {
        console.error('[redis-factory] ❌ NOAUTH: Invalid Redis password/auth');
      } else if (err.message.includes('ECONNREFUSED')) {
        console.error('[redis-factory] ❌ ECONNREFUSED: Cannot connect to Redis host');
      } else if (err.message.includes('ETIMEDOUT')) {
        console.error('[redis-factory] ❌ ETIMEDOUT: Redis connection timeout');
      } else {
        console.error(`[redis-factory] ❌ Redis error: ${err.message}`);
      }
    } else {
      console.error('[redis-factory] ❌ Unknown Redis error:', err);
    }
  });

  _instance.on('connect', () => {
    console.log('[redis-factory] ✅ Connected to Redis successfully');
  });

  _instance.on('ready', () => {
    console.log('[redis-factory] ✅ Redis client is ready for operations');
  });

  _instance.on('reconnecting', () => {
    console.log('[redis-factory] 🔄 Redis reconnecting...');
  });

  _instance.on('end', () => {
    console.log('[redis-factory] ⚠️  Redis connection ended');
  });

  return _instance;
}
