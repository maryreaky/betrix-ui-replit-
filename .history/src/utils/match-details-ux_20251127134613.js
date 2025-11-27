/**
 * Match Details UX Enhancements
 * Adds odds comparison button, live refresh counter, and bet slip features
 */

import { Logger } from '../utils/logger.js';
import { compareOdds, formatOddsComparison } from './odds-normalizer.js';

const logger = new Logger('MatchDetailsUX');

// Track refresh requests per match/user
const refreshTracker = new Map();
const MAX_REFRESHES_PER_MINUTE = 5;

/**
 * Check if user can request a refresh
 */
export function canRefreshMatch(userId, matchId) {
  const key = `${userId}:${matchId}`;
  const now = Date.now();
  
  if (!refreshTracker.has(key)) {
    refreshTracker.set(key, []);
  }
  
  const times = refreshTracker.get(key);
  
  // Remove old requests (older than 1 minute)
  const oneMinuteAgo = now - 60000;
  const recent = times.filter(t => t > oneMinuteAgo);
  
  if (recent.length >= MAX_REFRESHES_PER_MINUTE) {
    const nextAvailable = recent[0] + 60000;
    return {
      allowed: false,
      message: `⏳ Too many refreshes. Try again in ${Math.ceil((nextAvailable - now) / 1000)}s`,
      secsUntilReset: Math.ceil((nextAvailable - now) / 1000)
    };
  }
  
  recent.push(now);
  refreshTracker.set(key, recent);
  
  return { allowed: true, message: '✅ Refreshing live data...' };
}

/**
 * Format match details with odds comparison button
 */
export function formatMatchDetailsWithOdds(match, oddsData = null) {
  let text = `⚽ *${match.home}* vs *${match.away}*\n\n`;
  
  if (match.score) {
    text += `📊 *Score:* ${match.score.home || '-'} - ${match.score.away || '-'}\n`;
  }
  
  if (match.status) {
    text += `🔴 *Status:* ${match.status}\n`;
  }
  
  if (match.time) {
    text += `⏱️ *Time:* ${match.time}\n`;
  }
  
  if (match.possession) {
    text += `\n⚙️ *Possession:*\n`;
    text += `${match.home}: ${match.possession.home || 'N/A'}%\n`;
    text += `${match.away}: ${match.possession.away || 'N/A'}%\n`;
  }
  
  if (match.stats) {
    text += `\n📈 *Statistics:*\n`;
    text += `🎯 Shots: ${match.stats.shots?.home || 0} - ${match.stats.shots?.away || 0}\n`;
    text += `🚫 Fouls: ${match.stats.fouls?.home || 0} - ${match.stats.fouls?.away || 0}\n`;
    text += `🟨 Yellow: ${match.stats.yellowCards?.home || 0} - ${match.stats.yellowCards?.away || 0}\n`;
  }
  
  if (oddsData) {
    text += `\n💰 *Available Odds:*\n`;
    text += `Click below to compare odds from multiple bookmakers\n`;
  }
  
  text += `\n_Last updated: ${new Date().toLocaleTimeString()}_`;
  
  return text;
}

/**
 * Generate inline keyboard for match details
 */
export function generateMatchDetailsKeyboard(matchId, userId, hasOdds = false, oddsCount = 0) {
  const keyboard = [];
  
  // Live refresh button
  keyboard.push([
    { 
      text: '🔄 Live Refresh', 
      callback_data: `match_refresh_${matchId}` 
    },
    { 
      text: '⭐ Add to Favorites', 
      callback_data: `match_fav_${matchId}` 
    }
  ]);
  
  // Odds comparison button (if odds available)
  if (hasOdds && oddsCount > 0) {
    keyboard.push([
      { 
        text: `💰 Compare Odds (${oddsCount})`, 
        callback_data: `match_odds_${matchId}` 
      }
    ]);
  }
  
  // Create bet slip button
  keyboard.push([
    { 
      text: '🎟️ Add to Bet Slip', 
      callback_data: `betslip_add_${matchId}` 
    }
  ]);
  
  // Back button
  keyboard.push([
    { 
      text: '🔙 Back to Live', 
      callback_data: 'menu_live' 
    }
  ]);
  
  return { inline_keyboard: keyboard };
}

