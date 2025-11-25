import test from 'node:test';
import assert from 'node:assert/strict';
import OpenLigaDBService from '../src/services/openligadb.js';

test('OpenLigaDBService instantiates without cache', async () => {
  const svc = new OpenLigaDBService();
  assert.strictEqual(svc.cache, null);
  assert.strictEqual(svc.cacheTtl, 30);
});

test('OpenLigaDBService instantiates with CacheService', async () => {
  const fakeRedis = {
    async get() { return null; },
    async set() { return 'OK'; },
    async incr() { return 1; },
    async expire() { return 1; }
  };
  const svc = new OpenLigaDBService(undefined, fakeRedis, { ttlSeconds: 60 });
  assert.ok(svc.cache);
  assert.strictEqual(svc.cacheTtl, 60);
});
