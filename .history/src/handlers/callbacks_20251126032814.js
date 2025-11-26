/**
 * BETRIX Callback Handlers - Consolidated
 * Handles all inline button clicks from menus
 * 
 * Callback Types:
 * - menu_* → Menu navigation
 * - sport_* → Sport selection
 * - sub_* → Subscription tier selection
 * - pay_* → Payment method selection
 * - profile_* → Profile sub-menus
 * - help_* → Help sub-menus
 */

import { Logger } from '../utils/logger.js';
import {
  mainMenu,
  sportsMenu,
  subscriptionMenu,
  paymentMethodsMenu,
  profileMenu,
  helpMenu
} from './menu-system.js';
import { createPaymentOrder, getPaymentInstructions } from './payment-router.js';

const logger = new Logger('CallbackHandlers');

/**
 * Main callback router
 * Dispatches to specific handler based on callback_data prefix
 */
export async function handleCallback(data, chatId, userId, redis, services) {
  logger.info('Callback received', { userId, data });

  try {
    // Route by prefix
    if (data.startsWith('menu_')) {
      return handleMenuCallback(data, chatId, userId, redis);
    }
    
    if (data.startsWith('sport_')) {
      return handleSportCallback(data, chatId, userId, redis);
    }
    
    if (data.startsWith('league_')) {
      return await handleLeagueCallback(data, chatId, userId, redis, services);
    }
    
    if (data.startsWith('sub_')) {
      return handleSubscriptionCallback(data, chatId, userId, redis);
    }
    
    if (data.startsWith('pay_')) {
      return await handlePaymentCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('news_')) {
      return await handleNewsArticleCallback(data, chatId, userId, redis, services);
    }
    
    if (data.startsWith('profile_')) {
      return handleProfileCallback(data, chatId, userId, redis);
    }
    
    if (data.startsWith('help_')) {
      return handleHelpCallback(data, chatId, userId, redis);
    }
    
    // Unknown callback
    return {
      chat_id: chatId,
      text: '🤔 Unknown action. Try /menu',
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error(`Callback ${data} failed`, err);
    return {
      chat_id: chatId,
      text: '❌ Error processing action',
      parse_mode: 'Markdown'
    };
  }
}

// ============================================================================
// MENU CALLBACKS (menu_*)
// ============================================================================

function handleMenuCallback(data, chatId, userId, redis) {
  logger.info('handleMenuCallback', { data });

  const menuMap = {
    'menu_main': mainMenu,
    'menu_live': {
      text: '⚽ *Select a Sport for Live Matches:*',
      reply_markup: sportsMenu.reply_markup
    },
    'menu_odds': {
      text: '📊 *Select a Sport for Odds & Analysis:*',
      reply_markup: sportsMenu.reply_markup
    },
    'menu_standings': {
      text: '🏆 *Select a League for Standings:*',
      reply_markup: sportsMenu.reply_markup
    },
    'menu_news': {
      text: '📰 *Loading latest sports news...*\n\nTop stories: Transfers, injuries, previews',
      reply_markup: mainMenu.reply_markup
    },
    'menu_profile': profileMenu,
    'menu_vvip': subscriptionMenu,
    'menu_help': helpMenu
  };

  const menu = menuMap[data];
  if (!menu) {
    return {
      chat_id: chatId,
      text: '🤔 Menu not found',
      parse_mode: 'Markdown'
    };
  }

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text: menu.text,
    reply_markup: menu.reply_markup,
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// SPORT CALLBACKS (sport_*)
// ============================================================================

function handleSportCallback(data, chatId, userId, redis) {
  logger.info('handleSportCallback', { data });

  const sport = data.replace('sport_', '').toUpperCase();
  const sportNames = {
    'FOOTBALL': '⚽ Football',
    'BASKETBALL': '🏀 Basketball',
    'TENNIS': '🎾 Tennis',
    'NFL': '🏈 American Football',
    'HOCKEY': '🏒 Ice Hockey',
    'BASEBALL': '⚾ Baseball'
  };

  const sportName = sportNames[sport] || sport;

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text: `${sportName} - *Loading matches...*\n\n⏳ Fetching live games and odds`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh', callback_data: `sport_${sport.toLowerCase()}` }],
        [{ text: '🔙 Back', callback_data: 'menu_live' }]
      ]
    },
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// SUBSCRIPTION CALLBACKS (sub_*)
// ============================================================================

function handleSubscriptionCallback(data, chatId, userId, redis) {
  logger.info('handleSubscriptionCallback', { data });

  const tier = data.replace('sub_', '').toUpperCase();
  
  const tierPrices = {
    'FREE': { name: 'Free Community', price: 'Free', benefits: 'Basic access' },
    'PRO': { name: 'Pro Tier', price: 'KES 899/month', benefits: 'AI analysis + real-time odds' },
    'VVIP': { name: 'VVIP (Most Popular)', price: 'KES 2,699/month', benefits: 'All Pro + predictions' },
    'PLUS': { name: 'BETRIX Plus', price: 'KES 8,999/month', benefits: 'Everything + VIP support' }
  };

  const tierInfo = tierPrices[tier] || tierPrices['FREE'];

  const text = `🎯 *${tierInfo.name}*

💰 Price: ${tierInfo.price}
✨ Features: ${tierInfo.benefits}

Ready to upgrade? Select a payment method below:`;

  // Only show payment methods for non-free tiers
  const keyboard = tier === 'FREE'
    ? mainMenu.reply_markup
    : paymentMethodsMenu(tier).reply_markup;

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text: text,
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// PAYMENT CALLBACKS (pay_*)
// ============================================================================

async function handlePaymentCallback(data, chatId, userId, redis, services) {
  logger.info('handlePaymentCallback', { data, userId });

  try {
    // Parse: pay_METHOD_TIER
    const parts = data.split('_');
    const method = parts[1].toUpperCase();
    const tier = parts[2]?.toUpperCase() || 'VVIP';

    // Create payment order
    const order = await createPaymentOrder(redis, userId, tier, method, 'KE', {});
    
    if (!order) {
      return {
        chat_id: chatId,
        text: '❌ Error creating payment order. Try again later.',
        parse_mode: 'Markdown'
      };
    }

      // Get payment instructions (use redis + orderId signature)
      const instructions = await getPaymentInstructions(redis, order.orderId, method);

      // Normalize instructions into a markdown-friendly block
      let instructionsText = '';
      try {
        if (!instructions) {
          instructionsText = '_No instructions available for this method._';
        } else if (instructions.checkoutUrl) {
          // PayPal or similar
          instructionsText = `${instructions.description || ''}\n\n[🔗 Click to Pay](${instructions.checkoutUrl})`;
        } else if (instructions.tillNumber) {
          // Safaricom till
          instructionsText = `${instructions.description || ''}\n\nTill: \`${instructions.tillNumber}\`\nRef: \`${instructions.reference}\`\nAmount: *${instructions.amount} ${instructions.currency || 'KES'}*`;
        } else if (instructions.steps && Array.isArray(instructions.steps)) {
          instructionsText = `${instructions.description || ''}\n\n` + instructions.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
        } else {
          // Fallback: stringify
          instructionsText = JSON.stringify(instructions, null, 2);
        }
      } catch (e) {
        logger.warn('Failed to render payment instructions', e);
        instructionsText = instructions && typeof instructions === 'string' ? instructions : '_Unable to build payment instructions_';
      }









      // Build comprehensive confirmation screen
      let confirmText = `✅ *Payment Order Created*\n\n📋 *Order Details:*\nOrder ID: \`${order.orderId}\`\nUser ID: \`${userId}\`\nTier: *${getTierDisplayName(tier)}*\nAmount: *KES ${getTierAmount(tier)}*\nStatus: ⏳ Pending Payment\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n💳 *Payment Method: ${getMethodName(method)}*\n\n${instructionsText}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏱️ *Next Steps:*\n1️⃣ Send payment using the details above\n2️⃣ Wait for confirmation (usually instant)\n3️⃣ Click "✅ Confirm Payment Sent" when done\n\n❗ *Important:*\n• Screenshot your payment confirmation for support\n• Payment may take 5-10 minutes to appear\n• Check "Check Status" to verify payment\n\n*Questions?* Contact support@betrix.app`;

    // Build keyboard with confirmation + status check
    // If PayPal checkout URL is available, show a direct Pay button linking to PayPal
    const keyboard = { inline_keyboard: [] };
    if (instructions && instructions.checkoutUrl) {
      keyboard.inline_keyboard.push([
        { text: '💳 Pay with PayPal', url: instructions.checkoutUrl }
      ]);
      // Also provide a server-side checkout redirect (use PUBLIC_URL if configured)
      try {
        const base = process.env.PUBLIC_URL || 'https://betrix.app';
        const redirect = `${base.replace(/\/$/, '')}/pay/checkout?orderId=${order.orderId}`;
        keyboard.inline_keyboard.push([
          { text: '🔗 Open Checkout (BETRIX)', url: redirect }
        ]);
      } catch (e) {
        // ignore
      }
    }
    keyboard.inline_keyboard.push([
      { text: '✅ Confirm Payment Sent', callback_data: `verify_${order.orderId}` },
      { text: '🔄 Check Status', callback_data: `status_${order.orderId}` }
    ]);
    keyboard.inline_keyboard.push([
      { text: '❌ Cancel Order', callback_data: 'menu_vvip' }
    ]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      text: confirmText,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handlePaymentCallback error', err);
    return {
      chat_id: chatId,
      text: `❌ Payment error: ${err.message}\n\nTry again or contact support`,
      parse_mode: 'Markdown'
    };
  }
}

// ============================================================================
// PROFILE CALLBACKS (profile_*)
// ============================================================================

function handleProfileCallback(data, chatId, userId, redis) {
  logger.info('handleProfileCallback', { data });

  const subMenuMap = {
    'profile_stats': {
      text: `📊 *Your Stats*

Bets Placed: 42
Win Rate: 64%
Favorite Sport: Football

View detailed analytics in VVIP tier.`,
      keyboard: profileMenu.reply_markup
    },
    'profile_bets': {
      text: `💰 *Your Transactions*

Recent:
• Nov 25: +KES 2,699 (Pro upgrade)
• Nov 24: +KES 1,500 (Credit)
• Nov 23: -KES 500 (Bet)`,
      keyboard: profileMenu.reply_markup
    },
    'profile_favorites': {
      text: `⭐ *Your Favorites*

Teams: Liverpool, Manchester City
Leagues: Premier League, La Liga
Sports: Football, Basketball`,
      keyboard: profileMenu.reply_markup
    },
    'profile_settings': {
      text: `⚙️ *Settings*

🔔 Notifications: Enabled
🌙 Theme: Auto
🔐 Privacy: Private

Contact support for more options.`,
      keyboard: profileMenu.reply_markup
    }
  };

  const submenu = subMenuMap[data] || subMenuMap['profile_stats'];

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text: submenu.text,
    reply_markup: submenu.keyboard,
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// HELP CALLBACKS (help_*)
// ============================================================================

function handleHelpCallback(data, chatId, userId, redis) {
  logger.info('handleHelpCallback', { data });

  const helpTopics = {
    'help_faq': `❓ *Frequently Asked Questions*

**Q: How do I get live odds?**
A: Use /live command or select from menu

**Q: What's the win rate accuracy?**
A: 85%+ in VVIP tier

**Q: Do you support international users?**
A: Yes! PayPal available for most countries`,
    
    'help_demo': `🎮 *Try Demo Features*

Here's a sample match analysis:

Liverpool vs Man City
Confidence: 82%
Prediction: Draw

Full analysis in VVIP tier.`,
    
    'help_contact': `📧 *Contact Support*

Email: support@betrix.app
Response: ~2 hours
Chat: Available in VVIP tier

Hours: 9 AM - 6 PM EAT`
  };

  const content = helpTopics[data] || helpTopics['help_faq'];

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text: content,
    reply_markup: helpMenu.reply_markup,
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// NEWS ARTICLE CALLBACK (news_<index>)
// ============================================================================

async function handleNewsArticleCallback(data, chatId, userId, redis, services) {
  logger.info('handleNewsArticleCallback', { data, userId });

  const parts = data.split('_');
  const idx = Number(parts[1]);

  // Try to fetch articles from services
  let articles = [];
  try {
    if (services && services.api) {
      if (typeof services.api.fetchNews === 'function') {
        articles = await services.api.fetchNews();
      } else if (typeof services.api.get === 'function') {
        const res = await services.api.get('/news');
        articles = res?.data || res || [];
      }
    }
  } catch (e) {
    logger.warn('Failed to fetch news in callback', e);
  }

  const article = Array.isArray(articles) && articles[idx] ? articles[idx] : null;

  if (!article) {
    return {
      method: 'editMessageText',
      chat_id: chatId,
      text: '📰 Article not available. Try /news to refresh.',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_news' }]] },
      parse_mode: 'Markdown'
    };
  }

  const text = `📰 *${article.title || 'Article'}*\n\n${article.summary || article.description || article.content || 'Read more at the source.'}\n\n🔗 [Open in browser](${article.url || '#'})`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Open in Browser', url: article.url || undefined }],
      [{ text: '🔙 Back to News', callback_data: 'menu_news' }]
    ]
  };

  return {
    method: 'editMessageText',
    chat_id: chatId,
    text,
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getTierAmount(tier) {
  const amounts = {
    'PRO': 899,
    'VVIP': 2699,
    'PLUS': 8999,
    'FREE': 0
  };
  return amounts[tier] || 2699;
}

function getTierDisplayName(tier) {
  const names = {
    'PRO': 'Pro Tier 📊',
    'VVIP': 'VVIP Tier 👑',
    'PLUS': 'BETRIX Plus 💎',
    'FREE': 'Free Tier'
  };
  return names[tier] || tier;
}

function getMethodName(method) {
  const names = {
    'TILL': `🏪 Safaricom Till #${process.env.MPESA_TILL || '606215'}`,
    'MPESA': '📱 M-Pesa (STK)',
    'PAYPAL': '💳 PayPal',
    'BINANCE': '₿ Binance Pay',
    'SWIFT': '🏦 Bank Transfer'
  };
  return names[method] || method;
}

export default {
  handleCallback,
  handleMenuCallback,
  handleSportCallback,
  handleSubscriptionCallback,
  handlePaymentCallback,
  handleProfileCallback,
  handleHelpCallback
};
