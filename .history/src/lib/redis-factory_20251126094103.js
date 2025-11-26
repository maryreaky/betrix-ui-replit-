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

  const useMock = process.env.USE_MOCK_REDIS === '1' || !process.env.REDIS_URL;
  if (useMock) {
    _instance = new MockRedis();
    return _instance;
  }

  // create a normal ioredis instance (respect optional redis options)
  _instance = new Redis(process.env.REDIS_URL, opts);
  // attach a safe error handler so unhandled errors don't spam
  _instance.on('error', (err) => {
    // if auth error, log once
    if (err && err.message && err.message.includes('NOAUTH')) {
      console.warn('[redis-factory] Redis NOAUTH:', err.message);
    } else {
      console.error('[redis-factory] Redis error:', err && err.message ? err.message : err);
    }
  });
  return _instance;
}
