#!/usr/bin/env node
// Quick script to check API-Sports (primary) health via SportsAggregator
// Usage: set your env vars (API keys) and run: node ./scripts/check-live-health.js

import SportsAggregator from '../src/services/sports-aggregator.js';

(async () => {
  try {
    const agg = new SportsAggregator(null, {});
    const r = await agg.checkPrimaryProviderHealth();
    console.log('Primary provider health:', r);
    const healthy = await agg.isLiveFeedHealthy();
    console.log('isLiveFeedHealthy():', healthy);
    process.exit(0);
  } catch (e) {
    console.error('Health check failed:', e);
    process.exit(2);
  }
})();
