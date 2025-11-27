/**
 * Intelligent Menu Builder - Superior Navigation System
 * Dynamic, responsive menus with context-aware options
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('IntelligentMenuBuilder');

export class IntelligentMenuBuilder {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  /**
   * Build contextual main menu based on user tier and activity
   */
  async buildContextualMainMenu(userId, userData = {}, userStats = {}) {
    const tier = userData.tier || 'FREE';
    const tier_emoji = {
      'FREE': '🆓',
      'PRO': '📊',
      'VVIP': '👑',
      'PLUS': '💎'
    }[tier] || '🆓';

    let text = `🌀 *BETRIX ${tier_emoji}*\n`;
    text += `*AI-Powered Sports Analytics*\n\n`;
    text += `👤 *${userData.name || 'Welcome'}*\n`;
    
    // Show quick stats
    if (userStats.predictions || userStats.winRate) {
      text += `📊 Predictions: ${userStats.predictions || 0} | ✅ Win Rate: ${userStats.winRate || '-'}%\n\n`;
    }

    text += `*What would you like to do?*`;

    // Build intelligent keyboard
    const keyboard = [];

    // Row 1: Hot actions (always visible)
    keyboard.push([
      { text: '⚽ Live Now', callback_data: 'menu_live' },
      { text: '📊 Quick Odds', callback_data: 'menu_odds' }
    ]);

    // Row 2: Premium features (if eligible)
    if (tier !== 'FREE') {
      keyboard.push([
        { text: '🤖 AI Analysis', callback_data: 'ai_quick' },
        { text: '💎 Premium Tips', callback_data: 'vvip_tips' }
      ]);
    } else {
      keyboard.push([
        { text: '🏆 Standings', callback_data: 'menu_standings' },
        { text: '📰 News', callback_data: 'menu_news' }
      ]);
    }

    // Row 3: User menu
    keyboard.push([
      { text: '⭐ Favorites', callback_data: 'profile_favorites' },
      { text: '👤 Profile', callback_data: 'menu_profile' }
    ]);

    // Row 4: Subscription (if FREE, upgrade; if PRO, show VVIP)
    if (tier === 'FREE') {
      keyboard.push([
        { text: '💰 Upgrade to PRO', callback_data: 'sub_pro' }
      ]);
    } else if (tier === 'PRO') {
      keyboard.push([
        { text: '👑 Upgrade to VVIP', callback_data: 'sub_vvip' }
      ]);
    }

    // Row 5: Help
    keyboard.push([
      { text: '❓ Help', callback_data: 'menu_help' }
    ]);

    return {
      text,
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Build quick action menu (compact, for repeated access)
   */
  buildQuickActionMenu() {
    return {
      text: '⚡ *Quick Access*',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔴 Live', callback_data: 'menu_live' },
            { text: '💰 Odds', callback_data: 'menu_odds' },
            { text: '🏆 Table', callback_data: 'menu_standings' }
          ],
          [
            { text: '🔙 Back', callback_data: 'menu_main' }
          ]
        ]
      }
    };
  }

  /**
   * Build sports selector with emojis and organization
   */
  buildSportSelectorMenu() {
    return {
      text: `🌀 *BETRIX* - Select a Sport\n\n*Which sport interests you?*`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚽ Football', callback_data: 'sport_football' },
            { text: '🏀 Basketball', callback_data: 'sport_basketball' }
          ],
          [
            { text: '🎾 Tennis', callback_data: 'sport_tennis' },
            { text: '🏈 American Football', callback_data: 'sport_nfl' }
          ],
          [
            { text: '🏒 Ice Hockey', callback_data: 'sport_hockey' },
            { text: '⚾ Baseball', callback_data: 'sport_baseball' }
          ],
          [
            { text: '🏉 Rugby', callback_data: 'sport_rugby' },
            { text: '🏏 Cricket', callback_data: 'sport_cricket' }
          ],
          [
            { text: '🔙 Back to Main', callback_data: 'menu_main' }
          ]
        ]
      }
    };
  }

  /**
   * Build league browser for a sport
   */
  buildLeagueBrowserMenu(sport = 'football') {
    const leagues = {
      'football': [
        { text: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', callback_data: 'league_39', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
        { text: '🇪🇸 La Liga', callback_data: 'league_140', flag: '🇪🇸' },
        { text: '🇮🇹 Serie A', callback_data: 'league_135', flag: '🇮🇹' },
        { text: '🇩🇪 Bundesliga', callback_data: 'league_78', flag: '🇩🇪' },
        { text: '🇫🇷 Ligue 1', callback_data: 'league_61', flag: '🇫🇷' },
        { text: '🌍 Champions League', callback_data: 'league_2', flag: '🏆' },
        { text: '🌍 Europa League', callback_data: 'league_3', flag: '🏆' }
      ]
    };

    const sportLeagues = leagues[sport] || leagues['football'];
    const keyboard = [];

    // Two per row
    for (let i = 0; i < sportLeagues.length; i += 2) {
      keyboard.push(sportLeagues.slice(i, i + 2));
    }

    keyboard.push([{ text: '🔙 Back to Sports', callback_data: 'sport_football' }]);

    return {
      text: `🌀 *BETRIX* - Select a League`,
      reply_markup: { inline_keyboard: keyboard }
    };
  }

  /**
   * Build match detail menu with all actions
   */
  buildMatchDetailMenu(matchId, leagueId, userTier = 'FREE', hasOdds = true) {
    const actions = [];

    // AI Analysis (VVIP only)
    if (userTier !== 'FREE') {
      actions.push([
        { text: '🤖 AI Analysis', callback_data: `analyze_match_${leagueId}_${matchId}` }
      ]);
    }

    // Odds and favorites
    actions.push([
      { text: '💰 Odds', callback_data: `odds_compare_${matchId}` },
      { text: '⭐ Favorite', callback_data: `fav_add_${matchId}` }
    ]);

    // Bet slip
    actions.push([
      { text: '🎟️ Add to Slip', callback_data: `slip_add_${matchId}` }
    ]);

    // Refresh and back
    actions.push([
      { text: '🔄 Refresh', callback_data: `match_refresh_${matchId}` },
      { text: '🔙 Back', callback_data: `league_${leagueId}` }
    ]);

    return {
      reply_markup: { inline_keyboard: actions }
    };
  }

  /**
   * Build premium features menu
   */
  buildPremiumFeaturesMenu(userTier = 'FREE') {
    let text = `🌀 *BETRIX Premium Features*\n\n`;

    const features = {
      'FREE': [
        { icon: '✅', feature: 'Live Scores', desc: 'Real-time match updates' },
        { icon: '⏳', feature: 'Odds (Delayed)', desc: '5+ min delay' },
        { icon: '📰', feature: 'News Feed', desc: 'Latest sports news' }
      ],
      'PRO': [
        { icon: '✅', feature: 'Live Scores', desc: 'Real-time updates' },
        { icon: '✅', feature: 'Instant Odds', desc: 'No delay' },
        { icon: '✅', feature: 'Basic AI Analysis', desc: 'Match predictions' },
        { icon: '⏳', feature: 'Advanced Tips', desc: 'Coming in VVIP' }
      ],
      'VVIP': [
        { icon: '✅', feature: 'Everything in PRO' },
        { icon: '✅', feature: 'Advanced AI Analysis', desc: '85%+ accuracy' },
        { icon: '✅', feature: 'Fixed Match Tips', desc: 'Exclusive picks' },
        { icon: '✅', feature: 'Arbitrage Detection', desc: 'Value betting' },
        { icon: '✅', feature: 'Priority Support' }
      ],
      'PLUS': [
        { icon: '✅', feature: 'Everything in VVIP' },
        { icon: '✅', feature: 'Multi-Sport Analysis' },
        { icon: '✅', feature: 'Custom Alerts' },
        { icon: '✅', feature: 'VIP Events Access' },
        { icon: '✅', feature: 'Private Community' }
      ]
    };

    const tierFeatures = features[userTier] || features['FREE'];
    tierFeatures.forEach(f => {
      text += `${f.icon} *${f.feature}*${f.desc ? ` - ${f.desc}` : ''}\n`;
    });

    text += `\n_Want to upgrade? Tap Subscribe to unlock premium features._`;

    return {
      text,
      reply_markup: {
        inline_keyboard: [
          userTier === 'FREE' ? [{ text: '💰 Upgrade to PRO', callback_data: 'sub_pro' }] :
          userTier === 'PRO' ? [{ text: '👑 Upgrade to VVIP', callback_data: 'sub_vvip' }] :
          [{ text: '💎 Upgrade to PLUS', callback_data: 'sub_plus' }],
          [{ text: '🔙 Back', callback_data: 'menu_main' }]
        ]
      }
    };
  }

  /**
   * Build confirmation menu for actions
   */
  buildConfirmationMenu(action, data = {}) {
    const confirmations = {
      'add_favorite': {
        text: `⭐ Add *${data.teamName}* to your favorites?`,
        callback_true: `fav_add_confirm_${data.teamId}`,
        callback_false: 'menu_main'
      },
      'add_bet_slip': {
        text: `🎟️ Add *${data.matchText}* to your bet slip?`,
        callback_true: `slip_add_confirm_${data.matchId}`,
        callback_false: 'menu_main'
      },
      'place_bet': {
        text: `💰 Place bet of KES ${data.amount}?\n\n${data.details}`,
        callback_true: `bet_place_confirm_${data.betId}`,
        callback_false: 'bet_cancel'
      },
      'subscribe': {
        text: `👑 Subscribe to *${data.tier}* - KES ${data.price}?\n\n${data.benefits}`,
        callback_true: `pay_${data.tier.toLowerCase()}`,
        callback_false: 'menu_vvip'
      }
    };

    const conf = confirmations[action];
    if (!conf) return null;

    return {
      text: conf.text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: conf.callback_true },
            { text: '❌ Cancel', callback_data: conf.callback_false }
          ]
        ]
      },
      parse_mode: 'Markdown'
    };
  }

  /**
   * Build progress indicator
   */
  buildProgressIndicator(current, total, label = 'Loading') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return `${label}\n${bar} ${percentage}%\n`;
  }

  /**
   * Build error recovery menu
   */
  buildErrorRecoveryMenu(errorType = 'unknown') {
    const recoveryOptions = {
      'connection': {
        text: '🌐 Connection Error\n\nLet\'s try again or go back to main menu.',
        actions: [
          { text: '🔄 Retry', callback_data: 'retry' },
          { text: '🏠 Main Menu', callback_data: 'menu_main' }
        ]
      },
      'quota': {
        text: '📊 API Quota Reached\n\nWe\'ll be back online shortly. Please check back in a moment.',
        actions: [
          { text: '🏠 Main Menu', callback_data: 'menu_main' }
        ]
      },
      'unauthorized': {
        text: '🔐 Authentication Required\n\nPlease sign up or log in to continue.',
        actions: [
          { text: '📝 Sign Up', callback_data: 'signup_start' },
          { text: '🏠 Main Menu', callback_data: 'menu_main' }
        ]
      }
    };

    const recovery = recoveryOptions[errorType] || recoveryOptions['unknown'] || {
      text: '❌ Something went wrong.\n\nPlease try again or contact support.',
      actions: [{ text: '🏠 Main Menu', callback_data: 'menu_main' }]
    };

    return {
      text: recovery.text,
      reply_markup: {
        inline_keyboard: [recovery.actions]
      },
      parse_mode: 'Markdown'
    };
  }
}

export default IntelligentMenuBuilder;
