/**
 * Menu Handler - Main menu navigation for BETRIX bot
 * Provides inline keyboard menus and command responses with BETRIX branding
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('MenuHandler');

const BETRIX_EMOJI = '🌀';
const BETRIX_HEADER = `${BETRIX_EMOJI} *BETRIX* - Premium Sports Analytics`;
const TILL_NUMBER = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';

export const mainMenu = {
  text: `${BETRIX_HEADER}

Your AI-powered sports betting companion. Get live odds, predictions, and analysis.

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
        { text: '⭐ Favorites', callback_data: 'profile_favorites' },
        { text: '👤 My Profile', callback_data: 'menu_profile' }
      ],
      [
        { text: '💰 Subscribe to VVIP', callback_data: 'menu_vvip' },
        { text: '📝 Sign Up', callback_data: 'signup_start' }
      ],
      [
        { text: '❓ Help', callback_data: 'menu_help' }
      ]
    ]
  }
};


// Add a Sign Up quick action to be used by handlers if needed
export const signUpAction = { text: '📝 Sign Up', callback_data: 'signup_start' };

/**
 * Welcome message for new users (pre-signup)
 */
export function welcomeNewUser() {
  return `${BETRIX_HEADER}

Welcome to BETRIX — your AI sports analyst.\n\n` +
    `▶️ *Quick Start:* Tap ⚽ Live Games to pick a sport, or ⭐ Favorites to add teams you care about.\n\n` +
    `🔒 Want more insights? Upgrade to VVIP for unlimited AI analysis and real-time alerts.\n\n` +
    `Tap *Subscribe to VVIP* or type /vvip to get started.`;
}

/**
 * Welcome message for returning or signed-up users
 */
export function welcomeReturningUser(user) {
  const name = (user && user.name) ? user.name : 'BETRIX User';
  const tier = (user && user.tier) ? user.tier : 'FREE';
  return `${BETRIX_HEADER}\n\nWelcome back, *${name}*! (${tier})\n\n` +
    `• Tap ⚽ Live Games to view live matches\n• Tap 📊 Odds & Analysis for predictions\n• Tap ⭐ Favorites to view your tracked teams\n\nGood luck — bet responsibly!`;
}

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
        { text: '🏉 Rugby', callback_data: 'sport_rugby' },
        { text: '🏏 Cricket', callback_data: 'sport_cricket' }
      ],
      [
        { text: '🔙 Back to Main', callback_data: 'menu_main' }
      ]
    ]
  }
};

export const subscriptionMenu = {
  text: `${BETRIX_HEADER}

*Unlock Premium Features with VVIP*

✨ *VVIP Benefits:*
• 🤖 Unlimited AI analysis
• 📈 Real-time odds & arbitrage alerts
• 🎯 Advanced predictions with 85%+ accuracy
• 📊 Historical data & trend analysis
• 🔔 Custom notifications
• 💳 No ads

💰 *Pricing (KES):*
• *📝 Signup Fee:* KES 150 (one-time) - Unlock analyze features
• Free: Community access
• Pro: KES 899/month
• VVIP: KES 2,699/month
• *BETRIX Plus Bundle:* KES 8,999/month

*Fixed-odds Packs:*
• Fixed Bronze (5 tips): KES 499/month
• Fixed Silver (15 tips): KES 1,299/month
• Fixed Gold (50 tips): KES 4,499/month

*Payment Options:*
🏪 Pay via Safaricom Till #${TILL_NUMBER} (Instant)
📱 M-Pesa (STK Push)
💳 PayPal
₿ Binance Pay / Bitcoin
🏦 Bank Transfer (SWIFT)

*Choose your plan:*`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '⭐ Free (Explore)', callback_data: 'sub_free' },
        { text: '📊 Pro Tier', callback_data: 'sub_pro' }
      ],
      [
        { text: '👑 VVIP (Most Popular)', callback_data: 'sub_vvip' },
        { text: '💎 BETRIX Plus', callback_data: 'sub_plus' }
      ],
      [
        { text: '🚀 Quick VVIP (Till)', callback_data: 'pay_quick_vvip' },
        { text: '🔙 Back', callback_data: 'menu_main' }
      ],
      [
        { text: '👑 Fixed Matches (VVIP)', callback_data: 'vvip_fixed' },
        { text: '🔍 Half/Full & Correct Scores', callback_data: 'vvip_advanced' }
      ],
      [
        { text: `🏪 Safaricom Till #${TILL_NUMBER}`, callback_data: 'pay_till' },
        { text: '📱 M-Pesa', callback_data: 'pay_mpesa' }
      ],
      [
        { text: '💳 PayPal', callback_data: 'pay_paypal' },
        { text: '₿ Binance', callback_data: 'pay_binance' }
      ],
      [
        { text: '🏦 Bank Transfer', callback_data: 'pay_swift' },
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  }
};

