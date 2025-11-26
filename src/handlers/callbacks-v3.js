/**
 * BETRIX Callback Handler v3 - Complete callback routing
 * Routes all inline button callbacks through a unified dispatcher
 */

import logger from '../utils/logger.js';
import { handleBettingSitesCallback } from './betting-sites.js';
import { handlePaymentCallback, handlePaymentMethodSelection } from './payment-router.js';

// ============================================================================
// CALLBACK ROUTER
// ============================================================================

export async function handleCallbackQuery(callbackData, userId, chatId, redis, services) {
  logger.info('handleCallbackQuery', { callbackData, userId, chatId });

  try {
    // Route callback based on prefix
    if (callbackData.startsWith('menu_')) {
      return await handleMenuCallback(callbackData, userId, chatId, redis);
    }

    if (callbackData.startsWith('pay_')) {
      return await handlePaymentCallback(callbackData, userId, chatId, redis, services);
    }

    if (callbackData.startsWith('vvip_')) {
      return await handleVVIPCallback(callbackData, userId, chatId, redis);
    }

    if (callbackData.startsWith('sites_') || callbackData.startsWith('pref_')) {
      return await handleBettingSitesCallback(callbackData, chatId, userId, redis);
    }

    if (callbackData.startsWith('help_')) {
      return await handleHelpCallback(callbackData, chatId);
    }

    if (callbackData.startsWith('odds_')) {
      return await handleOddsCallback(callbackData, userId, chatId, redis, services);
    }

    if (callbackData.startsWith('analyze_')) {
      return await handleAnalyzeCallback(callbackData, userId, chatId, redis, services);
    }

    if (callbackData.startsWith('news_')) {
      return await handleNewsCallback(callbackData, userId, chatId, redis, services);
    }

    if (callbackData.startsWith('bet_')) {
      return await handleBettingCallback(callbackData, userId, chatId, redis, services);
    }

    if (callbackData.startsWith('signup_')) {
      return await handleSignupCallback(callbackData, userId, chatId, redis);
    }

    logger.warn('Unknown callback', { callbackData });
    return { chat_id: chatId, text: '❌ Unknown action.' };
  } catch (err) {
    logger.error('handleCallbackQuery error', err);
    return {
      chat_id: chatId,
      text: '❌ Error processing action. Try again.'
    };
  }
}

// ============================================================================
// MENU CALLBACKS
// ============================================================================

async function handleMenuCallback(data, userId, chatId, redis) {
  logger.info('handleMenuCallback', { data });

  const subMenus = {
    'menu_main': async () => {
      const { handleMenu } = await import('./commands-v3.js');
      return await handleMenu(userId, chatId, redis);
    },

    'menu_odds': async () => {
      const { handleOdds } = await import('./commands-v3.js');
      return await handleOdds(userId, chatId, redis, {}, []);
    },

    'menu_analyze': async () => {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `🧠 *AI Match Analysis*\n\nWhat would you like to analyze?\n\nOption 1: Browse today's odds and tap "Analyze"\nOption 2: Send a fixture ID (e.g., 12345)`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 Browse today\'s matches', callback_data: 'menu_odds' }],
            [{ text: '⬅️ Back', callback_data: 'menu_main' }]
          ]
        }
      };
    },

    'menu_news': async () => {
      const { handleNews } = await import('./commands-v3.js');
      return await handleNews(userId, chatId, redis, {});
    },

    'menu_sites': async () => {
      return await handleBettingSitesCallback('sites_main', chatId, userId, redis);
    },

    'menu_profile': async () => {
      const { getUserProfile } = await import('./data-models.js');
      const user = await getUserProfile(redis, userId);

      if (!user) {
        return {
          chat_id: chatId,
          text: '👤 *Your Profile*\n\nPlease sign up first using /signup',
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '✅ Sign up', callback_data: 'signup_start' }]]
          }
        };
      }

      let profileText = `👤 *Your Profile*\n\n`;
      profileText += `*Name:* ${user.name || 'Not set'}\n`;
      profileText += `*Country:* ${user.country || 'Not set'}\n`;
      profileText += `*Age:* ${user.age || 'Not set'}\n`;
      profileText += `*Status:* ${user.signup_paid === 'true' ? '✅ Verified' : '⏳ Pending'}\n`;
      profileText += `*VVIP:* ${user.vvip_tier === 'inactive' ? '⏳ Inactive' : `✅ ${user.vvip_tier}`}\n`;
      profileText += `*Preferred Site:* ${user.preferred_site || 'Not set'}\n`;
      profileText += `*Bets Placed:* ${user.total_bets_placed || 0}\n`;
      profileText += `*Win Rate:* ${user.win_rate || 0}%\n`;
      profileText += `\n🎁 *Referral Code:* \`${user.referral_code}\`\n`;

      return {
        method: 'editMessageText',
        chat_id: chatId,
        text: profileText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Edit Profile', callback_data: 'profile_edit' }],
            [{ text: '⬅️ Back', callback_data: 'menu_main' }]
          ]
        }
      };
    }
  };

  const handler = subMenus[data];
  if (handler) {
    return await handler();
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown menu.'
  };
}

