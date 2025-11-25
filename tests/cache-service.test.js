import test from 'node:test';
import assert from 'node:assert/strict';
import CacheService from '../src/services/cache.js';

// Mock Redis for integration tests
class MockRedis {
  constructor() {
    this.store = new Map();
    this.counters = new Map();
    this.expirations = new Map();
  }

  async get(key) {
    if (this.expirations.has(key) && this.expirations.get(key) < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, mode = null, ttl = null) {
    this.store.set(key, value);
    if (mode === 'EX' && ttl) {
      this.expirations.set(key, Date.now() + ttl * 1000);
    }
    return 'OK';
  }

  async incr(key) {
    const current = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, current);
    return current;
  }

  async expire(key, seconds) {
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async del(...keys) {
    keys.forEach(k => this.store.delete(k));
    return keys.length;
  }
}

test('CacheService - basic get/set operations', async () => {
  const redis = new MockRedis();
  const cache = new CacheService(redis);

  const testData = { id: 1, name: 'Test' };
  await cache.set('test:key', testData, 60);
  const result = await cache.get('test:key');

  assert.deepStrictEqual(result, testData);
});

test('CacheService - rate limiting within bounds', async () => {
  const redis = new MockRedis();
  const cache = new CacheService(redis);

  // Allow 3 requests in 60s
  const results = [];
  for (let i = 0; i < 3; i++) {
    results.push(await cache.rateLimit('test:limit', 3, 60));
  }

  assert.deepStrictEqual(results, [true, true, true], 'Should allow 3 requests');
});

test('CacheService - rate limiting exceeds bounds', async () => {
  const redis = new MockRedis();
  const cache = new CacheService(redis);

  // Try 5 requests when limit is 3
  for (let i = 0; i < 3; i++) {
    await cache.rateLimit('test:exceed', 3, 60);
  }
  const result = await cache.rateLimit('test:exceed', 3, 60);

  assert.strictEqual(result, false, 'Should deny 4th request');
});

test('CacheService - handles null/undefined values gracefully', async () => {
  const redis = new MockRedis();
  const cache = new CacheService(redis);

  const result = await cache.get('nonexistent:key');
  assert.strictEqual(result, null);
});

test('CacheService - serialization/deserialization', async () => {
  const redis = new MockRedis();
  const cache = new CacheService(redis);

  const complex = { arr: [1, 2, 3], nested: { key: 'value' }, bool: true };
  await cache.set('complex:key', complex, 30);
  const retrieved = await cache.get('complex:key');

  assert.deepStrictEqual(retrieved, complex);
});
