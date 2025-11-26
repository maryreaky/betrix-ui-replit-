/**
 * BETRIX Menu System - Consolidated
 * All menu definitions, formatters, and UI builders in one module
 * 
 * Exports:
 * - mainMenu, sportsMenu, subscriptionMenu, profileMenu, helpMenu
 * - format* functions for each content type
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('MenuSystem');

const BETRIX_EMOJI = '🌀';
const BETRIX_HEADER = `${BETRIX_EMOJI} *BETRIX* - Premium Sports Analytics`;
const TILL_NUMBER = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';

// ============================================================================
// MAIN MENU
// ============================================================================

export const mainMenu = {
  text: `${BETRIX_HEADER}

Your AI-powered sports betting companion. Get live odds, predictions, and analysis.

*Quick Start:*
✨ Ask anything about sports, odds, and strategies
⚽ Browse live games, standings, or news
💰 Subscribe for premium features

*What would you like to do?*`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '⚽ Live Games', callback_data: 'menu_live' },
        { text: '📊 Odds & Analysis', callback_data: 'menu_odds' }
      ],
      [
        { text: '🏆 Standings', callback_data: 'menu_standings' },
        { text: '📰 Latest News', callback_data: 'menu_news' }
      ],
      [
        { text: '💰 Subscribe to VVIP', callback_data: 'menu_vvip' },
        { text: '👤 My Profile', callback_data: 'menu_profile' }
      ],
      [
        { text: '❓ Help', callback_data: 'menu_help' }
      ]
    ]
  }
};

// ============================================================================
// SPORTS MENU
// ============================================================================

export const sportsMenu = {
  text: `${BETRIX_HEADER}

*Select a Sport:*`,
  
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
        { text: '🔙 Back to Main', callback_data: 'menu_main' }
      ]
    ]
  }
};

// ============================================================================
// SUBSCRIPTION MENU (REDESIGNED)
// ============================================================================

export const subscriptionMenu = {
  text: `${BETRIX_HEADER}

*🎉 Unlock Premium Features with VVIP*

✨ *VVIP Benefits:*
• 🤖 Unlimited AI analysis
• 📈 Real-time odds & arbitrage alerts
• 🎯 Advanced predictions (85%+ accuracy)
• 📊 Historical data & trend analysis
• 🔔 Custom notifications
• 💳 No ads

💰 *Tier Pricing (KES):*
┌────────────────────────────────┐
│ Free        → Community access │
│ Pro    → KES 899/month  📊      │
│ VVIP   → KES 2,699/month ⭐    │ Most Popular
│ Plus   → KES 8,999/month 💎    │ Premium+VIP
└────────────────────────────────┘

🏪 *Payment Methods Available:*
${TILL_NUMBER ? `🏪 Safaricom Till #${TILL_NUMBER} - Instant (KES only)` : '🏪 Safaricom Till - Instant (KES)'}
📱 M-Pesa STK - Push & confirm
💳 PayPal - International cards
₿ Binance Pay - Crypto options
🏦 Bank Transfer - SWIFT (EUR/USD)

*Choose Your Plan:*
(Payment will be processed after selection)`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📊 Pro (KES 899)', callback_data: 'sub_pro' }
      ],
      [
        { text: '👑 VVIP (KES 2,699) - POPULAR ⭐', callback_data: 'sub_vvip' }
      ],
      [
        { text: '💎 BETRIX Plus (KES 8,999)', callback_data: 'sub_plus' }
      ],
      [
        { text: '🔙 Back to Menu', callback_data: 'menu_main' }
      ]
    ]
  }
};

// ============================================================================
// PAYMENT METHODS MENU (NEW)
// ============================================================================

export const paymentMethodsMenu = (tier) => ({
  text: `${BETRIX_HEADER}

*Choose Payment Method for ${tier} Tier*

Select one of our secure payment options below:`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: `🏪 Safaricom Till #${TILL_NUMBER}`, callback_data: `pay_till_${tier}` },
        { text: '📱 M-Pesa STK', callback_data: `pay_mpesa_${tier}` }
      ],
      [
        { text: '💳 PayPal', callback_data: `pay_paypal_${tier}` },
        { text: '₿ Binance Pay', callback_data: `pay_binance_${tier}` }
      ],
      [
        { text: '🏦 Bank Transfer', callback_data: `pay_swift_${tier}` },
        { text: '🔙 Back', callback_data: 'menu_vvip' }
      ]
    ]
  }
});

// ============================================================================
// PROFILE MENU
// ============================================================================

export const profileMenu = {
  text: `${BETRIX_HEADER}

*Your Profile*

Manage your account, view stats, and preferences.`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📊 My Stats', callback_data: 'profile_stats' },
        { text: '💰 My Transactions', callback_data: 'profile_bets' }
      ],
      [
        { text: '⭐ Favorites', callback_data: 'profile_favorites' },
        { text: '⚙️ Settings', callback_data: 'profile_settings' }
      ],
      [
        { text: '🔙 Back to Main', callback_data: 'menu_main' }
      ]
    ]
  }
};

// ============================================================================
// HELP MENU
// ============================================================================

export const helpMenu = {
  text: `${BETRIX_HEADER}

*Quick Help*

📱 *How to use BETRIX:*

1️⃣ *Ask naturally:*
   "Which games are live today?"
   "Show me odds for Liverpool"
   "What's the best bet this week?"

2️⃣ *Use Commands:*
   /live - See live games
   /odds - Get current odds  
   /standings - League standings
   /news - Latest news
   /profile - Your account

3️⃣ *Subscribe for premium:*
   /vvip - Upgrade your plan

📧 *Need Help?*
Contact: support@betrix.app
Response time: ~2 hours

*What can I help with?*`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '❓ FAQ', callback_data: 'help_faq' },
        { text: '🎮 Try Demo', callback_data: 'help_demo' }
      ],
      [
        { text: '📧 Contact Support', callback_data: 'help_contact' },
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  }
};

// ============================================================================
// FORMATTERS - Live Games
// ============================================================================

export function formatLiveGames(games, sport = 'Football') {
  if (!games || games.length === 0) {
    return `${BETRIX_HEADER}

*No live ${sport.toLowerCase()} matches right now*

⏳ Check back later for exciting matchups! 🎯

🔔 *Tip:* Follow us for match alerts`;
  }

  let text = `${BETRIX_HEADER}

*Live ${sport} Matches* (${games.length})

`;
  
  for (let i = 0; i < Math.min(games.length, 10); i++) {
    const game = games[i];
    text += `${i + 1}. ${game.home} vs ${game.away}\n   ⏱️ ${game.time}\n\n`;
  }
  
  return text;
}

// ============================================================================
// FORMATTERS - Odds & Analysis
// ============================================================================

export function formatOdds(odds, fixtureId) {
  return `${BETRIX_HEADER}

*Odds & Analysis*

Match: ${fixtureId || 'Fixture details'}

💰 *Current Odds:*
Home Win: 1.50
Draw: 3.20
Away Win: 4.50

📊 *AI Analysis:*
Confidence: 78%
Recommended Bet: Home Win

*Tip:* Full analysis available in VVIP tier`;
}

// ============================================================================
// FORMATTERS - Standings
// ============================================================================

export function formatStandings(league, leagueName = 'Premier League') {
  return `${BETRIX_HEADER}

*${leagueName} Standings*

1. Team A          MP:10 W:7 D:2 L:1 GD:+12 Pts:23
2. Team B          MP:10 W:6 D:3 L:1 GD:+10 Pts:21
3. Team C          MP:10 W:6 D:2 L:2 GD:+8  Pts:20

📊 More details in full view`;
}

// ============================================================================
// FORMATTERS - News
// ============================================================================

export function formatNews(articles = []) {
  return `${BETRIX_HEADER}

*Latest Sports News*

• Transfer window: Top 5 moves this season
• Injury updates: Which stars are back?
• Weekend previews: Must-watch matches

📰 Read more: /news [story_id]`;
}

// ============================================================================
// FORMATTERS - Profile
// ============================================================================

export function formatProfile(user) {
  const tier = user?.tier || 'FREE';
  const joined = user?.created_at || 'Unknown';
  const bets = user?.total_bets || 0;
  const wins = user?.total_wins || 0;
  const winRate = bets > 0 ? ((wins / bets) * 100).toFixed(1) : 0;

  return `${BETRIX_HEADER}

*Your Profile*

👤 ID: ${user?.id || 'N/A'}
⭐ Tier: *${tier}*
📅 Joined: ${joined}

📊 *Stats:*
Total Bets: ${bets}
Wins: ${wins}
Win Rate: ${winRate}%

🎁 Referral Code: \`${user?.referral_code || 'N/A'}\`

Use /vvip to upgrade or manage your subscription`;
}

// ============================================================================
// UTILITY - Build Dynamic Menu
// ============================================================================

/**
 * Build a menu based on user tier
 * Shows different options based on subscription level
 */
export function buildTierAwareMenu(tier) {
  const baseButtons = [
    [
      { text: '⚽ Live Games', callback_data: 'menu_live' },
      { text: '📊 Odds & Analysis', callback_data: 'menu_odds' }
    ]
  ];
  
  if (tier === 'FREE') {
    baseButtons.push([
      { text: '💰 Upgrade to VVIP', callback_data: 'menu_vvip' }
    ]);
  } else if (['PRO', 'VVIP', 'PLUS'].includes(tier)) {
    baseButtons.push([
      { text: '🎯 Advanced Features', callback_data: 'menu_advanced' }
    ]);
  }
  
  baseButtons.push([
    { text: '👤 Profile', callback_data: 'menu_profile' },
    { text: '❓ Help', callback_data: 'menu_help' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: baseButtons
    }
  };
}

export default {
  mainMenu,
  sportsMenu,
  subscriptionMenu,
  paymentMethodsMenu,
  profileMenu,
  helpMenu,
  formatLiveGames,
  formatOdds,
  formatStandings,
  formatNews,
  formatProfile,
  buildTierAwareMenu
};
