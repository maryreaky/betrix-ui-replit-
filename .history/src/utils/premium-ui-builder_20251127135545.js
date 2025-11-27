/**
 * Premium UI Builder - BETRIX Supreme Brand Experience
 * Comprehensive formatting and interactive elements for superior UX
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('PremiumUIBuilder');

// BETRIX Brand Constants
export const BETRIX_BRAND = {
  EMOJI: '🌀',
  NAME: 'BETRIX',
  TAGLINE: 'AI-Powered Sports Analytics & Betting Intelligence',
  COLOR_ACCENT: '✨',
  BADGE_PREMIUM: '👑',
  BADGE_ELITE: '💎',
  BADGE_PRO: '📊',
  BADGE_VIP: '⭐'
};

/**
 * Build premium header with dynamic tier indicator
 */
export function buildBetrixHeader(tier = 'FREE', user = null) {
  const tierEmoji = {
    'FREE': '🆓',
    'PRO': '📊',
    'VVIP': '👑',
    'PLUS': '💎'
  }[tier] || '🆓';

  const name = user ? user.name || 'User' : 'Guest';
  
  return `${BETRIX_BRAND.EMOJI} *${BETRIX_BRAND.NAME}* ${tierEmoji}\n` +
         `${BETRIX_BRAND.TAGLINE}\n` +
         `👤 Welcome, *${name}*`;
}

/**
 * Build premium section divider
 */
export function buildSectionDivider(title) {
  return `\n${'─'.repeat(40)}\n*${title}*\n${'─'.repeat(40)}\n`;
}

/**
 * Build match card with comprehensive stats
 */
export function buildMatchCard(match, index = 1, includeOdds = true) {
  if (!match) return '';

  const home = match.home || match.homeTeam || 'Home';
  const away = match.away || match.awayTeam || 'Away';
  const score = match.score || `${match.homeScore || '-'}-${match.awayScore || '-'}`;
  const status = match.status || 'SCHEDULED';
  const time = match.time || match.minute || 'TBD';

  let card = `${index}️⃣ *${home}* vs *${away}*\n`;
  
  // Score line
  if (status === 'LIVE' || status === 'live' || status === 'IN_PLAY') {
    card += `🔴 \`${score}\` ⏱ ${time}\n`;
  } else if (status === 'FINISHED' || status === 'FT' || status === 'finished') {
    card += `✅ \`${score}\` 🏁 FT\n`;
  } else {
    card += `⏳ \`${score}\` 📅 ${time}\n`;
  }

  // League/Competition info
  if (match.league || match.competition) {
    card += `🏆 *${match.league || match.competition}*\n`;
  }

  // Odds if available
  if (includeOdds && (match.homeOdds || match.odds)) {
    const homeOdds = match.homeOdds || match.odds?.home || '-';
    const drawOdds = match.drawOdds || match.odds?.draw || '-';
    const awayOdds = match.awayOdds || match.odds?.away || '-';
    card += `💰 Odds: \`${homeOdds}\` • \`${drawOdds}\` • \`${awayOdds}\`\n`;
  }

  // Key stats if available
  if (match.stats || match.possession) {
    card += buildMatchStats(match);
  }

  return card;
}

/**
 * Build match statistics display
 */