// ============================================================================
// VVIP CALLBACKS
// ============================================================================

async function handleVVIPCallback(data, userId, chatId, redis) {
  logger.info('handleVVIPCallback', { data });

  if (data === 'vvip_main') {
    const { handleVVIP } = await import('./commands-v3.js');
    return await handleVVIP(userId, chatId, redis);
  }

  // All tier selections redirect to payment
  if (data.startsWith('pay_vvip_')) {
    const tier = data.replace('pay_vvip_', '');
    return await handlePaymentCallback(`pay_vvip_${tier}`, userId, chatId, redis);
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown VVIP action.'
  };
}

// ============================================================================
// PAYMENT CALLBACKS (routed to payment-router)
// ============================================================================

// All payment callbacks are handled in payment-router.js

// ============================================================================
// HELP CALLBACKS
// ============================================================================

async function handleHelpCallback(data, chatId) {
  logger.info('handleHelpCallback', { data });

  const helpTopics = {
    'help_main': () => {
      const { handleHelp } = require('./commands-v3.js');
      return handleHelp(chatId);
    },

    'help_signup': () => ({
      method: 'editMessageText',
      chat_id: chatId,
      text: `❓ *How to Sign Up*\n\n1️⃣ Tap /signup or "Sign up" button\n2️⃣ Provide your name, country, and age\n3️⃣ Pay the one-time signup fee (150 KES/$1)\n4️⃣ Confirm payment\n5️⃣ Done! Enjoy BETRIX features\n\n💬 Still stuck? Email support@betrix.app`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'help_main' }]]
      }
    }),

    'help_payment': () => ({
      method: 'editMessageText',
      chat_id: chatId,
      text: `❓ *Payment Help*\n\n*Methods:* M-Pesa, PayPal, Binance, Card\n*Signup Fee:* 150 KES or $1 (one-time)\n*VVIP:* Daily (200 KES), Weekly (1,000 KES), Monthly (3,000 KES)\n\n*Troubleshooting:*\n• Payment pending? Check /pay → Payment History\n• Not received after 10 min? Contact support\n• Refunds? Non-refundable except subscription cancellation`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'help_main' }]]
      }
    })
  };

  const handler = helpTopics[data];
  if (handler) {
    return handler();
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown help topic.'
  };
}

// ============================================================================
// ODDS CALLBACKS
// ============================================================================

async function handleOddsCallback(data, userId, chatId, redis, services) {
  logger.info('handleOddsCallback', { data });

  if (data === 'odds_refresh') {
    const { handleOdds } = await import('./commands-v3.js');
    return await handleOdds(userId, chatId, redis, services);
  }

  if (data === 'odds_filter_league') {
    return {
      method: 'editMessageText',
      chat_id: chatId,
      text: `🏆 *Filter by League*\n\nSelect a league:`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇬🇧 Premier League', callback_data: 'odds_league_pl' }],
          [{ text: '🇮🇹 Serie A', callback_data: 'odds_league_seria' }],
          [{ text: '🇪🇸 La Liga', callback_data: 'odds_league_laliga' }],
          [{ text: '🇩🇪 Bundesliga', callback_data: 'odds_league_bundesliga' }],
          [{ text: '🇪🇹 Ethiopian Premier', callback_data: 'odds_league_eth' }],
          [{ text: '⬅️ Back', callback_data: 'menu_odds' }]
        ]
      }
    };
  }

  if (data === 'odds_live') {
    return {
      chat_id: chatId,
      text: '🔴 *Live Now*\n\nNo matches currently live. Check back during match days!',
      parse_mode: 'Markdown'
    };
  }

  if (data === 'odds_toppicks') {
    const { handleAnalyze } = await import('./commands-v3.js');
    return {
      chat_id: chatId,
      text: `⭐ *Top AI Picks for Today*\n\nOur highest-confidence predictions (70%+):\n\n1. Arsenal vs Chelsea → *Arsenal Win* (75%)\n2. Man United vs Liverpool → *Draw* (72%)\n3. Real Madrid vs Barcelona → *Real Madrid* (73%)\n\nTap on a match to see full analysis!`,
      parse_mode: 'Markdown'
    };
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown odds action.'
  };
}

