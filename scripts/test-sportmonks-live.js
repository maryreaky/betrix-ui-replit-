#!/usr/bin/env node
/**
 * Test SportMonks live feed through handler
 */

import Redis from 'ioredis';
import { CONFIG } from '../src/config.js';
import SportsAggregator from '../src/services/sports-aggregator.js';
import v2Handler from '../src/handlers/telegram-handler-v2-clean.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('TestSportMonksLive');

(async () => {
  const redis = new Redis(CONFIG.REDIS_URL);
  
  try {
    const aggregator = new SportsAggregator(redis);
    
    logger.info('Testing SportMonks live feed...');
    
    // Test direct aggregator call
    logger.info('🔍 Fetching from SportMonks service...');
    const live = await aggregator._getLiveFromSportsMonks('football');
    logger.info(`✅ SportMonks returned ${Array.isArray(live) ? live.length : 0} matches`);
    if (Array.isArray(live) && live.length > 0) {
      logger.info('Sample match:', live[0]);
    }
    
    // Test handler /live command
    logger.info('\n🔍 Testing handler /live command...');
    const update = { message: { chat: { id: 123 }, from: { id: 456 }, text: '/live' } };
    const result = await v2Handler.handleMessage(update, redis, { sportsAggregator: aggregator });
    
    if (result) {
      logger.info('✅ Handler response:', {
        method: result.method,
        chat_id: result.chat_id,
        text_preview: result.text ? result.text.substring(0, 100) : 'none',
        has_keyboard: !!result.reply_markup
      });
    } else {
      logger.warn('❌ Handler returned null');
    }
    
  } catch (e) {
    logger.error('Test failed:', e.message || e);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
})();