export function buildMatchStats(match) {
  let stats = '';

  if (match.possession) {
    const homePos = match.possession.home || match.possession.homeTeam || 0;
    const awayPos = match.possession.away || match.possession.awayTeam || 0;
    const homeBar = '█'.repeat(Math.round(homePos / 5)) + '░'.repeat(20 - Math.round(homePos / 5));
    const awayBar = '█'.repeat(Math.round(awayPos / 5)) + '░'.repeat(20 - Math.round(awayPos / 5));
    stats += `⚙️ Possession:\n${homeBar} ${homePos}%\n${awayBar} ${awayPos}%\n`;
  }

  if (match.stats) {
    const s = match.stats;
    stats += `📈 Stats:\n`;
    if (s.shots) stats += `🎯 Shots: ${s.shots.home || 0} - ${s.shots.away || 0}\n`;
    if (s.shotsOnTarget) stats += `🎯 On Target: ${s.shotsOnTarget.home || 0} - ${s.shotsOnTarget.away || 0}\n`;
    if (s.corners) stats += `🔃 Corners: ${s.corners.home || 0} - ${s.corners.away || 0}\n`;
    if (s.fouls) stats += `🚫 Fouls: ${s.fouls.home || 0} - ${s.fouls.away || 0}\n`;
    if (s.yellowCards) stats += `🟨 Yellow: ${s.yellowCards.home || 0} - ${s.yellowCards.away || 0}\n`;
    if (s.redCards) stats += `🔴 Red: ${s.redCards.home || 0} - ${s.redCards.away || 0}\n`;
  }

  return stats;
}

/**
 * Build interactive action buttons for a match
 */
export function buildMatchActionButtons(matchId, leagueId = null, userTier = 'FREE') {
  const buttons = [];

  // Analyze button (for VVIP users)
  if (userTier !== 'FREE') {
    buttons.push({
      text: '🤖 AI Analyze',
      callback_data: `analyze_match_${leagueId || 'live'}_${matchId}`
    });
  }

  // Odds button
  buttons.push({
    text: '💰 Compare Odds',
    callback_data: `odds_compare_${matchId}`
  });

  // Favorite button
  buttons.push({
    text: '⭐ Add to Fav',
    callback_data: `fav_add_${matchId}`
  });

  // Bet slip button
  buttons.push({
    text: '🎟️ Add to Slip',
    callback_data: `slip_add_${matchId}`
  });

  // Refresh button
  buttons.push({
    text: '🔄 Refresh',
    callback_data: `match_refresh_${matchId}`
  });

  // Split into rows of 2
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return rows;
}

/**
 * Build fixtures list for a league/competition
 */
export function buildFixturesDisplay(fixtures, league = 'League', view = 'upcoming') {
  if (!fixtures || fixtures.length === 0) {
    return `🏟️ *${league} ${view.toUpperCase()}*\n\n📭 No ${view} matches scheduled.`;
  }

  let display = buildSectionDivider(`${league} - ${view.toUpperCase()}`);

  fixtures.slice(0, 15).forEach((f, i) => {
    const status = f.status === 'LIVE' || f.status === 'live' ? '🔴' : '📅';
    const time = f.time || f.date || 'TBD';
    const home = f.home || f.homeTeam || 'Home';
    const away = f.away || f.awayTeam || 'Away';
    const score = f.score || (f.homeScore !== undefined ? `${f.homeScore}-${f.awayScore}` : '─');

    display += `${i + 1}. ${status} \`${score}\` *${home}* vs *${away}*\n`;
    if (f.time) display += `   ⏱ ${time}\n`;
    display += '\n';
  });

  return display;
}

/**
 * Build league selector keyboard
 */
