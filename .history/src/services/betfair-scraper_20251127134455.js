/**
 * Betfair Public Odds Scraper (Public, No API Key Required)
 * Fetches odds from Betfair exchange without registration
 */

import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('BetfairScraper');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15'
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.betfair.com'
        },
        timeout: 12000
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      logger.warn(`Fetch attempt ${i+1} failed for ${url}: ${e.message}`);
      if (i + 1 === attempts) return null;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 500));
    }
  }
  return null;
}

/**
 * Try to scrape Betfair's public exchange odds
 * Note: Betfair heavily uses JS; this is HTML fallback
 */
export async function getBetfairExchangeOdds(eventId = null) {
  try {
    // Betfair URL structure: /exchange/football/
    const url = eventId 
      ? `https://www.betfair.com/exchange/football/event/${eventId}`
      : 'https://www.betfair.com/exchange/football/';

    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const odds = [];

    // Betfair odds displayed in exchange format: back/lay odds
    // Look for market rows
    $('[class*="runner"], [class*="market-row"], [data-testid*="selection"]').each((i, elem) => {
      try {
        const $elem = $(elem);
        const name = $elem.find('[class*="name"], [class*="runner-name"]').text().trim();
        
        // Extract back odds (first price)
        const backOdds = $elem.find('[class*="back"], [class*="price"]').first().text().trim();
        // Extract lay odds (second price)
        const layOdds = $elem.find('[class*="lay"], [class*="price"]').last().text().trim();
        
        const backVal = parseFloat(backOdds);
        const layVal = parseFloat(layOdds);
        
        if (name && (!isNaN(backVal) || !isNaN(layVal))) {
          odds.push({
            runner: name,
            backOdds: isNaN(backVal) ? null : backVal,
            layOdds: isNaN(layVal) ? null : layVal,
            spread: isNaN(backVal) || isNaN(layVal) ? null : layVal - backVal,
            source: 'betfair.com',
            exchangeType: 'back-lay',
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.debug(`Parse error: ${e.message}`);
      }
    });

    logger.info(`Found ${odds.length} exchange odds from Betfair`);
    return odds;
  } catch (e) {
    logger.error('Betfair scraper failed', e.message);
    return [];
  }
}

/**
 * Find best back odds (lowest lay-back spread)
 */
export async function getBetfairBestOdds(eventId = null) {
  try {
    const allOdds = await getBetfairExchangeOdds(eventId);
    if (allOdds.length === 0) return null;

    // Sort by spread (smallest spread = best odds)
    allOdds.sort((a, b) => {
      const spreadA = a.spread || Infinity;
      const spreadB = b.spread || Infinity;
      return spreadA - spreadB;
    });

    return allOdds[0] || null;
  } catch (e) {
    logger.error('Failed to find best Betfair odds', e.message);
    return null;
  }
}

/**
 * Get live markets from Betfair
 */
export async function getBetfairLiveMarkets() {
  try {
    const url = 'https://www.betfair.com/exchange/football/';
    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const markets = [];

    // Find market sections
    $('[class*="market"], [class*="competition"]').each((i, elem) => {
      try {
        const $market = $(elem);
        const marketName = $market.find('[class*="title"], h2, h3').text().trim();
        const eventCount = $market.find('[class*="event"], [class*="runner"]').length;

        if (marketName && eventCount > 0) {
          markets.push({
            name: marketName,
            eventCount,
            source: 'betfair.com',
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.debug(`Market parse error: ${e.message}`);
      }
    });

    logger.info(`Found ${markets.length} live markets on Betfair`);
    return markets;
  } catch (e) {
    logger.error('Failed to fetch Betfair live markets', e.message);
    return [];
  }
}

/**
 * Format exchange odds for display
 */
export function formatBetfairOdds(odds) {
  if (!odds) return null;

  return {
    runner: odds.runner,
    backOdds: odds.backOdds ? odds.backOdds.toFixed(2) : 'N/A',
    layOdds: odds.layOdds ? odds.layOdds.toFixed(2) : 'N/A',
    spread: odds.spread ? odds.spread.toFixed(2) : 'N/A',
    recommendation: odds.spread && odds.spread < 0.05 ? '✅ Tight spread - good odds' : '⚠️ Wide spread',
    source: 'betfair.com'
  };
}

export default {
  getBetfairExchangeOdds,
  getBetfairBestOdds,
  getBetfairLiveMarkets,
  formatBetfairOdds
};
