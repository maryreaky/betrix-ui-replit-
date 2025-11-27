/**
 * Terms of Service & Data Source Disclaimers
 * Manages provider disclaimers and rate-limiting compliance headers
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('ToSCompliance');

// Data source disclaimers
export const DATA_DISCLAIMERS = {
  goal: {
    provider: 'Goal.com',
    disclaimer: '⚠️ Data sourced from Goal.com (public web scraping). Goal.com is a third-party service. Please verify critical information directly on Goal.com. BETRIX is not affiliated with Goal.com.',
    tos: 'https://www.goal.com/en/terms-of-use',
    rateLimit: '500ms per domain',
    accuracy: 'No guarantee'
  },
  flashscore: {
    provider: 'Flashscore.com',
    disclaimer: '⚠️ Data sourced from Flashscore.com (public web scraping). Flashscore.com is a third-party service. Please verify critical information directly on Flashscore.com. BETRIX is not affiliated with Flashscore.com.',
    tos: 'https://www.flashscore.com/en/terms-and-conditions/',
    rateLimit: '500ms per domain',
    accuracy: 'No guarantee'
  },
  oddschecker: {
    provider: 'Oddschecker.com',
    disclaimer: '⚠️ Odds sourced from Oddschecker.com (public web scraping). Oddschecker.com is a third-party service. Odds are for reference only and may not reflect live market prices. BETRIX is not affiliated with Oddschecker.com.',
    tos: 'https://www.oddschecker.com/terms-and-conditions',
    rateLimit: '1s per request',
    accuracy: 'No real-time guarantee'
  },
  betfair: {
    provider: 'Betfair.com',
    disclaimer: '⚠️ Exchange odds sourced from Betfair.com (public web scraping). Betfair.com is a third-party service. Exchange odds may differ from bookmaker odds. BETRIX is not affiliated with Betfair.com.',
    tos: 'https://www.betfair.com/termsandconditions',
    rateLimit: '1s per request',
    accuracy: 'Exchange prices may change rapidly'
  },
  espn: {
    provider: 'ESPN',
    disclaimer: '✅ Data sourced from ESPN public API. ESPN is a trusted sports data provider.',
    tos: 'https://www.espn.com/terms',
    rateLimit: 'Public API',
    accuracy: 'High'
  }
};

/**
 * Get disclaimer for a data source
 */
export function getDisclaimer(provider) {
  const disc = DATA_DISCLAIMERS[provider.toLowerCase()] || DATA_DISCLAIMERS.goal;
  return disc;
}

/**
 * Format disclaimer for Telegram display
 */
export function formatDisclaimerForTelegram(provider) {
  const disc = getDisclaimer(provider);
  
  let text = `📋 *DATA SOURCE: ${disc.provider}*\n\n`;
  text += `${disc.disclaimer}\n\n`;
  text += `🔗 Terms: ${disc.tos}\n`;
  text += `⏱️ Rate Limit: ${disc.rateLimit}\n`;
  text += `✓ Accuracy: ${disc.accuracy}\n`;
  
  return text;
}

/**
 * Generate rate-limiting response headers for scrapers
 */
export function generateRateLimitHeaders(provider) {
  const disc = getDisclaimer(provider);
  const headers = {
    'X-RateLimit-Provider': disc.provider,
    'X-RateLimit-Interval-Ms': extractRateLimitMs(disc.rateLimit),
    'X-Data-Source-Disclaimer': disc.disclaimer.substring(0, 100) + '...',
    'Cache-Control': 'public, max-age=300' // 5 minute cache
  };
  
  return headers;
}

/**
 * Extract milliseconds from rate limit string
 */
function extractRateLimitMs(rateLimitStr) {
  if (!rateLimitStr) return '500';
  
  const match = rateLimitStr.match(/(\d+)/);
  if (match && rateLimitStr.includes('s')) {
    return String(Number(match[1]) * 1000);
  }
  if (match && rateLimitStr.includes('ms')) {
    return match[1];
  }
  
  return '500';
}

/**
 * Log scraper access with ToS compliance info
 */
export function logScraperAccess(provider, endpoint, userId = null) {
  const disc = getDisclaimer(provider);
  
  logger.info(`[ToS Compliance] Scraper access: ${provider} → ${endpoint}`, {
    provider: disc.provider,
    rateLimit: disc.rateLimit,
    userId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Validate scraper request against rate limits
 */
export async function validateScraperRateLimit(provider, lastRequestTime = null) {
  const disc = getDisclaimer(provider);
  const rateLimitMs = Number(extractRateLimitMs(disc.rateLimit));
  
  if (!lastRequestTime) return { valid: true, delay: 0 };
  
  const now = Date.now();
  const delta = now - lastRequestTime;
  
  if (delta < rateLimitMs) {
    const delay = rateLimitMs - delta;
    logger.warn(`[RateLimit] ${disc.provider} rate limit: need to wait ${delay}ms`);
    return { valid: false, delay };
  }
  
  return { valid: true, delay: 0 };
}

export default {
  DATA_DISCLAIMERS,
  getDisclaimer,
  formatDisclaimerForTelegram,
  generateRateLimitHeaders,
  logScraperAccess,
  validateScraperRateLimit
};
