/**
 * BETRIX Brand Consistency & Superior Theming
 * Ensures consistent branding across all user interactions
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('BetrixBranding');

// BETRIX Official Brand Guidelines
export const BETRIX_BRANDING = {
  // Primary Brand
  NAME: 'BETRIX',
  TAGLINE: 'AI-Powered Sports Analytics & Betting Intelligence',
  SLOGAN: 'Smarter Bets, Better Odds',
  EMOJI: '🌀',
  
  // Color Codes (for reference)
  COLORS: {
    primary: '#4F46E5',      // Indigo
    secondary: '#06B6D4',    // Cyan
    success: '#10B981',      // Green
    warning: '#F59E0B',      // Amber
    danger: '#EF4444',       // Red
    neutral: '#6B7280'       // Gray
  },

  // Tier Emojis & Badges
  TIERS: {
    'FREE': {
      emoji: '🆓',
      badge: '🆓 Free',
      color: '⚪',
      name: 'FREE'
    },
    'PRO': {
      emoji: '📊',
      badge: '📊 Pro',
      color: '🔵',
      name: 'PROFESSIONAL'
    },
    'VVIP': {
      emoji: '👑',
      badge: '👑 VVIP',
      color: '🟡',
      name: 'VERY VERY IMPORTANT PERSON'
    },
    'PLUS': {
      emoji: '💎',
      badge: '💎 Plus',
      color: '💜',
      name: 'BETRIX PLUS'
    }
  },

  // Feature Icons
  ICONS: {
    live: '🔴',
    fixture: '📅',
    odds: '💰',
    analysis: '🤖',
    prediction: '🎯',
    favorite: '⭐',
    stats: '📊',
    league: '🏆',
    team: '⚽',
    player: '👤',
    goal: '⚽',
    card: '🟨',
    injury: '🏥',
    arbitrage: '💎',
    alert: '🔔',
    bet: '🎟️',
    payment: '💳',
    support: '📧',
    loading: '⏳',
    error: '❌',
    success: '✅',
    warning: '⚠️'
  },

  // Sport Icons
  SPORTS: {
    'football': '⚽',
    'soccer': '⚽',
    'basketball': '🏀',
    'tennis': '🎾',
    'american_football': '🏈',
    'nfl': '🏈',
    'ice_hockey': '🏒',
    'hockey': '🏒',
    'baseball': '⚾',
    'rugby': '🏉',
    'cricket': '🏏',
    'volleyball': '🏐',
    'golf': '⛳',
    'formula_1': '🏎️',
    'mma': '🥊',
    'boxing': '🥊'
  },

  // Country Flags (for league display)
  FLAGS: {
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Spain': '🇪🇸',
    'Italy': '🇮🇹',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'Portugal': '🇵🇹',
    'Netherlands': '🇳🇱',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'Belgium': '🇧🇪',
    'Turkey': '🇹🇷',
    'Brazil': '🇧🇷',
    'Argentina': '🇦🇷',
    'Kenya': '🇰🇪',
    'USA': '🇺🇸'
  }
};

/**
 * Generate consistent header with BETRIX branding
 */
export function generateBetrixHeader(userTier = 'FREE', userName = 'User', includeStats = false, stats = {}) {
  const tierInfo = BETRIX_BRANDING.TIERS[userTier] || BETRIX_BRANDING.TIERS['FREE'];
  
  let header = `${BETRIX_BRANDING.EMOJI} *${BETRIX_BRANDING.NAME}* ${tierInfo.emoji}\n`;
  header += `${BETRIX_BRANDING.TAGLINE}\n`;
  header += `${tierInfo.color} *${tierInfo.name}*\n\n`;
  header += `👤 Welcome, *${userName}*`;

  if (includeStats) {
    header += `\n📊 *Your Stats:* ${stats.predictions || 0} predictions | ✅ ${stats.winRate || '-'}% win rate`;
  }

  return header;
}

/**
 * Generate consistent footer for all messages
 */
export function generateBetrixFooter(includeDisclaimer = true, customText = '') {
  let footer = '\n\n';
  footer += `_Powered by ${BETRIX_BRANDING.EMOJI} ${BETRIX_BRANDING.NAME}_`;

  if (customText) {
    footer += `\n_${customText}_`;
  }

  if (includeDisclaimer) {
    footer += `\n_🔒 Bet responsibly. For help, type /support_`;
  }

  return footer;
}

