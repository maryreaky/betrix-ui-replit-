/**
 * Flashscore Enhanced Scraper with Puppeteer JavaScript Rendering
 * Fetches detailed match data, live scores, and statistics
 */

import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('FlashscoreEnhanced');

// Try to import Puppeteer (optional - falls back to HTML scraping if not available)
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
  logger.info('✅ Puppeteer available for JS rendering');
} catch (e) {
  logger.warn('⚠️ Puppeteer not installed; will use HTML-only fallback');
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Simple browser pool for Puppeteer (max 3 instances)
let browserInstance = null;
const MAX_BROWSER_INSTANCES = 1;
let browserCount = 0;

async function getBrowser() {
  if (!puppeteer) return null;
  
  try {
    if (!browserInstance) {
      browserInstance = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      browserCount = 1;
    }
    return browserInstance;
  } catch (e) {
    logger.warn('Failed to launch browser:', e.message);
    return null;
  }
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      browserInstance = null;
      browserCount = 0;
    } catch (e) {
      logger.warn('Error closing browser:', e.message);
    }
  }
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': pickUserAgent() },
        timeout: 10000
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      logger.warn(`Fetch attempt ${i+1} failed for ${url}: ${e.message}`);
      if (i + 1 === attempts) return null;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 400));
    }
  }
  return null;
}

/**
 * Render Flashscore page with Puppeteer (JS-rendered content)
 * Falls back to HTML if Puppeteer unavailable
 */
async function renderFlashscorePage(url, waitSelector = '[class*="event__"]', timeoutMs = 10000) {
  if (!puppeteer || !browserInstance) {
    // Fallback to HTML scraping
    logger.debug(`Puppeteer unavailable; falling back to HTML scraping for ${url}`);
    return await fetchWithRetry(url);
  }

  try {
    const browser = await getBrowser();
    if (!browser) return await fetchWithRetry(url);

    const page = await browser.newPage();
    await page.setUserAgent(pickUserAgent());
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
      
      // Wait for match elements to load
      try {
        await page.waitForSelector(waitSelector, { timeout: 3000 });
      } catch (e) {
        logger.warn(`Selector ${waitSelector} not found within 3s, proceeding with available content`);
      }

      const content = await page.content();
      return content;
    } finally {
      await page.close();
    }
  } catch (e) {
    logger.warn(`Puppeteer rendering failed for ${url}: ${e.message}; falling back to HTML`);
    return await fetchWithRetry(url);
  }
}

/**
 * Get live matches with Puppeteer JS rendering for better accuracy
 */
export async function getLiveMatchesFlashscoreAdvanced(leagueId = '1', usePuppeteer = true) {
  try {
    const url = leagueId === '1' 
      ? 'https://www.flashscore.com/'
      : `https://www.flashscore.com/soccer/${leagueId}/`;

    let html;
    if (usePuppeteer && puppeteer) {
      html = await renderFlashscorePage(url, '[class*="event__"]');
    } else {
      html = await fetchWithRetry(url);
    }

    if (!html) return [];

    const $ = cheerioLoad(html);
    const matches = [];

    // Enhanced selectors for Flashscore
    const matchSelectors = [
      '[class*="event__match"]',
      '[class*="event__row"]',
      '[data-testid*="match"]',
      '.event__row'
    ];

    let found = false;
    for (const selector of matchSelectors) {
      $(selector).slice(0, 25).each((i, elem) => {
        try {
          const $row = $(elem);
          
          // Extract teams
          const teamText = $row.text();
          const teamMatch = teamText.match(/^([^–-]+?)\s*(?:–|-)\s*(.+?)$/);
          
          if (!teamMatch) return;
          const homeTeam = teamMatch[1].trim();
          const awayTeam = teamMatch[2].trim();
          
          // Extract score
          const scoreText = $row.find('[class*="score"]').text().trim();
          const scoreParts = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
          
          // Extract time/status
          const timeText = $row.find('[class*="time"]').text().trim();
          
          if (homeTeam && awayTeam && homeTeam.length > 2) {
            matches.push({
              home: homeTeam,
              away: awayTeam,
              score: scoreParts ? { home: Number(scoreParts[1]), away: Number(scoreParts[2]) } : null,
              status: scoreParts ? 'LIVE' : 'SCHEDULED',
              time: timeText || null,
              league: leagueId,
              source: 'flashscore.com',
              rendered: usePuppeteer && puppeteer ? true : false,
              scrapedAt: new Date().toISOString()
            });
            found = true;
          }
        } catch (e) {
          logger.debug(`Parse error: ${e.message}`);
        }
      });

      if (found && matches.length > 0) break;
    }

    logger.info(`Scraped ${matches.length} matches from Flashscore${usePuppeteer ? ' (Puppeteer)' : ' (HTML)'}`);
    return matches;
  } catch (e) {
    logger.error('Flashscore advanced scraping failed', e.message);
    return [];
  }
}

