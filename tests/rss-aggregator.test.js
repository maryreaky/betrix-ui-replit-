import test from 'node:test';
import assert from 'node:assert/strict';
import RSSAggregator from '../src/services/rss-aggregator.js';

test('RSSAggregator instantiates without cache', async () => {
  const agg = new RSSAggregator();
  assert.strictEqual(agg.cache, null);
});

test('RSSAggregator instantiates with cache', async () => {
  const fakeRedis = {
    async get() { return null; },
    async set() { return 'OK'; },
    async incr() { return 1; },
    async expire() { return 1; }
  };
  const agg = new RSSAggregator(fakeRedis, { ttlSeconds: 30 });
  assert.ok(agg.cache);
  assert.strictEqual(agg.ttl, 30);
});