// ============================================================================
// ANALYZE CALLBACKS
// ============================================================================

async function handleAnalyzeCallback(data, userId, chatId, redis, services) {
  logger.info('handleAnalyzeCallback', { data });

  if (data.startsWith('analyze_why_')) {
    const fixtureId = data.replace('analyze_why_', '');
    return {
      chat_id: chatId,
      text: `🤔 *Why This Pick?*\n\n*Arsenal Win Analysis:*\n\n📊 **Historical Data:**\n• Arsenal wins 63% at home\n• Chelsea's road record: 45%\n\n🔥 **Current Form:**\n• Arsenal: W-W-D (last 3)\n• Chelsea: L-D-W (inconsistent)\n\n⚽ **Tactical Edge:**\n• Arsenal's pressing game exploits Chelsea's defensive transitions\n• Chelsea missing key defender (suspended)\n\n📈 **Stat Models:**\n• Expected Goals: Arsenal 2.1, Chelsea 1.2\n• Possession advantage: Arsenal 58%\n\n⚠️ **Risk Factors:**\n• Weather could slow Arsenal's tempo\n• Chelsea's counter-attack threat remains`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Place bet', callback_data: `bet_fixture_${fixtureId}` }],
          [{ text: '⬅️ Back', callback_data: 'menu_odds' }]
        ]
      }
    };
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown analyze action.'
  };
}

// ============================================================================
// NEWS CALLBACKS
// ============================================================================

async function handleNewsCallback(data, userId, chatId, redis, services) {
  logger.info('handleNewsCallback', { data });

  const newsCategories = {
    'news_breaking': '🔥 Breaking News',
    'news_injuries': '🏥 Injury Updates',
    'news_lineups': '👥 Team Lineups',
    'news_transfers': '🔄 Transfer News',
    'news_trends': '📈 Form Trends'
  };

  const category = newsCategories[data];
  if (category) {
    return {
      method: 'editMessageText',
      chat_id: chatId,
      text: `${category}\n\n_Loading latest updates..._\n\nIn production, this would show real-time news from RSS feeds and sports APIs.`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu_news' }]]
      }
    };
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown news action.'
  };
}

// ============================================================================
// BETTING CALLBACKS
// ============================================================================

async function handleBettingCallback(data, userId, chatId, redis, services) {
  logger.info('handleBettingCallback', { data });

  if (data.startsWith('bet_fixture_')) {
    const fixtureId = data.replace('bet_fixture_', '');
    return {
      chat_id: chatId,
      text: `🎯 *Place Bet - Fixture ${fixtureId}*\n\n💼 *Add to Betslip:*\n\nWhat's your stake?`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '100 KES', callback_data: `stake_100_${fixtureId}` },
            { text: '500 KES', callback_data: `stake_500_${fixtureId}` }
          ],
          [
            { text: '1,000 KES', callback_data: `stake_1000_${fixtureId}` },
            { text: '🎯 Custom', callback_data: `stake_custom_${fixtureId}` }
          ],
          [{ text: '⬅️ Back', callback_data: 'menu_odds' }]
        ]
      }
    };
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown betting action.'
  };
}

// ============================================================================
// SIGNUP CALLBACKS
// ============================================================================

async function handleSignupCallback(data, userId, chatId, redis) {
  logger.info('handleSignupCallback', { data });

  if (data === 'signup_start') {
    const { handleSignup } = await import('./commands-v3.js');
    return await handleSignup(userId, chatId, redis);
  }

  return {
    chat_id: chatId,
    text: '❌ Unknown signup action.'
  };
}

export default {
  handleCallbackQuery,
  handleMenuCallback,
  handleVVIPCallback,
  handleHelpCallback,
  handleOddsCallback,
  handleAnalyzeCallback,
  handleNewsCallback,
  handleBettingCallback,
  handleSignupCallback
};
