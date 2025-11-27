/**
 * Goal.com Odds & Matches Scraper (Public, No API Key Required)
 * Fetches live match data and odds from Goal.com using Cheerio
 */

import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('GoalScraper');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15'
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': pickUserAgent() },
        timeout: 8000
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      logger.warn(`Fetch attempt ${i+1} failed for ${url}: ${e.message}`);
      if (i + 1 === attempts) return null;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 300));
    }
  }
  return null;
}

/**
 * Scrape Goal.com homepage for live matches and basic odds
 * Returns array of matches with team names, scores, odds (if visible)
 */
export async function getLiveMatchesFromGoal(league = 'premier-league') {
  try {
    // Goal.com structure: /fixtures/[league]/ shows live/upcoming fixtures with basic odds
    const url = `https://www.goal.com/en/fixtures/${league}`;
    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const matches = [];

    // Selector varies; Goal uses complex React structure, try common patterns
    // Look for match containers (this is a fragile selector, may need updates if Goal redesigns)
    $('[data-testid="fixture-card"], .fixture-card, [class*="FixtureCard"]').each((i, elem) => {
      try {
        const $card = $(elem);
        
        // Try to extract team names
        const homeTeam = $card.find('[class*="homeTeam"], [data-testid*="home"]').text().trim() ||
                        $card.find('span').first().text().trim();
        const awayTeam = $card.find('[class*="awayTeam"], [data-testid*="away"]').text().trim() ||
                        $card.find('span').last().text().trim();
        
        // Try to extract score (may be missing for upcoming)
        const scoreText = $card.find('[class*="score"]').text().trim();
        const scoreParts = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
        
        // Try to extract odds (Goal shows odds in cards)
        const oddsText = $card.find('[class*="odd"], [data-testid*="odd"]').text().trim();
        
        if (homeTeam && awayTeam) {
          matches.push({
            home: homeTeam,
            away: awayTeam,
            score: scoreParts ? { home: Number(scoreParts[1]), away: Number(scoreParts[2]) } : null,
            odds: oddsText ? { raw: oddsText } : null,
            source: 'goal.com',
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.debug(`Failed to parse Goal match card: ${e.message}`);
      }
    });

    logger.info(`Scraped ${matches.length} matches from Goal.com`);
    return matches;
  } catch (e) {
    logger.error('Failed to scrape Goal.com', e.message);
    return [];
  }
}

/**
 * Get popular league codes for Goal.com
 */
export function getGoalLeagueCodes() {
  return {
    'premier-league': 'Premier League',
    'la-liga': 'La Liga',
    'serie-a': 'Serie A',
    'bundesliga': 'Bundesliga',
    'ligue-1': 'Ligue 1',
    'champions-league': 'Champions League',
    'europa-league': 'Europa League',
    'fa-cup': 'FA Cup',
    'english-football-league': 'EFL Championship'
  };
}

/**
 * Fetch odds comparison page (simplified)
 * Goal typically embeds odds from multiple providers
 */
export async function getGoalOdds(matchId = null) {
  try {
    // Generic odds page; Goal updates dynamically, this is best-effort
    const url = 'https://www.goal.com/en/odds';
    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const odds = [];

    $('[class*="odd"], [data-testid*="odd"]').each((i, elem) => {
      try {
        const text = $(elem).text().trim();
        if (text.match(/[\d.]+/)) {
          odds.push({ value: text, provider: 'goal.com' });
        }
      } catch (e) {
        // skip unparseable
      }
    });

    return odds.slice(0, 10); // Return top 10
  } catch (e) {
    logger.error('Failed to fetch Goal odds', e.message);
    return [];
  }
}

export default {
  getLiveMatchesFromGoal,
  getGoalLeagueCodes,
  getGoalOdds
};