/**
 * Get detailed match statistics with Puppeteer rendering
 */
export async function getFlashscoreMatchDetailsAdvanced(matchId) {
  try {
    const url = `https://www.flashscore.com/match/${matchId}/`;
    const html = puppeteer 
      ? await renderFlashscorePage(url, '[class*="stat"]')
      : await fetchWithRetry(url);

    if (!html) return null;

    const $ = cheerioLoad(html);
    
    // Extract teams and score
    const homeTeam = $('[class*="homeTeam__name"], [class*="home"]').first().text().trim();
    const awayTeam = $('[class*="awayTeam__name"], [class*="away"]').first().text().trim();
    const scoreHome = $('[class*="homeScore"], [class*="score"]').first().text().trim();
    const scoreAway = $('[class*="awayScore"], [class*="score"]').last().text().trim();
    const status = $('[class*="matchStatus"], [class*="status"]').text().trim();
    
    // Extract statistics
    const stats = {
      possession: {},
      shots: {},
      passes: {},
      fouls: {},
      corners: {},
      yellowCards: {},
      redCards: {}
    };

    $('[class*="stat"]').each((i, elem) => {
      try {
        const $row = $(elem);
        const statName = $row.find('[class*="stat__name"]').text().toLowerCase().trim();
        const homeVal = $row.find('[class*="stat__value"]').first().text().trim();
        const awayVal = $row.find('[class*="stat__value"]').last().text().trim();
        
        if (statName.includes('possess')) stats.possession = { home: homeVal, away: awayVal };
        else if (statName.includes('shot')) stats.shots = { home: homeVal, away: awayVal };
        else if (statName.includes('pass')) stats.passes = { home: homeVal, away: awayVal };
        else if (statName.includes('foul')) stats.fouls = { home: homeVal, away: awayVal };
        else if (statName.includes('corner')) stats.corners = { home: homeVal, away: awayVal };
        else if (statName.includes('yellow')) stats.yellowCards = { home: homeVal, away: awayVal };
        else if (statName.includes('red')) stats.redCards = { home: homeVal, away: awayVal };
      } catch (e) {
        // Skip unparseable stats
      }
    });

    return {
      matchId,
      home: homeTeam,
      away: awayTeam,
      score: { 
        home: scoreHome ? Number(scoreHome) : null, 
        away: scoreAway ? Number(scoreAway) : null 
      },
      status,
      stats,
      source: 'flashscore.com',
      rendered: puppeteer ? true : false,
      scrapedAt: new Date().toISOString()
    };
  } catch (e) {
    logger.error(`Failed to scrape Flashscore match ${matchId}`, e.message);
    return null;
  }
}

// Cleanup on exit
process.on('exit', async () => {
  await closeBrowser();
});

export default {
  getLiveMatchesFlashscoreAdvanced,
  getFlashscoreMatchDetailsAdvanced,
  closeBrowser
};
