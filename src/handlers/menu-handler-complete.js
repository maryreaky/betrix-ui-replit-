/**
 * BETRIX Complete Menu Handler - v3
 * Comprehensive menu structure with all features, buttons, and payment systems
 * Every button properly structured with correct callbacks
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('MenuHandlerComplete');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TILL_NUMBER = process.env.MPESA_TILL || '606215';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@betrix.app';
const ADMIN_ID = process.env.ADMIN_ID || '';

// ============================================================================
// PRICING & SUBSCRIPTION PLANS
// ============================================================================

export const SUBSCRIPTION_PLANS = {
  FREE: {
    id: 'free',
    name: 'Free Tier',
    emoji: '🎯',
    price: 'FREE',
    features: [
      'Live match updates',
      'Basic odds display',
      'Community predictions',
      'Limited predictions/day',
      'Standard support'
    ]
  },
  PRO: {
    id: 'pro',
    name: 'Pro Tier',
    emoji: '⭐',
    price: 'KES 899/month',
    priceUSD: '$8.99/month',
    features: [
      'All Free features',
      'Advanced odds analysis',
      'Unlimited predictions',
      'Match insights & stats',
      'Priority support',
      'Ad-free experience',
      'Custom notifications'
    ]
  },
  VVIP: {
    id: 'vvip',
    name: 'VVIP Premium',
    emoji: '👑',
    price: 'KES 2,699/month',
    priceUSD: '$29.99/month',
    features: [
      'All Pro features',
      'Unlimited AI analysis',
      'Real-time odds alerts',
      'Advanced predictions (85%+ accuracy)',
      'Arbitrage opportunities',
      'Match analysis reports',
      '24/7 VIP support',
      'Exclusive VVIP chat',
      'Early access to features'
    ]
  },
  PLUS: {
    id: 'plus',
    name: 'BETRIX Plus Bundle',
    emoji: '💎',
    price: 'KES 8,999/month',
    priceUSD: '$99.99/month',
    features: [
      'All VVIP features',
      'Fixed match predictions',
      'Half-time/Full-time analysis',
      'Correct score predictions',
      'Monthly bonus credits',
      'Private analyst access',
      'Personal recommendation',
      'Exclusive webinars'
    ]
  }
};

export const FIXED_ODDS_PACKS = {
  BRONZE: {
    id: 'bronze',
    name: 'Fixed Bronze',
    emoji: '🥉',
    price: 'KES 499/month',
    priceUSD: '$4.99/month',
    tipsPerMonth: 5
  },
  SILVER: {
    id: 'silver',
    name: 'Fixed Silver',
    emoji: '🥈',
    price: 'KES 1,299/month',
    priceUSD: '$12.99/month',
    tipsPerMonth: 15
  },
  GOLD: {
    id: 'gold',
    name: 'Fixed Gold',
    emoji: '🥇',
    price: 'KES 4,499/month',
    priceUSD: '$44.99/month',
    tipsPerMonth: 50
  }
};

export const PAYMENT_METHODS = {
  TILL: {
    id: 'till',
    name: 'Safaricom Till',
    emoji: '🏪',
    details: `Pay to Till #${TILL_NUMBER}`,
    speed: 'Instant'
  },
  MPESA: {
    id: 'mpesa',
    name: 'M-Pesa',
    emoji: '📱',
    details: 'STK Push to your phone',
    speed: 'Instant'
  },
  PAYPAL: {
    id: 'paypal',
    name: 'PayPal',
    emoji: '💳',
    details: 'Secure PayPal payment',
    speed: '1-2 minutes'
  },
  BINANCE: {
    id: 'binance',
    name: 'Binance Pay',
    emoji: '₿',
    details: 'Crypto payment',
    speed: 'Instant'
  },
  BANK: {
    id: 'bank',
    name: 'Bank Transfer',
    emoji: '🏦',
    details: 'SWIFT International',
    speed: '2-3 hours'
  }
};

// ============================================================================
// MAIN MENU
// ============================================================================

export const mainMenu = {
  text: `🌀 *BETRIX* - Premium Sports Analytics

Your AI-powered sports betting companion.
Get live odds, predictions, and analysis.

*What would you like to do?*`,
  
  reply_markup: {
    inline_keyboard: [
      // Row 1: Live & Odds
      [
        { text: '⚽ Live Games', callback_data: 'live_games' },
        { text: '📊 Odds & Analysis', callback_data: 'odds_analysis' }
      ],
      // Row 2: Standings & News
      [
        { text: '🏆 Standings', callback_data: 'standings' },
        { text: '📰 Latest News', callback_data: 'news' }
      ],
      // Row 3: Profile & Favorites
      [
        { text: '👤 My Profile', callback_data: 'profile' },
        { text: '⭐ Favorites', callback_data: 'favorites' }
      ],
      // Row 4: Subscription
      [
        { text: '👑 Subscribe/Upgrade', callback_data: 'subscription' }
      ],
      // Row 5: Help
      [
        { text: '❓ Help & Support', callback_data: 'help' }
      ]
    ]
  }
};

// ============================================================================
// SPORTS SELECTOR
// ============================================================================

export const sportsMenu = {
  text: `🌀 *BETRIX* - Select a Sport

*Available Sports:*`,
  
  reply_markup: {
    inline_keyboard: [
      [
        { text: '⚽ Football', callback_data: 'sport:football' },
        { text: '🏀 Basketball', callback_data: 'sport:basketball' }
      ],
      [
        { text: '🏈 American Football', callback_data: 'sport:nfl' },
        { text: '🎾 Tennis', callback_data: 'sport:tennis' }
      ],
      [
        { text: '🏒 Ice Hockey', callback_data: 'sport:hockey' },
        { text: '⚾ Baseball', callback_data: 'sport:baseball' }
      ],
      [
        { text: '🏉 Rugby', callback_data: 'sport:rugby' },
        { text: '🏏 Cricket', callback_data: 'sport:cricket' }
      ],
      [
        { text: '🔙 Back to Menu', callback_data: 'menu_main' }
      ]
    ]
  }
};

// ============================================================================
// LIVE GAMES MENU
// ============================================================================

export function buildLiveGamesMenu(matches = [], sport = 'football', page = 1) {
  const pageSize = 5;
  const total = matches.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageMatches = matches.slice(start, start + pageSize);

  let text = `🌀 *BETRIX* - Live ${sport.toUpperCase()} Matches\n\n`;
  
  if (total === 0) {
    text += `No live ${sport} matches at the moment. Check back soon! ⏰`;
  } else {
    text += `🔴 *LIVE NOW* (${total} total, showing ${start + 1}-${Math.min(start + pageSize, total)})\n\n`;
    
    pageMatches.forEach((match, idx) => {
      const num = start + idx + 1;
      const score = match.homeScore !== undefined ? `${match.homeScore}-${match.awayScore}` : 'TBA';
      text += `*${num}. ${match.home}* ${score} *${match.away}*\n`;
      if (match.time) text += `   ⏱ ${match.time}\n`;
      if (match.league) text += `   🏟 ${match.league}\n`;
      text += `\n`;
    });
  }

  text += `_Powered by SportMonks Real-Time Data_`;

  const keyboard = [];

  // Match action buttons
  pageMatches.forEach((match, idx) => {
    const matchId = match.id || `${sport}_${start + idx}`;
    keyboard.push([
      { text: `🔎 ${match.home} vs ${match.away}`, callback_data: `match:${matchId}:${sport}` }
    ]);
  });

  // Navigation
  const navRow = [];
  if (currentPage > 1) {
    navRow.push({ text: '◀ Previous', callback_data: `live:${sport}:${currentPage - 1}` });
  }
  navRow.push({ text: '🔄 Refresh', callback_data: `live:${sport}:${currentPage}` });
  if (currentPage < totalPages) {
    navRow.push({ text: 'Next ▶', callback_data: `live:${sport}:${currentPage + 1}` });
  }
  if (navRow.length > 0) keyboard.push(navRow);

  // Bottom row
  keyboard.push([
    { text: '🏟 Pick Sport', callback_data: 'sports' },
    { text: '🔙 Menu', callback_data: 'menu_main' }
  ]);

  return {
    text,
    reply_markup: { inline_keyboard: keyboard }
  };
}

// ============================================================================
// ODDS & ANALYSIS MENU
// ============================================================================

export function buildOddsMenu(matches = []) {
  let text = `🌀 *BETRIX* - Odds & Analysis\n\n`;

  if (matches.length === 0) {
    text += `📊 No odds data available at the moment.\n\nCheck back soon for live odds updates!`;
  } else {
    text += `📊 *LIVE ODDS & PREDICTIONS*\n\n`;
    
    matches.slice(0, 8).forEach((match, idx) => {
      text += `*${idx + 1}. ${match.home}* vs *${match.away}*\n`;
      text += `   💰 ${match.homeOdds} | Draw: ${match.drawOdds} | ${match.awayOdds}\n`;
      if (match.prediction) text += `   🤖 Prediction: ${match.prediction}\n`;
      if (match.confidence) text += `   ⭐ Confidence: ${match.confidence}%\n`;
      text += `\n`;
    });
  }

  text += `_More detailed analysis available with VVIP subscription_`;

  const keyboard = [];

  matches.slice(0, 5).forEach((match, idx) => {
    keyboard.push([
      { text: `📈 ${match.home} vs ${match.away}`, callback_data: `odds:${match.id}` }
    ]);
  });

  keyboard.push([
    { text: '👑 Get VIP Analysis', callback_data: 'subscription' },
    { text: '🔙 Menu', callback_data: 'menu_main' }
  ]);

  return {
    text,
    reply_markup: { inline_keyboard: keyboard }
  };
}

// ============================================================================
// STANDINGS MENU
// ============================================================================

export function buildStandingsMenu() {
  const text = `🌀 *BETRIX* - League Standings

*Select a League:*`;

  const reply_markup = {
    inline_keyboard: [
      // Row 1: European Leagues
      [
        { text: '🇬🇧 Premier League', callback_data: 'standings:premier' },
        { text: '🇪🇸 La Liga', callback_data: 'standings:laliga' }
      ],
      [
        { text: '🇮🇹 Serie A', callback_data: 'standings:seriea' },
        { text: '🇩🇪 Bundesliga', callback_data: 'standings:bundesliga' }
      ],
      [
        { text: '🇫🇷 Ligue 1', callback_data: 'standings:ligue1' },
        { text: '🇳🇱 Eredivisie', callback_data: 'standings:eredivisie' }
      ],
      // Row 3: International
      [
        { text: '🌍 Champions League', callback_data: 'standings:ucl' },
        { text: '🏆 Europa League', callback_data: 'standings:uel' }
      ],
      // Row 4: Other Sports
      [
        { text: '🏀 NBA', callback_data: 'standings:nba' },
        { text: '🏈 NFL', callback_data: 'standings:nfl' }
      ],
      // Navigation
      [
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// NEWS MENU
// ============================================================================

export function buildNewsMenu() {
  const text = `🌀 *BETRIX* - Latest Sports News

*Select Category:*`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '⚽ Football News', callback_data: 'news:football' },
        { text: '🏀 Basketball', callback_data: 'news:basketball' }
      ],
      [
        { text: '🏈 American Football', callback_data: 'news:nfl' },
        { text: '🎾 Tennis', callback_data: 'news:tennis' }
      ],
      [
        { text: '📰 Breaking News', callback_data: 'news:breaking' },
        { text: '💔 Transfer News', callback_data: 'news:transfers' }
      ],
      [
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// PROFILE MENU
// ============================================================================

export function buildProfileMenu(user = {}) {
  const name = user.name || 'Guest User';
  const tier = user.tier || 'FREE';
  const predictions = user.predictions || 0;
  const winRate = user.winRate || '0';
  const points = user.points || 0;

  const text = `🌀 *BETRIX* - Your Profile

👤 *${name}* ${tier === 'VVIP' ? '👑' : ''}
Tier: *${tier}*

📊 *Statistics:*
• Predictions: ${predictions}
• Win Rate: ${winRate}%
• Points: ${points}

*What would you like to do?*`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '📈 View Stats', callback_data: 'profile:stats' },
        { text: '💰 View Bets', callback_data: 'profile:bets' }
      ],
      [
        { text: '⭐ My Favorites', callback_data: 'favorites' },
        { text: '⚙️ Settings', callback_data: 'profile:settings' }
      ],
      [
        { text: '🎁 Referrals', callback_data: 'profile:referrals' },
        { text: '📊 History', callback_data: 'profile:history' }
      ],
      [
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// FAVORITES MENU
// ============================================================================

export function buildFavoritesMenu(favorites = []) {
  let text = `🌀 *BETRIX* - Your Favorites\n\n`;

  if (favorites.length === 0) {
    text += `⭐ No favorites added yet.\n\nAdd your favorite teams and players to get personalized updates!`;
  } else {
    text += `⭐ *Your Favorite Teams:*\n\n`;
    favorites.forEach((fav, idx) => {
      text += `${idx + 1}. ${fav.emoji || '⚽'} *${fav.name}*\n`;
    });
  }

  const keyboard = [];
  
  favorites.slice(0, 5).forEach((fav) => {
    keyboard.push([
      { text: `${fav.emoji || '⚽'} ${fav.name}`, callback_data: `team:${fav.id}` }
    ]);
  });

  keyboard.push([
    { text: '➕ Add Favorite', callback_data: 'favorites:add' },
    { text: '❌ Remove', callback_data: 'favorites:remove' }
  ]);
  keyboard.push([
    { text: '🔙 Back', callback_data: 'menu_main' }
  ]);

  return {
    text,
    reply_markup: { inline_keyboard: keyboard }
  };
}

// ============================================================================
// SUBSCRIPTION & PRICING MENU
// ============================================================================

export function buildSubscriptionMenu() {
  const text = `🌀 *BETRIX* - Subscription Plans

👑 *Unlock Premium Features*

*Select a plan to view details:*`;

  const reply_markup = {
    inline_keyboard: [
      // Row 1: Tier Overview
      [
        { text: '🎯 Free', callback_data: 'plan:free' },
        { text: '⭐ Pro', callback_data: 'plan:pro' }
      ],
      [
        { text: '👑 VVIP', callback_data: 'plan:vvip' },
        { text: '💎 Plus', callback_data: 'plan:plus' }
      ],
      // Row 2: Divider Text "Fixed Odds Packs"
      // Row 3: Fixed Odds
      [
        { text: '🥉 Bronze Pack', callback_data: 'pack:bronze' },
        { text: '🥈 Silver Pack', callback_data: 'pack:silver' }
      ],
      [
        { text: '🥇 Gold Pack', callback_data: 'pack:gold' }
      ],
      // Row 4: Payment Methods
      [
        { text: '💳 Payment Methods', callback_data: 'payment' }
      ],
      // Navigation
      [
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  };

  return { text, reply_markup };
}

export function buildPlanDetailsMenu(planId) {
  const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()] || SUBSCRIPTION_PLANS.FREE;
  
  let text = `🌀 *BETRIX* - ${plan.emoji} ${plan.name}\n\n`;
  text += `💵 Price: *${plan.price}*`;
  if (plan.priceUSD) text += ` / ${plan.priceUSD}`;
  text += `\n\n*Features:*\n`;
  
  plan.features.forEach(feature => {
    text += `✓ ${feature}\n`;
  });

  text += `\n*Ready to upgrade?*`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: `✅ Choose ${plan.name}`, callback_data: `subscribe:${planId}` }
      ],
      [
        { text: '💳 Payment Methods', callback_data: 'payment' }
      ],
      [
        { text: '🔙 Back', callback_data: 'subscription' }
      ]
    ]
  };

  return { text, reply_markup };
}

export function buildPaymentMenu() {
  let text = `🌀 *BETRIX* - Payment Methods\n\n`;
  text += `💳 *Select your preferred payment method:*\n\n`;

  Object.values(PAYMENT_METHODS).forEach(method => {
    text += `${method.emoji} *${method.name}*\n`;
    text += `   ${method.details}\n`;
    text += `   ⚡ ${method.speed}\n\n`;
  });

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🏪 Safaricom Till', callback_data: 'pay:till' },
        { text: '📱 M-Pesa', callback_data: 'pay:mpesa' }
      ],
      [
        { text: '💳 PayPal', callback_data: 'pay:paypal' },
        { text: '₿ Binance', callback_data: 'pay:binance' }
      ],
      [
        { text: '🏦 Bank Transfer', callback_data: 'pay:bank' }
      ],
      [
        { text: '🔙 Back', callback_data: 'subscription' }
      ]
    ]
  };

  return { text, reply_markup };
}

export function buildPaymentDetailsMenu(method) {
  const paymentMethod = PAYMENT_METHODS[method.toUpperCase()] || PAYMENT_METHODS.TILL;
  
  let text = `🌀 *BETRIX* - ${paymentMethod.emoji} ${paymentMethod.name}\n\n`;
  
  if (method === 'till') {
    text += `📍 *Safaricom Till Payment*\n\n`;
    text += `1️⃣ Open Safaricom App or USSD: *#100*\n`;
    text += `2️⃣ Select "Pay Bills/Buy" → "Business Numbers"\n`;
    text += `3️⃣ Enter Till Number: *${TILL_NUMBER}*\n`;
    text += `4️⃣ Enter Amount and confirm\n`;
    text += `5️⃣ Share your Till receipt here\n\n`;
    text += `✅ Payment confirms instantly!\n`;
    text += `💬 Send receipt to complete your subscription.`;
  } else if (method === 'mpesa') {
    text += `📱 *M-Pesa STK Push*\n\n`;
    text += `We'll send you an M-Pesa prompt to your phone.\n`;
    text += `Just enter your M-Pesa PIN and you're done!\n\n`;
    text += `⚡ Instant activation`;
  } else if (method === 'paypal') {
    text += `💳 *PayPal Payment*\n\n`;
    text += `Click the button below to open PayPal checkout.\n`;
    text += `Secure, fast, and reliable.\n\n`;
    text += `🔒 100% Secure`;
  } else if (method === 'binance') {
    text += `₿ *Binance Pay*\n\n`;
    text += `Pay with Bitcoin, USDT, or any supported crypto.\n`;
    text += `Click below to proceed with Binance Pay.\n\n`;
    text += `🪙 Fast & Secure`;
  } else if (method === 'bank') {
    text += `🏦 *Bank Transfer (SWIFT)*\n\n`;
    text += `Bank: *BETRIX Finance Ltd.*\n`;
    text += `Account: *123456789*\n`;
    text += `SWIFT: *BTRXKENA*\n`;
    text += `Reference: Type your user ID\n\n`;
    text += `⏱️ Processing: 2-3 hours`;
  }

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '✅ Proceed', callback_data: `pay_confirm:${method}` }
      ],
      [
        { text: '❓ Need Help?', callback_data: 'help' }
      ],
      [
        { text: '🔙 Back', callback_data: 'payment' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// HELP MENU
// ============================================================================

export function buildHelpMenu() {
  const text = `🌀 *BETRIX* - Help & Support

*Need assistance? Choose a topic:*`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '❓ FAQ', callback_data: 'help:faq' },
        { text: '🎮 How to Use', callback_data: 'help:tutorial' }
      ],
      [
        { text: '💰 Payments & Billing', callback_data: 'help:billing' },
        { text: '🔐 Security', callback_data: 'help:security' }
      ],
      [
        { text: '📧 Contact Support', callback_data: 'help:contact' },
        { text: '🐛 Report Issue', callback_data: 'help:bug' }
      ],
      [
        { text: '📞 Call Support', callback_data: 'help:call' },
        { text: '💬 Live Chat', callback_data: 'help:chat' }
      ],
      [
        { text: '🔙 Back', callback_data: 'menu_main' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// MATCH DETAILS
// ============================================================================

export function buildMatchDetailsMenu(match = {}) {
  const text = `🌀 *BETRIX* - Match Details\n\n` +
    `*${match.home || 'Home'}* vs *${match.away || 'Away'}*\n\n` +
    `📊 Competition: ${match.league || 'Unknown'}\n` +
    `⏰ Time: ${match.time || 'TBA'}\n` +
    `📍 Venue: ${match.venue || 'TBA'}\n\n` +
    `📈 *Live Stats:*\n` +
    `Shots: ${match.homeShots || '0'} - ${match.awayShots || '0'}\n` +
    `Possession: ${match.homePossession || '0'}% - ${match.awayPossession || '0'}%\n` +
    `Cards: 🟡${match.homeCards || '0'} 🟥${match.homeRed || '0'} | 🟡${match.awayCards || '0'} 🟥${match.awayRed || '0'}\n\n` +
    `💰 *Odds:*\n` +
    `${match.home || 'Home'}: ${match.homeOdds || 'N/A'} | Draw: ${match.drawOdds || 'N/A'} | ${match.away || 'Away'}: ${match.awayOdds || 'N/A'}\n\n` +
    `🤖 *Prediction:*\n` +
    `${match.prediction || 'Analysis coming soon...'}`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: '⭐ Add to Favorites', callback_data: `fav:${match.id}` },
        { text: '📊 Full Analysis', callback_data: `analysis:${match.id}` }
      ],
      [
        { text: '💰 Place Bet', callback_data: `bet:${match.id}` },
        { text: '🔄 Refresh', callback_data: `match:${match.id}` }
      ],
      [
        { text: '🔙 Back', callback_data: 'live_games' }
      ]
    ]
  };

  return { text, reply_markup };
}

// ============================================================================
// EXPORT ALL MENUS
// ============================================================================

export default {
  mainMenu,
  sportsMenu,
  SUBSCRIPTION_PLANS,
  FIXED_ODDS_PACKS,
  PAYMENT_METHODS,
  buildLiveGamesMenu,
  buildOddsMenu,
  buildStandingsMenu,
  buildNewsMenu,
  buildProfileMenu,
  buildFavoritesMenu,
  buildSubscriptionMenu,
  buildPlanDetailsMenu,
  buildPaymentMenu,
  buildPaymentDetailsMenu,
  buildHelpMenu,
  buildMatchDetailsMenu
};
