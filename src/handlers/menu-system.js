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

Welcome back! 👋 I'm BETRIX — here to help you find great bets, fast insights, and match-winning ideas.

What would you like to do today?

*Tip:* Try typing a natural question like "Who are the favorites tonight?" or press a button below to get started.`,
  
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
  // Lively, helpful fallback when no live matches
  if (!games || games.length === 0) {
    return `${BETRIX_HEADER}

🔴 *No live ${sport.toLowerCase()} matches right now*

Seems quiet at the moment — here's what you can do:
• 🔎 Try /today to see upcoming fixtures.
• 🔔 Turn on alerts for your favourite teams in /profile.
• 📈 Check trending odds: /odds <fixture-id>

I'll notify you when a match starts. Meanwhile, want a quick prediction demo? Type "analyze Liverpool vs Man City".`;
  }

  let text = `${BETRIX_HEADER}

🔴 *Live ${sport} Matches* (${games.length}) — quick highlights:

`;

  for (let i = 0; i < Math.min(games.length, 10); i++) {
    const game = games[i];
    // Friendly formatting with emoji and short status
    const status = game.status || 'LIVE';
    const minute = game.minute ? ` • ${game.minute}'` : '';
    text += `${i + 1}. *${game.home}* vs *${game.away}* — ${status}${minute}\n`;
    if (game.score) text += `   Score: ${game.score.home} - ${game.score.away}\n`;
    text += `   Tip: ${game.tip || 'No tip yet — run /analyze for a short preview'}\n\n`;
  }

  text += `⚡ Use /odds <fixture-id> to view current odds, or tap /analyze <home> vs <away> for a prediction.`;
  return text;
}

// ============================================================================
// FORMATTERS - Odds & Analysis
// ============================================================================

export function formatOdds(odds, fixtureId) {
  // Provide a lively, explanatory odds summary
  return `${BETRIX_HEADER}

💰 *Odds & Quick Analysis*

Match: ${fixtureId || 'Fixture details'}

🏷️ *Odds Snapshot:*
• Home Win: ${odds?.home || '1.50'}
• Draw: ${odds?.draw || '3.20'}
• Away Win: ${odds?.away || '4.50'}

🔍 *Quick Insight:*
• Recommendation: *${odds?.recommended || 'Home Win'}*
• Confidence: *${odds?.confidence || '78%'}*

💡 Tip: Compare multiple bookmakers and look for >10% edge before staking.
Type /analyze <home> vs <away> for a short prediction, or upgrade to VVIP for full reports.`;
}

// ============================================================================
// FORMATTERS - Standings
// ============================================================================

export function formatStandings(league, leagueName = 'Premier League') {
  // Lively standings with short actionable note
  return `${BETRIX_HEADER}

🏆 *${leagueName} - Current Standings*

1. Team A · MP:10 · W:7 · D:2 · L:1 · GD:+12 · Pts:23
2. Team B · MP:10 · W:6 · D:3 · L:1 · GD:+10 · Pts:21
3. Team C · MP:10 · W:6 · D:2 · L:2 · GD:+8  · Pts:20

🔎 Want deeper analytics? Try /analyze <team1> vs <team2> or upgrade to VVIP for detailed trend reports.`;
}

// ============================================================================
// FORMATTERS - News
// ============================================================================

export function formatNews(articles = []) {
  if (!articles || articles.length === 0) {
    return `${BETRIX_HEADER}

📰 *Latest Sports News*

No fresh headlines right now — here's what's trending recently:
• Transfer gossip: top 5 moves
• Injury round-up: key players returning
• Weekend previews: matches to watch

Type /news <id> to open a story. Want a curated digest? Upgrade to VVIP for personalized news.`;
  }

  let text = `${BETRIX_HEADER}\n\n📰 *Latest Sports Headlines*\n\n`;
  for (let i = 0; i < Math.min(5, articles.length); i++) {
    const a = articles[i];
    text += `• ${a.title || 'Headline ' + (i+1)} — ${a.source || 'Source'}\n`;
  }
  text += `\n🔎 Use /news <id> to read full story or /help for support.`;
  return text;
}

// ============================================================================
// FORMATTERS - Profile
// ============================================================================

export function formatProfile(user) {
  const tier = user?.tier || 'FREE';
  const joined = user?.created_at || 'Unknown';
  const bets = Number(user?.total_bets || 0);
  const wins = Number(user?.total_wins || 0);
  const winRate = bets > 0 ? ((wins / bets) * 100).toFixed(1) : 0;
  const streak = user?.current_streak || 0;

  return `${BETRIX_HEADER}

👤 *Your Profile*

ID: \`${user?.id || 'N/A'}\`
⭐ Tier: *${tier}*
📅 Joined: ${joined}

📊 *Performance*
• Total Bets: ${bets}
• Wins: ${wins}
• Win Rate: ${winRate}%
• Current Streak: ${streak} wins

🎯 *Pro Tip:* Keep your stakes proportional to bankroll. Use /vvip for full analytics and personalized staking plans.

🎁 Referral Code: \`${user?.referral_code || 'N/A'}\`

Need help? Tap /help or contact support@betrix.app`;
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