export function buildLeagueSelectorKeyboard(sport = 'football', tier = 'FREE') {
  const leagues = {
    'football': [
      { text: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', callback_data: 'league_39' },
      { text: '🇪🇸 La Liga', callback_data: 'league_140' },
      { text: '🇮🇹 Serie A', callback_data: 'league_135' },
      { text: '🇩🇪 Bundesliga', callback_data: 'league_78' },
      { text: '🇫🇷 Ligue 1', callback_data: 'league_61' },
      { text: '🌍 Champions League', callback_data: 'league_2' },
      { text: '🌍 Europa League', callback_data: 'league_3' }
    ],
    'basketball': [
      { text: '🏀 NBA', callback_data: 'league_nba' },
      { text: '🇪🇺 EuroLeague', callback_data: 'league_euroleague' }
    ],
    'tennis': [
      { text: '🎾 ATP', callback_data: 'league_atp' },
      { text: '🎾 WTA', callback_data: 'league_wta' }
    ]
  };

  const sportLeagues = leagues[sport] || leagues['football'];
  
  // Build keyboard rows of 2 buttons
  const keyboard = [];
  for (let i = 0; i < sportLeagues.length; i += 2) {
    keyboard.push(sportLeagues.slice(i, i + 2));
  }

  // Add back button
  keyboard.push([{ text: '🔙 Back', callback_data: 'menu_live' }]);

  return keyboard;
}

/**
 * Build bet analysis display (for AI predictions)
 */
export function buildBetAnalysis(match, analysis = {}) {
  let text = `🤖 *AI Bet Analysis*\n\n`;
  text += `*${match.home}* vs *${match.away}*\n\n`;

  if (analysis.prediction) {
    text += `🎯 *Prediction:* ${analysis.prediction}\n`;
  }

  if (analysis.confidence) {
    const bar = '█'.repeat(Math.round(analysis.confidence / 5)) + '░'.repeat(20 - Math.round(analysis.confidence / 5));
    text += `📊 *Confidence:* ${bar} ${analysis.confidence}%\n`;
  }

  if (analysis.valueBets && analysis.valueBets.length > 0) {
    text += `\n💎 *Value Bets:*\n`;
    analysis.valueBets.forEach((bet, i) => {
      text += `${i + 1}. ${bet.option} @ ${bet.odds}\n`;
    });
  }

  if (analysis.reasoning) {
    text += `\n📝 *Analysis:*\n${analysis.reasoning}\n`;
  }

  if (analysis.riskLevel) {
    text += `\n⚠️ *Risk Level:* ${analysis.riskLevel}\n`;
  }

  text += `\n_Disclaimer: AI predictions are for informational purposes. Bet responsibly._`;

  return text;
}

/**
 * Build fixtures/upcoming matches display
 */
export function buildUpcomingFixtures(fixtures = [], league = '', daysBefore = 7) {
  if (!fixtures || fixtures.length === 0) {
    return `📭 No upcoming fixtures in the next ${daysBefore} days.`;
  }

  let display = `📅 *Upcoming Fixtures - ${league}*\n\n`;

  const sorted = fixtures.sort((a, b) => {
    const timeA = new Date(a.date || a.time || 0).getTime();
    const timeB = new Date(b.date || b.time || 0).getTime();
    return timeA - timeB;
  });

  sorted.slice(0, 10).forEach((f, i) => {
    const home = f.home || f.homeTeam || 'Home';
    const away = f.away || f.awayTeam || 'Away';
    const dateStr = f.date ? new Date(f.date).toLocaleDateString() : 'TBD';
    const timeStr = f.time ? new Date(f.time).toLocaleTimeString() : 'TBD';

    display += `${i + 1}. *${home}* vs *${away}*\n`;
    display += `   📅 ${dateStr} ⏰ ${timeStr}\n\n`;
  });

  return display;
}

/**
 * Build premium subscription comparison
 */
export function buildSubscriptionComparison() {
  return `${buildSectionDivider('🌀 BETRIX Subscription Tiers')}

*⭐ FREE TIER*
• 🔓 Community Access
• 📊 Basic Live Scores
• 💰 Delayed Odds (5 min)
• 🆓 Price: FREE

*📊 PRO TIER - KES 899/month*
• 🔓 All FREE features
• ⚡ Real-time Odds
• 🤖 Basic AI Analysis
• 📈 Match Statistics
• 🔔 Push Notifications

*👑 VVIP TIER - KES 2,699/month*
• 🔓 All PRO features
• 🔮 Advanced AI Predictions (85%+ accuracy)
• 📊 Arbitrage Detection
• 🎯 Fixed Match Tips
• 💎 Priority Support
• 📱 Mobile App Access

*💎 BETRIX Plus - KES 8,999/month*
• 🔓 All VVIP features
• 🔥 Exclusive Strategies
• 🌍 Multi-sport Analysis
• 📊 Custom Alerts
• 🏆 VIP Event Access
• 👥 Private Community

_Use code BETRIX10 for 10% off your first month!_`;
}

/**
 * Build error message with recovery options
 */
export function buildErrorMessage(error, tier = 'FREE') {
  let msg = `❌ *Error*\n\n`;

  if (error.includes('quota') || error.includes('limit')) {
    msg += `⚠️ API Quota reached. Retrying in a moment...`;
  } else if (error.includes('auth') || error.includes('unauthorized')) {
    msg += `🔐 Authentication failed. Please contact support.`;
  } else if (error.includes('upgrade')) {
    msg += `👑 This feature requires a VVIP subscription.\n\nTap "Subscribe" to unlock premium features!`;
  } else {
    msg += `Something went wrong. Please try again later.`;
  }

  msg += `\n\n_Error: ${error.substring(0, 50)}..._`;

  return msg;
}

/**
 * Build live match ticker (compact display for multiple matches)
 */
export function buildLiveMatchTicker(matches = []) {
  if (!matches || matches.length === 0) {
    return '🔴 No live matches at the moment.';
  }

  let ticker = `🔴 *LIVE NOW*\n\n`;

  matches.slice(0, 8).forEach((m) => {
    const score = m.homeScore !== undefined ? `${m.homeScore}-${m.awayScore}` : '─';
    const time = m.time || '...';
    ticker += `⚽ \`${score}\` *${m.home}* vs *${m.away}* (${time})\n`;
  });

  if (matches.length > 8) {
    ticker += `\n... and ${matches.length - 8} more matches live!`;
  }

  return ticker;
}

/**
 * Build stat comparison between two teams
 */
export function buildTeamComparison(home, away, homeStats = {}, awayStats = {}) {
  let comparison = `⚖️ *Team Comparison*\n\n`;
  comparison += `*${home}* vs *${away}*\n\n`;

  const stats = [
    { key: 'form', label: '📊 Form', home: homeStats.form, away: awayStats.form },
    { key: 'avgGoals', label: '⚽ Avg Goals', home: homeStats.avgGoals, away: awayStats.avgGoals },
    { key: 'winRate', label: '✅ Win Rate', home: homeStats.winRate, away: awayStats.winRate },
    { key: 'injuries', label: '🏥 Injuries', home: homeStats.injuries, away: awayStats.injuries }
  ];

  stats.forEach(stat => {
    if (stat.home !== undefined && stat.away !== undefined) {
      comparison += `${stat.label}\n`;
      comparison += `${home.substring(0, 15)}: ${stat.home}\n`;
      comparison += `${away.substring(0, 15)}: ${stat.away}\n\n`;
    }
  });

  return comparison;
}

/**
 * Build notification alert
 */
export function buildNotificationAlert(type, data) {
  const alerts = {
    'goal': `⚽ *GOAL!* ${data.scorer} just scored!\n*${data.home}* ${data.score} *${data.away}*`,
    'redcard': `🔴 *RED CARD!* ${data.player} has been sent off!`,
    'yellowcard': `🟨 *YELLOW CARD* for ${data.player}`,
    'status': `📡 *Match Status Update*\n${data.status}`,
    'odds_update': `💰 *Odds Updated!*\n${data.home} @ ${data.homeOdds}\nDraw @ ${data.drawOdds}\n${data.away} @ ${data.awayOdds}`
  };

  return alerts[type] || `📡 *Notification*\n${JSON.stringify(data)}`;
}

export default {
  BETRIX_BRAND,
  buildBetrixHeader,
  buildSectionDivider,
  buildMatchCard,
  buildMatchStats,
  buildMatchActionButtons,
  buildFixturesDisplay,
  buildLeagueSelectorKeyboard,
  buildBetAnalysis,
  buildUpcomingFixtures,
  buildSubscriptionComparison,
  buildErrorMessage,
  buildLiveMatchTicker,
  buildTeamComparison,
  buildNotificationAlert
};