export const profileMenu = {
  text: `${BETRIX_HEADER}

*Your Profile*`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📊 My Stats', callback_data: 'profile_stats' },
        { text: '💰 My Bets', callback_data: 'profile_bets' }
      ],
      [
        { text: '⭐ Favorites', callback_data: 'profile_favorites' },
        { text: '📋 Settings', callback_data: 'profile_settings' }
      ],
      [
        { text: '🔙 Back to Main', callback_data: 'menu_main' }
      ]
    ]
  }
};

export const helpMenu = {
  text: `${BETRIX_HEADER}

*Quick Help*

📱 *How to use BETRIX:*

1️⃣ *Ask naturally:*
   "Which games are live today?"
   "Show me free odds"
   "Liverpool latest stats"

2️⃣ *Use commands:*
   /live - See live games
   /odds - Get current odds
   /standings - League standings
   /news - Latest news

3️⃣ *Subscribe for premium:*
   /vvip - Upgrade to premium

📧 *Need help?*
Contact: support@betrix.app

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

/**
 * Format a live games response with BETRIX branding
 */
export function formatLiveGames(games, sport = 'Football') {
  if (!games || games.length === 0) {
    return `${BETRIX_HEADER}

*No live ${sport.toLowerCase()} matches right now.*

Check back later for exciting matchups! ⚽`;
  }
  let text = `${BETRIX_HEADER}\n\n*🔴 LIVE ${sport.toUpperCase()} MATCHES*\n`;

  games.slice(0, 10).forEach((game, i) => {
    text += `\n${i + 1}. *${game.home}* vs *${game.away}*`;
    if (game.score) text += `\n   • Score: ${game.score}`;
    if (game.time) text += `\n   • ⏱ ${game.time}`;
    if (game.odds) text += `\n   • 📊 Odds: ${game.odds}`;
    text += `\n   — Tap Details to analyze or ⭐ to add to Favorites`;
  });

  text += `\n\n✨ *Tip:* Use the *Details* button to get match stats, odds, and instant analysis.`;
  text += `\n\n_Powered by BETRIX Intelligence_`;

  return text;
}

/**
 * Build a live menu payload with inline keyboard for Telegram.
 * Returns an object { text, reply_markup } ready to send as a Telegram message.
 */
export function buildLiveMenuPayload(games, sport = 'Football', userTier = 'FREE', page = 1, pageSize = 6) {
  const header = BETRIX_HEADER;
  if (!games || games.length === 0) {
    return { text: `${header}\n\n*No live ${sport.toLowerCase()} matches right now.*\n\nCheck back later for exciting matchups! ⚽`, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]] } };
  }

  // Pagination calculations
  const total = games.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageGames = games.slice(start, end);

  let text = `${header}\n\n*🔴 LIVE ${sport.toUpperCase()} MATCHES* (Page ${currentPage}/${totalPages})\n`;
  const keyboard = [];

  pageGames.forEach((game, i) => {
    const idx = start + i + 1;
    text += `\n${idx}. *${game.home}* vs *${game.away}*`;
    if (game.score) text += `\n   • Score: ${game.score}`;
    if (game.time) text += `\n   • ⏱ ${game.time}`;
    text += `\n   — Tap Details to analyze or ⭐ to add to Favorites\n`;

    // action buttons per match: Details, Odds
    const matchId = game.id || `${sport}_${idx}`;
    const row = [
      { text: '🔎 Details', callback_data: validateCallbackData ? validateCallbackData(`match:${matchId}:${sport.toLowerCase()}`) : `match:${matchId}:${sport.toLowerCase()}` },
      { text: '💰 Odds', callback_data: validateCallbackData ? validateCallbackData(`odds:${matchId}`) : `odds:${matchId}` }
    ];
    keyboard.push(row);
  });

  // Navigation row: Prev / Refresh / Next / Back
  const navRow = [];
  if (currentPage > 1) navRow.push({ text: '◀️ Prev', callback_data: `menu_live_page:${sport.toLowerCase()}:${currentPage - 1}` });
  navRow.push({ text: '🔄 Refresh', callback_data: `menu_live_refresh:${sport.toLowerCase()}:${currentPage}` });
  if (currentPage < totalPages) navRow.push({ text: 'Next ▶️', callback_data: `menu_live_page:${sport.toLowerCase()}:${currentPage + 1}` });
  // Wrap into inline keyboard row(s)
  if (navRow.length > 0) keyboard.push(navRow);
  keyboard.push([{ text: '🔙 Back', callback_data: 'menu_main' }]);

  const reply_markup = { inline_keyboard: keyboard };
  return { text, reply_markup };
}

/**
 * Format odds response
 */
export function formatOdds(matches) {
  if (!matches || matches.length === 0) {
    return `${BETRIX_HEADER}

*No odds available at the moment.*`;
  }
  let text = `${BETRIX_HEADER}\n\n*📊 LIVE ODDS & PREDICTIONS*\n`;

  matches.slice(0, 8).forEach((m, i) => {
    text += `\n${i + 1}. *${m.home}* vs *${m.away}*`;
    text += `\n   • 💰 Home: ${m.homeOdds}  •  Draw: ${m.drawOdds}  •  Away: ${m.awayOdds}`;
    if (m.prediction) text += `\n   • 🤖 Prediction: ${m.prediction}`;
    if (m.value) text += `\n   • ⭐ Value Bet: ${m.value}`;
    text += `\n   — Tap a match to analyze or add to Favorites`;
  });

  text += `\n\n✨ *Unlock advanced odds analysis with VVIP — tap Subscribe to upgrade.*`;

  return text;
}

/**
 * Format standings response
 */
export function formatStandings(league, standings) {
  if (!standings || standings.length === 0) {
    return `${BETRIX_HEADER}

*No standings data available.*`;
  }
  let text = `${BETRIX_HEADER}\n\n*🏆 ${league.toUpperCase()} STANDINGS*\n`;
  text += '```\nPos Team              P   W   D   L   +/-  Pts\n';

  standings.slice(0, 12).forEach((team, i) => {
    text += `${String(i + 1).padEnd(3)}${team.name.substring(0, 16).padEnd(18)}${String(team.played).padStart(3)}   ${String(team.won).padStart(2)}   ${String(team.drawn).padStart(2)}   ${String(team.lost).padStart(2)}   ${String(team.goalDiff).padStart(3)}  ${String(team.points).padStart(3)}\n`;
  });

  text += '```\n_Powered by BETRIX Live Data_';

  return text;
}