/**
 * Format all match-related text with BETRIX branding
 */
export function formatMatchDisplay(match, showOdds = true, showStats = true) {
  const home = match.home || 'Home Team';
  const away = match.away || 'Away Team';
  const score = match.homeScore !== undefined ? `${match.homeScore}-${match.awayScore}` : '-';
  
  const sportIcon = BETRIX_BRANDING.SPORTS[match.sport?.toLowerCase()] || '⚽';
  const leagueIcon = BETRIX_BRANDING.ICONS.league;

  let display = `${sportIcon} *Match Details*\n\n`;
  display += `*${home}* vs *${away}*\n`;

  // Status line
  if (match.status === 'LIVE' || match.status === 'live') {
    display += `${BETRIX_BRANDING.ICONS.live} LIVE \`${score}\` ⏱ ${match.time || 'N/A'}\n`;
  } else if (match.status === 'FINISHED' || match.status === 'FT') {
    display += `${BETRIX_BRANDING.ICONS.success} FT \`${score}\`\n`;
  } else {
    display += `${BETRIX_BRANDING.ICONS.fixture} ${match.date || 'TBD'}\n`;
  }

  // League
  if (match.league) {
    const flag = BETRIX_BRANDING.FLAGS[match.league] || leagueIcon;
    display += `${flag} *${match.league}*\n`;
  }

  // Odds
  if (showOdds && match.odds) {
    display += `${BETRIX_BRANDING.ICONS.odds} Odds: \`${match.odds.home || '-'}\` • \`${match.odds.draw || '-'}\` • \`${match.odds.away || '-'}\`\n`;
  }

  // Stats
  if (showStats && match.possession) {
    display += `${BETRIX_BRANDING.ICONS.stats} Possession: ${match.possession.home}% • ${match.possession.away}%\n`;
  }

  return display;
}

/**
 * Format error messages with BETRIX branding
 */
export function formatBetrixError(error, userTier = 'FREE') {
  const header = `${BETRIX_BRANDING.ICONS.error} *BETRIX Alert*\n\n`;
  
  let message = '';
  
  if (error.type === 'quota') {
    message = `${BETRIX_BRANDING.ICONS.loading} We\'re experiencing high demand right now.\n\nPlease try again in a moment.`;
  } else if (error.type === 'unauthorized') {
    message = `${BETRIX_BRANDING.ICONS.warning} This feature requires a ${userTier === 'FREE' ? 'PRO' : 'VVIP'} subscription.\n\nUpgrade to unlock premium insights!`;
  } else if (error.type === 'connection') {
    message = `${BETRIX_BRANDING.ICONS.warning} Connection issue. Please check your internet and try again.`;
  } else if (error.type === 'not_found') {
    message = `${BETRIX_BRANDING.ICONS.warning} Oops! We couldn't find what you're looking for.\n\nPlease try a different search.`;
  } else {
    message = `Something went wrong: ${error.message || 'Unknown error'}\n\nOur team has been notified. Please try again later.`;
  }

  return header + message + generateBetrixFooter(false);
}

/**
 * Format success messages
 */
export function formatBetrixSuccess(action, details = '') {
  const messages = {
    'favorite_added': `${BETRIX_BRANDING.ICONS.favorite} Added to Favorites! You'll get instant updates on ${details}`,
    'bet_placed': `${BETRIX_BRANDING.ICONS.success} Bet Placed! Good luck! 🍀`,
    'subscription_updated': `${BETRIX_BRANDING.ICONS.success} Subscription Updated! Enjoy your new features.`,
    'payment_verified': `${BETRIX_BRANDING.ICONS.success} Payment Confirmed! ${details}`,
    'alert_set': `${BETRIX_BRANDING.ICONS.alert} Alert Set! We'll notify you when ${details}`,
    'profile_updated': `${BETRIX_BRANDING.ICONS.success} Profile Updated!`
  };

  const msg = messages[action] || `${BETRIX_BRANDING.ICONS.success} ${action}!`;
  return `*BETRIX*\n\n${msg}` + generateBetrixFooter(false);
}

/**
 * Create consistent tier comparison display
 */
