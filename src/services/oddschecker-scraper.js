/**
 * Oddschecker Odds Scraper (Public, No API Key Required)
 * Fetches and compares odds from multiple bookmakers
 */

import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('OddscheckerScraper');

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
          'Referer': 'https://www.oddschecker.com'
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
 * Parse odds string to numeric format (e.g., "1.5" or "3/2" or "2-1")
 */
function parseOdds(oddsStr) {
  if (!oddsStr) return null;
  
  const clean = String(oddsStr).trim();
  
  // Decimal format (e.g., 1.5, 2.0)
  if (clean.match(/^\d+\.?\d*$/)) {
    return Number(clean);
  }
  
  // Fractional format (e.g., 3/2, 2-1)
  const fracMatch = clean.match(/(\d+)[/-](\d+)/);
  if (fracMatch) {
    const numerator = Number(fracMatch[1]);
    const denominator = Number(fracMatch[2]);
    return (numerator / denominator) + 1; // Convert to decimal odds
  }
  
  return null;
}

/**
 * Fetch odds comparison for a specific match
 */
export async function getOddscheckerOdds(homeTeam, awayTeam, league = 'premier-league') {
  try {
    // Build search URL - Oddschecker structure varies by region
    // Using generic football odds page as fallback
    const searchUrl = `https://www.oddschecker.com/football/${league}`;
    
    const html = await fetchWithRetry(searchUrl);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const odds = [];

    // Try multiple selectors for odds tables
    $('[class*="odds-table"], [class*="bet-odds"], table').each((tableIdx, table) => {
      const $table = $(table);
      
      // Look for rows with team names and odds
      $table.find('tr, [class*="bet-row"]').each((i, row) => {
        try {
          const $row = $(row);
          const rowText = $row.text();
          
          // Check if row contains our teams
          if (!rowText.includes(homeTeam) && !rowText.includes(awayTeam)) return;
          
          // Extract bookmaker name
          const bookmaker = $row.find('[class*="bookmaker"], td:first-child').text().trim().substring(0, 20);
          
          // Extract odds values
          const oddsElements = $row.find('[class*="odds"], td[class*="price"], td[data-odds]');
          const oddsValues = [];
          
          oddsElements.each((j, elem) => {
            const val = $(elem).text().trim();
            const parsed = parseOdds(val);
            if (parsed) oddsValues.push(parsed);
          });
          
          if (oddsValues.length >= 3) {
            odds.push({
              bookmaker: bookmaker || `Bookmaker ${tableIdx}-${i}`,
              homeWin: oddsValues[0],
              draw: oddsValues[1],
              awayWin: oddsValues[2],
              source: 'oddschecker.com',
              scrapedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          logger.debug(`Row parse error: ${e.message}`);
        }
      });
    });

    logger.info(`Found ${odds.length} odds from Oddschecker`);
    return odds;
  } catch (e) {
    logger.error('Oddschecker odds fetch failed', e.message);
    return [];
  }
}

/**
 * Get popular leagues on Oddschecker
 */
export function getOddscheckerLeagues() {
  return {
    'premier-league': 'Premier League',
    'championship': 'Championship',
    'la-liga': 'La Liga',
    'serie-a': 'Serie A',
    'bundesliga': 'Bundesliga',
    'ligue-1': 'Ligue 1',
    'champions-league': 'Champions League',
    'europa-league': 'Europa League'
  };
}

/**
 * Get best odds (highest) for a specific outcome
 */
export async function getBestOddscheckerOdds(homeTeam, awayTeam, outcome = 'homeWin', league = 'premier-league') {
  try {
    const allOdds = await getOddscheckerOdds(homeTeam, awayTeam, league);
    if (allOdds.length === 0) return null;

    // Find best (highest) odds for the outcome
    let best = null;
    for (const odd of allOdds) {
      const value = odd[outcome];
      if (!value) continue;
      
      if (!best || value > best.odds) {
        best = { bookmaker: odd.bookmaker, odds: value };
      }
    }

    return best;
  } catch (e) {
    logger.error('Failed to find best odds', e.message);
    return null;
  }
}

export default {
  getOddscheckerOdds,
  getOddscheckerLeagues,
  getBestOddscheckerOdds,
  parseOdds
};
