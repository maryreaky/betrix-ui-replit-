/**
 * Flashscore Live Scores Scraper (Public, No API Key Required)
 * Fetches live match data and scores from Flashscore using Cheerio
 * Note: Flashscore heavily uses JavaScript rendering; this is basic HTML fallback
 */

import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('FlashscoreScraper');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
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
          'Accept': 'text/html,application/xhtml+xml'
        },
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
 * Scrape Flashscore for live matches (requires JavaScript rendering for best results)
 * Fallback: parse static HTML elements
 */
export async function getLiveMatchesFromFlashscore(sport = 'soccer') {
  try {
    // Flashscore main page; typically has live matches
    const url = 'https://www.flashscore.com/';
    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const matches = [];

    // Flashscore structure: match rows with class patterns like 'event__match', 'event__row'
    // This selector varies based on Flashscore's layout
    $('[class*="event__match"], [class*="event__row"], [data-testid*="match"]').slice(0, 20).each((i, elem) => {
      try {
        const $row = $(elem);
        
        // Extract team names from nested elements
        const teams = $row.find('[class*="eventText"], span').text().trim();
        const teamMatch = teams.match(/^([^–-]+?)\s*(?:–|-)\s*(.+?)$/);
        
        if (!teamMatch) return;
        const homeTeam = teamMatch[1].trim();
        const awayTeam = teamMatch[2].trim();
        
        // Extract score (pattern: "1 - 2" or "1–2")
        const scoreText = $row.find('[class*="score"]').text().trim();
        const scoreParts = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
        
        // Extract match time/status
        const timeText = $row.find('[class*="time"]').text().trim();
        
        if (homeTeam && awayTeam) {
          matches.push({
            home: homeTeam,
            away: awayTeam,
            score: scoreParts ? { home: Number(scoreParts[1]), away: Number(scoreParts[2]) } : null,
            status: scoreText ? 'LIVE' : 'SCHEDULED',
            time: timeText || null,
            source: 'flashscore.com',
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.debug(`Failed to parse Flashscore match: ${e.message}`);
      }
    });

    logger.info(`Scraped ${matches.length} matches from Flashscore`);
    return matches;
  } catch (e) {
    logger.error('Failed to scrape Flashscore', e.message);
    return [];
  }
}

/**
 * Scrape Flashscore for specific league live matches
 */
export async function getLiveMatchesByLeagueFromFlashscore(leagueId = '1') {
  // leagueId: '1' = Livescore, '17' = Premier League, '87' = La Liga, '106' = Serie A, etc.
  try {
    // Flashscore uses numeric league IDs
    const url = `https://www.flashscore.com/soccer/${leagueId}/`;
    const html = await fetchWithRetry(url);
    if (!html) return [];

    const $ = cheerioLoad(html);
    const matches = [];

    // Similar parsing as generic live matches
    $('[class*="event__match"], [class*="event__row"]').slice(0, 30).each((i, elem) => {
      try {
        const $row = $(elem);
        const teams = $row.find('[class*="eventText"]').text().trim();
        const scoreText = $row.find('[class*="score"]').text().trim();
        
        const teamMatch = teams.match(/^([^–-]+?)\s*(?:–|-)\s*(.+?)$/);
        const scoreParts = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
        
        if (teamMatch) {
          matches.push({
            home: teamMatch[1].trim(),
            away: teamMatch[2].trim(),
            score: scoreParts ? { home: Number(scoreParts[1]), away: Number(scoreParts[2]) } : null,
            status: scoreParts ? 'LIVE' : 'SCHEDULED',
            league: leagueId,
            source: 'flashscore.com',
            scrapedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        logger.debug(`Parse error: ${e.message}`);
      }
    });

    return matches;
  } catch (e) {
    logger.error(`Failed to scrape Flashscore league ${leagueId}`, e.message);
    return [];
  }
}

/**
 * Popular Flashscore league IDs for easy reference
 */
export function getFlashscoreLeagueIds() {
  return {
    '1': 'Livescore (All Sports)',
    '17': 'Premier League',
    '87': 'La Liga',
    '106': 'Serie A',
    '34': 'Bundesliga',
    '53': 'Ligue 1',
    '679': 'UEFA Champions League',
    '738': 'UEFA Europa League',
    '4': 'FA Cup',
    '6': 'EFL Cup'
  };
}

/**
 * Scrape match details from a specific Flashscore match page
 */
export async function getFlashscoreMatchDetails(matchId) {
  try {
    const url = `https://www.flashscore.com/match/${matchId}/`;
    const html = await fetchWithRetry(url);
    if (!html) return null;

    const $ = cheerioLoad(html);
    
    // Extract detailed match info
    const homeTeam = $('[class*="homeTeam__name"]').text().trim();
    const awayTeam = $('[class*="awayTeam__name"]').text().trim();
    const scoreHome = $('[class*="homeScore"]').text().trim();
    const scoreAway = $('[class*="awayScore"]').text().trim();
    const status = $('[class*="matchStatus"]').text().trim();
    
    // Try to extract stats if available
    const stats = {};
    $('[class*="stat__row"]').each((i, elem) => {
      const $row = $(elem);
      const statName = $row.find('[class*="stat__name"]').text().trim();
      const homeVal = $row.find('[class*="stat__value"]').first().text().trim();
      const awayVal = $row.find('[class*="stat__value"]').last().text().trim();
      if (statName) stats[statName] = { home: homeVal, away: awayVal };
    });

    return {
      matchId,
      home: homeTeam,
      away: awayTeam,
      score: { home: Number(scoreHome) || null, away: Number(scoreAway) || null },
      status,
      stats,
      source: 'flashscore.com',
      scrapedAt: new Date().toISOString()
    };
  } catch (e) {
    logger.error(`Failed to scrape Flashscore match ${matchId}`, e.message);
    return null;
  }
}

export default {
  getLiveMatchesFromFlashscore,
  getLiveMatchesByLeagueFromFlashscore,
  getFlashscoreLeagueIds,
  getFlashscoreMatchDetails
};
