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
<<<<<<< HEAD

  // Compatibility methods used by the worker or other services
  async expire() {
    // No TTL semantics in MockRedis; pretend success
    return 1;
  }

  async publish() {
    // Mock publish: no-op but return number of subscribers (0)
    return 0;
  }

  async rpop(source) {
    const arr = this.kv.get(source) || [];
    const v = arr.pop();
    this.kv.set(source, arr);
    return v || null;
  }

  async lpush(dest, value) {
    const arr = this.kv.get(dest) || [];
    arr.unshift(value);
    this.kv.set(dest, arr);
    return arr.length;
  }

  async rpoplpush(source, dest) {
    const val = await this.rpop(source);
    if (!val) return null;
    await this.lpush(dest, val);
    return val;
  }

  async brpoplpush(source, dest) {
    // Blocking is not implemented for MockRedis; behave like rpoplpush
    return await this.rpoplpush(source, dest);
  }

  async quit() {
    // No real connection to close in MockRedis; behave like OK
    return 'OK';
  }

  async disconnect() {
    return 'OK';
  }
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
  // Compatibility wrappers: some hosted Redis clients or proxy libraries
  // may not expose the exact ioredis method names (e.g. brpoplpush, expire, publish).
  // If the methods are missing but the client supports `sendCommand` or `call`,
  // provide thin wrappers so the rest of the codebase can use the expected API.
  const sendCmd = typeof _instance.sendCommand === 'function' ? (args) => _instance.sendCommand(args) : null;
  const callCmd = typeof _instance.call === 'function' ? (cmd, ...args) => _instance.call(cmd, ...args) : null;

  function attachIfMissing(name, impl) {
    if (typeof _instance[name] !== 'function') {
      try {
        // If an original implementation exists, capture it so wrappers
        // can call the original without recursing into themselves.
        const original = _instance[name];
        const wrapped = typeof impl === 'function' ? impl : () => { throw new Error('invalid impl'); };
        // Attach both to the instance and the prototype to cover
        // different client shapes (proxied objects, wrapped clients).
        try { _instance[name] = wrapped.bind(_instance, original); } catch (e) { _instance[name] = wrapped; }
        try { if (_instance && _instance.constructor && _instance.constructor.prototype) _instance.constructor.prototype[name] = wrapped; } catch (e) { void 0; }
        console.log(`[redis-factory] ⚙️  Attached compatibility wrapper for ${name}`);
      } catch (e) {
        console.warn(`[redis-factory] ⚠️  Could not attach wrapper for ${name}`, e && e.message ? e.message : e);
      }
    }
  }

  // EXPIRE key seconds
  attachIfMissing('expire', (original) => async (key, seconds) => {
    if (typeof original === 'function') return await original.call(_instance, key, seconds);
    if (sendCmd) return await sendCmd(['EXPIRE', key, String(seconds)]);
    if (callCmd) return await callCmd('EXPIRE', key, String(seconds));
    throw new Error('redis.expire not supported by client');
  });

  // PUBLISH channel message
  attachIfMissing('publish', (original) => async (channel, message) => {
    if (typeof original === 'function') return await original.call(_instance, channel, message);
    if (sendCmd) return await sendCmd(['PUBLISH', channel, String(message)]);
    if (callCmd) return await callCmd('PUBLISH', channel, String(message));
    throw new Error('redis.publish not supported by client');
  });

  // BRPOPLPUSH source dest timeout
  attachIfMissing('brpoplpush', (original) => async (source, dest, timeout = 0) => {
    if (typeof original === 'function') return await original.call(_instance, source, dest, timeout);
    if (sendCmd) return await sendCmd(['BRPOPLPUSH', source, dest, String(timeout)]);
    if (callCmd) return await callCmd('BRPOPLPUSH', source, dest, String(timeout));
    // Fallback: try BRPOP followed by LPUSH (non-atomic, only for best-effort fallback)
    if (typeof _instance.brpop === 'function' && typeof _instance.lpush === 'function') {
      const res = await _instance.brpop(source, timeout);
      if (!res) return null;
      // res can be [key, value]
      const val = Array.isArray(res) ? res[1] : res;
      await _instance.lpush(dest, val);
      return val;
    }
    throw new Error('redis.brpoplpush not supported by client');
  });

  // RPOPLPUSH source dest
  attachIfMissing('rpoplpush', (original) => async (source, dest) => {
    if (typeof original === 'function') return await original.call(_instance, source, dest);
    if (sendCmd) return await sendCmd(['RPOPLPUSH', source, dest]);
    if (callCmd) return await callCmd('RPOPLPUSH', source, dest);
    // Fallback: try RPOP then LPUSH (non-atomic)
    if (typeof _instance.rpop === 'function' && typeof _instance.lpush === 'function') {
      const val = await _instance.rpop(source);
      if (!val) return null;
      await _instance.lpush(dest, val);
      return val;
    }
    throw new Error('redis.rpoplpush not supported by client');
  });

  // QUIT / graceful disconnect shim (some clients expose quit, others disconnect)
  attachIfMissing('quit', (original) => async () => {
    if (typeof original === 'function') return await original.call(_instance);
    if (typeof _instance.disconnect === 'function') return await _instance.disconnect();
    if (typeof _instance.quit === 'function') return await _instance.quit();
    // As a last resort, no-op
    return 'OK';
  });

  // Log the final capabilities to help diagnose hosted clients at startup
  try {
    const required = ['expire', 'publish', 'brpoplpush', 'rpoplpush', 'rpop', 'lpush'];
    const present = required.reduce((acc, k) => { acc[k] = typeof _instance[k] === 'function'; return acc; }, {});
    console.log('[redis-factory] 🔎 Redis capability check:', present);
  } catch (e) {
    console.warn('[redis-factory] ⚠️  Could not perform capability check', e && e.message ? e.message : e);
  }

=======
>>>>>>> upstream/main
  return _instance;
}

// Export MockRedis so callers can explicitly create an in-memory fallback
export { MockRedis };
