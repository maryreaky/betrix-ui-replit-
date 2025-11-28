/**
 * Startup Initializer for Betrix Bot
 * Fetches initial sports data from StatPal API on bot startup
 * Ensures feed is ready immediately when bot goes live
 */

import StatPalService from './statpal-service.js';
import MultiSportHandler from './multi-sport-handler.js';
import { CONFIG } from '../config.js';

class StartupInitializer {
  constructor(redis = null) {
    this.redis = redis;
    this.statpal = new StatPalService(redis);
    this.multiSport = new MultiSportHandler(redis);
    this.initialized = false;
    this.lastInitTime = null;
    this.sportData = {};
  }

  /**
   * Initialize bot with fresh data from StatPal API
   * Runs once on startup and caches all priority sports data
   */
  async initialize() {
    if (this.initialized) {
      console.log('🤖 [Startup] Already initialized, skipping reinit');
      return this.sportData;
    }

    console.log('🤖 [Startup] Starting initialization...');

    // Check if StatPal is enabled
    if (!CONFIG.STATPAL.ENABLED || !CONFIG.STATPAL.KEY) {
      console.warn('⚠️  [Startup] StatPal API not configured (STATPAL_API env var), using fallback providers');
      return {};
    }

    try {
      // Run health check first
      const healthOk = await this._healthCheck();
      if (!healthOk) {
        console.warn('⚠️  [Startup] StatPal health check failed, will retry on first request');
        return {};
      }

      // Fetch priority sports data
      const prioritySports = CONFIG.STARTUP.PRIORITY_SPORTS || ['soccer', 'nfl', 'nba', 'cricket', 'tennis'];
      console.log(`📡 [Startup] Fetching data for priority sports: ${prioritySports.join(', ')}`);

      const fetchPromises = prioritySports.map(sport => this._fetchSportData(sport));
      const results = await Promise.allSettled(fetchPromises);

      // Process results
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < results.length; i++) {
        const sport = prioritySports[i];
        const result = results[i];

        if (result.status === 'fulfilled' && result.value) {
          this.sportData[sport] = result.value;
          successCount++;
          console.log(`✅ [Startup] ${sport}: ${result.value.length || 0} items cached`);

          // Store in Redis for quick access
          if (this.redis) {
            try {
              await this.redis.setex(
                `startup:${sport}`,
                300, // 5 minutes cache
                JSON.stringify(result.value)
              );
            } catch (e) {
              console.warn(`⚠️  [Startup] Could not cache ${sport} in Redis:`, e.message);
            }
          }
        } else {
          failureCount++;
          console.warn(`❌ [Startup] ${sport}: ${result.reason?.message || 'unknown error'}`);
        }
      }

      // Log summary
      console.log(`
🎯 [Startup] Initialization Complete
   ✅ Loaded: ${successCount} sports
   ❌ Failed: ${failureCount} sports
   📦 Total items: ${Object.values(this.sportData).flat().length}
   🕐 Time: ${Date.now() - this.lastInitTime}ms
      `);

      this.initialized = true;
      this.lastInitTime = Date.now();
      return this.sportData;

    } catch (error) {
      console.error('❌ [Startup] Initialization failed:', error.message);
      console.error('Stack:', error.stack);
      return {};
    }
  }

  /**
   * Health check before initialization
   */
  async _healthCheck() {
    try {
      console.log('🏥 [Startup] Running StatPal health check...');
      const health = await this.statpal.healthCheck();
      
      if (health) {
        console.log('✅ [Startup] StatPal API is healthy');
        return true;
      } else {
        console.warn('⚠️  [Startup] StatPal API health check inconclusive');
        return false;
      }
    } catch (error) {
      console.error('❌ [Startup] Health check error:', error.message);
      return false;
    }
  }

  /**
   * Fetch live data for a specific sport
   */
  async _fetchSportData(sport) {
    try {
      console.log(`📡 [Startup] Fetching ${sport}...`);
      const data = await this.statpal.getLiveScores(sport, CONFIG.STATPAL.V1);
      
      if (!data) {
        console.warn(`⚠️  [Startup] No data returned for ${sport}`);
        return [];
      }

      // Return data as array
      return Array.isArray(data) ? data : [data];

    } catch (error) {
      console.error(`❌ [Startup] Error fetching ${sport}:`, error.message);
      throw error;
    }
  }

  /**
   * Get cached data for a sport
   */
  getSpportData(sport) {
    return this.sportData[sport] || null;
  }

  /**
   * Get all cached data
   */
  getAllData() {
    return this.sportData;
  }

  /**
   * Check if initialization was successful
   */
  isReady() {
    return this.initialized && Object.keys(this.sportData).length > 0;
  }

  /**
   * Get initialization status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      ready: this.isReady(),
      sports: Object.keys(this.sportData),
      totalItems: Object.values(this.sportData).flat().length,
      timestamp: this.lastInitTime,
      uptime: this.lastInitTime ? Date.now() - this.lastInitTime : 0,
    };
  }
}

export default StartupInitializer;