/**
 * Format profile response with user stats
 */
export function formatProfile(user) {
  let text = `${BETRIX_HEADER}

*👤 YOUR PROFILE*

*User:* ${user.name || 'Guest'}
*Tier:* ${user.tier || 'Free'} ${user.tier === 'VVIP' ? '👑' : ''}
*Member Since:* ${user.joinDate || 'Today'}

*📊 Your Stats:*
• Total Predictions: ${user.predictions || 0}
• Win Rate: ${user.winRate || '0'}%
• Points Earned: ${user.points || 0}
• Referral Code: \`${user.referralCode || 'N/A'}\`

*💰 Referral Rewards:*
• Referrals: ${user.referrals || 0}
• Bonus Points: ${user.bonusPoints || 0}

*Next Tier:* ${user.nextTier || 'N/A'}`;

  return text;
}

/**
 * Format news response
 */
export function formatNews(articles) {
  if (!articles || articles.length === 0) {
    return `${BETRIX_HEADER}

*No news available at the moment.*`;
  }

  let text = `${BETRIX_HEADER}

*📰 LATEST SPORTS NEWS*\n`;
  
  articles.slice(0, 5).forEach((article, i) => {
    text += `\n${i + 1}. *${article.title}*`;
    if (article.source) text += `\n   📍 ${article.source}`;
    if (article.time) text += `\n   ⏰ ${article.time}`;
    if (article.excerpt) text += `\n   ${article.excerpt.substring(0, 100)}...`;
  });

  text += `\n\n_Powered by BETRIX Intelligence_`;
  
  return text;
}

/**
 * Format natural language response with BETRIX branding
 */
export function formatNaturalResponse(content) {
  return `${BETRIX_HEADER}

${content}

_BETRIX Analytics_`;
}

/**
 * Format payment/upgrade prompt
 */
export function formatUpgradePrompt(feature) {
  return `${BETRIX_HEADER}

*🔒 Premium Feature*

${feature} is available with *VVIP* subscription.

👑 *Unlock VVIP for:*
✓ Unlimited AI analysis
✓ Real-time odds alerts
✓ Advanced predictions
✓ No ads

💳 *$29.99/month or $99.99/month for BETRIX Plus*

Ready to upgrade? Tap below! 👇`;
}

export default {
  mainMenu,
  sportsMenu,
  subscriptionMenu,
  profileMenu,
  helpMenu,
  formatLiveGames,
  formatOdds,
  formatStandings,
  formatProfile,
  formatNews,
  formatNaturalResponse,
  formatUpgradePrompt
};
