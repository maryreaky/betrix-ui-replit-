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

Welcome back! 👋 Choose an option below or ask naturally (e.g. "Top picks tonight").`,

  // Modern compact grid: two-column primary actions, single-row utilities
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🔴 Live', callback_data: 'menu_live' },
        { text: '📊 Odds', callback_data: 'menu_odds' }
      ],
      [
        { text: '🏆 Standings', callback_data: 'menu_standings' },
        { text: '📰 News', callback_data: 'menu_news' }
      ],
      [
        { text: '💎 Subscribe', callback_data: 'menu_vvip' },
        { text: '👤 Profile', callback_data: 'menu_profile' }
      ],
      [
        { text: '❓ Help', callback_data: 'menu_help' },
        { text: '⚙️ Settings', callback_data: 'menu_help' }
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

🎉 Unlock Premium — simple plans, instant access.

Choose a plan below. Payment methods shown after selection.`,

  // Compact subscription card layout
  reply_markup: {
    inline_keyboard: [
      [ { text: '📊 Pro — KES 899/mo', callback_data: 'sub_pro' } ],
      [ { text: '👑 VVIP — KES 2,699/mo', callback_data: 'sub_vvip' } ],
      [ { text: '💎 PLUS — KES 8,999/mo', callback_data: 'sub_plus' } ],
      [ { text: '🔙 Back', callback_data: 'menu_main' } ]
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
    const fid = game.id ? ` (ID: ${game.id})` : '';
    text += `${i + 1}. *${game.home}* vs *${game.away}*${fid} — ${status}${minute}\n`;
    if (game.score) text += `   Score: ${game.score.home} - ${game.score.away}\n`;
    text += `   Tip: ${game.tip || 'No tip yet — run /analyze for a short preview'}\n\n`;
  }
  text += `⚡ Use \/odds <fixture-id> to view current odds (example: \/odds 12345), or run \/analyze <home> vs <away> for a prediction.`;
  return text;
}

// ============================================================================
// FORMATTERS - Odds & Analysis
// ============================================================================

export function formatOdds(odds, fixtureId) {
  // Provide a lively, explanatory odds summary
  // Try to pick common bookmaker snapshot fields if provided
  const homeOdd = odds?.home ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find(o => /home|1/i.test(o.name))?.price ?? odds?.bookmakers?.[0]?.bets?.[0]?.values?.[0]?.odd ?? 'N/A';
  const drawOdd = odds?.draw ?? 'N/A';
  const awayOdd = odds?.away ?? odds?.bookmakers?.[0]?.markets?.[0]?.outcomes?.find(o => /away|2/i.test(o.name))?.price ?? odds?.bookmakers?.[0]?.bets?.[0]?.values?.[2]?.odd ?? 'N/A';

  return `${BETRIX_HEADER}

💰 *Odds & Quick Analysis*

Match: ${fixtureId || 'Fixture details'}

🏷️ *Odds Snapshot:*
• Home Win: ${homeOdd}
• Draw: ${drawOdd}
• Away Win: ${awayOdd}

🔍 *Quick Insight:*
• Recommendation: *${odds?.recommended || 'Compare markets'}*
• Confidence: *${odds?.confidence || 'N/A'}*

💡 Tip: Compare multiple bookmakers and look for >10% edge before staking.
Type \/analyze <home> vs <away> for a short prediction, or upgrade to VVIP for full reports.`;
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