/**
 * Build odds comparison display
 */
export function buildOddsComparisonDisplay(oddsData, matchId) {
  if (!oddsData || !oddsData.all || oddsData.all.length === 0) {
    return '❌ No odds available for this match';
  }
  
  let text = `💰 *Odds Comparison: Match ${matchId}*\n\n`;
  
  if (oddsData.best) {
    text += `✅ *Best Odds:*\n`;
    text += `${oddsData.best.bookmaker}: ${oddsData.best.odds}\n\n`;
  }
  
  text += `📊 *All Available:*\n`;
  
  oddsData.all.forEach((odd, idx) => {
    const bookmaker = odd.bookmaker || odd.source || `Bookmaker ${idx + 1}`;
    const odds = odd.decimalOdds ? odd.decimalOdds.toFixed(2) : 'N/A';
    text += `${idx + 1}. ${bookmaker}: ${odds}\n`;
  });
  
  if (oddsData.avg) {
    text += `\n📈 *Average:* ${oddsData.avg}\n`;
  }
  
  text += `\n_Note: Compare and place bets on your preferred platform_`;
  
  return text;
}

/**
 * Format live refresh counter with visual progress
 */
export function formatRefreshProgress(seconds) {
  const bars = Math.ceil((5 - seconds) / 5 * 5);
  const emptyBars = 5 - bars;
  
  const progress = '█'.repeat(bars) + '░'.repeat(emptyBars);
  
  return `${progress} ${seconds}s`;
}

/**
 * Generate match update notification
 */
export function generateMatchUpdateNotification(oldMatch, newMatch) {
  const updates = [];
  
  // Score change
  if (oldMatch.score && newMatch.score) {
    if (oldMatch.score.home !== newMatch.score.home || oldMatch.score.away !== newMatch.score.away) {
      updates.push(`⚽ GOAL! Score changed: ${oldMatch.score.home}-${oldMatch.score.away} → ${newMatch.score.home}-${newMatch.score.away}`);
    }
  }
  
  // Status change
  if (oldMatch.status !== newMatch.status) {
    updates.push(`🔔 Status: ${newMatch.status}`);
  }
  
  // Cards
  if (oldMatch.stats?.yellowCards && newMatch.stats?.yellowCards) {
    const oldYellow = oldMatch.stats.yellowCards.home + oldMatch.stats.yellowCards.away;
    const newYellow = newMatch.stats.yellowCards.home + newMatch.stats.yellowCards.away;
    if (oldYellow < newYellow) {
      updates.push(`🟨 Yellow card issued`);
    }
  }
  
  if (!updates.length) {
    updates.push('📊 Match updated - no major changes');
  }
  
  let text = `🔄 *${newMatch.home}* vs *${newMatch.away}* - Live Update\n\n`;
  updates.forEach(u => text += `${u}\n`);
  
  return text;
}

/**
 * Track and display refresh count for user
 */
export function getRefreshStats(userId, matchId) {
  const key = `${userId}:${matchId}`;
  const times = refreshTracker.get(key) || [];
  
  const oneMinuteAgo = Date.now() - 60000;
  const recent = times.filter(t => t > oneMinuteAgo);
  
  return {
    total: recent.length,
    remaining: MAX_REFRESHES_PER_MINUTE - recent.length,
    maxPerMinute: MAX_REFRESHES_PER_MINUTE
  };
}

/**
 * Format stats for display
 */
export function formatRefreshStats(stats) {
  return `Refreshes: ${stats.total}/${stats.maxPerMinute}`;
}

export default {
  canRefreshMatch,
  formatMatchDetailsWithOdds,
  generateMatchDetailsKeyboard,
  buildOddsComparisonDisplay,
  formatRefreshProgress,
  generateMatchUpdateNotification,
  getRefreshStats,
  formatRefreshStats,
  MAX_REFRESHES_PER_MINUTE
};