export function displayTierComparison() {
  let comparison = `${BETRIX_BRANDING.EMOJI} *BETRIX Subscription Tiers*\n\n`;

  const tiers = [
    {
      name: 'FREE',
      emoji: BETRIX_BRANDING.TIERS['FREE'].emoji,
      price: 'FREE',
      features: ['📌 Basic Live Scores', '⏳ Delayed Odds (5 min)', '📰 News Feed']
    },
    {
      name: 'PRO',
      emoji: BETRIX_BRANDING.TIERS['PRO'].emoji,
      price: 'KES 899/month',
      features: ['✅ Real-time Odds', '✅ Basic AI Analysis', '✅ Match Statistics', '🔔 Push Notifications']
    },
    {
      name: 'VVIP',
      emoji: BETRIX_BRANDING.TIERS['VVIP'].emoji,
      price: 'KES 2,699/month',
      features: ['✅ Advanced AI (85%+ accuracy)', '✅ Fixed Match Tips', '💎 Arbitrage Detection', '👥 Priority Support']
    },
    {
      name: 'PLUS',
      emoji: BETRIX_BRANDING.TIERS['PLUS'].emoji,
      price: 'KES 8,999/month',
      features: ['✅ All VVIP features', '🌍 Multi-sport Analysis', '📱 Custom Alerts', '🏆 VIP Event Access']
    }
  ];

  tiers.forEach(tier => {
    comparison += `${tier.emoji} *${tier.name}* - ${tier.price}\n`;
    tier.features.forEach(feature => {
      comparison += `  ${feature}\n`;
    });
    comparison += '\n';
  });

  return comparison;
}

/**
 * Create consistent notification display
 */
export function formatNotification(type, data) {
  const notifications = {
    'goal': {
      icon: BETRIX_BRANDING.ICONS.goal,
      text: `${data.scorer} scored!\n*${data.home}* ${data.score} *${data.away}*`
    },
    'card': {
      icon: data.type === 'RED' ? '🔴' : BETRIX_BRANDING.ICONS.card,
      text: `${data.type === 'RED' ? 'RED CARD' : 'Yellow card'} for ${data.player}`
    },
    'injury': {
      icon: BETRIX_BRANDING.ICONS.injury,
      text: `${data.player} is injured and won't play`
    },
    'odds_change': {
      icon: BETRIX_BRANDING.ICONS.odds,
      text: `Odds updated! ${data.team} now at ${data.odds}`
    },
    'match_start': {
      icon: BETRIX_BRANDING.ICONS.live,
      text: `${data.home} vs ${data.away} has started!`
    }
  };

  const notif = notifications[type] || { icon: BETRIX_BRANDING.ICONS.alert, text: data.message };
  
  return `${notif.icon} *Alert*\n${notif.text}`;
}

/**
 * Apply consistent formatting to team names
 */
export function formatTeamName(name, includeBadge = false) {
  let formatted = `*${name}*`;
  
  if (includeBadge) {
    // Could add tier badge based on team ranking
    // formatted += ` ${BETRIX_BRANDING.TIERS.VVIP.emoji}`;
  }
  
  return formatted;
}

/**
 * Apply consistent formatting to league names
 */
export function formatLeagueName(name) {
  const flag = BETRIX_BRANDING.FLAGS[name.split(' ')[0]] || BETRIX_BRANDING.ICONS.league;
  return `${flag} *${name}*`;
}

/**
 * Generate consistent divider
 */
export function generateDivider(title = '', length = 40) {
  if (title) {
    return `\n${'─'.repeat(length)}\n${title}\n${'─'.repeat(length)}\n`;
  }
  return `\n${'─'.repeat(length)}\n`;
}

/**
 * Format currency consistently
 */
export function formatCurrency(amount, currency = 'KES') {
  if (currency === 'KES') {
    return `KES ${amount.toLocaleString('en-US')}`;
  }
  return `${amount} ${currency}`;
}

/**
 * Format percentage with bar chart
 */
export function formatPercentageBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percentage}%`;
}

export default {
  BETRIX_BRANDING,
  generateBetrixHeader,
  generateBetrixFooter,
  formatMatchDisplay,
  formatBetrixError,
  formatBetrixSuccess,
  displayTierComparison,
  formatNotification,
  formatTeamName,
  formatLeagueName,
  generateDivider,
  formatCurrency,
  formatPercentageBar
};
