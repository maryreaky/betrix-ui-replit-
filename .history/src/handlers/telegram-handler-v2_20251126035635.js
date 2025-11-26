/**
 * Telegram Handler - Main message and callback query handler
 * Integrates menus, NLP, commands, and payment system
 */

import { Logger } from '../utils/logger.js';
import {
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
} from './menu-handler.js';
import {
  parseMessage,
  intentToCommand,
  extractQuery
} from './nl-parser.js';
import {
  getUserSubscription,
  canAccessFeature,
  formatSubscriptionDetails,
  TIERS
} from './payment-handler.js';
import {
  getAvailablePaymentMethods,
  createPaymentOrder,
  generateSafaricomTillPayment,
  getPaymentInstructions,
  PAYMENT_PROVIDERS
  , verifyAndActivatePayment
} from './payment-router.js';

const logger = new Logger('TelegramHandler');

/**
 * Handle incoming Telegram message
 */
export async function handleMessage(update, redis, services) {
  try {
    const message = update.message || update.edited_message;
    if (!message) return null;

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text || '';

    // Store user session
    await redis.setex(`user:${userId}:last_seen`, 86400, Date.now());

    // Log message
    logger.info('Message received', { userId, chatId, text: text.substring(0, 50) });

    // Check if it's a command
    if (text.startsWith('/')) {
      return await handleCommand(text, chatId, userId, redis, services);
    }

    // Natural language processing
    return await handleNaturalLanguage(text, chatId, userId, redis, services);
  } catch (err) {
    logger.error('Message handling error', err);
    return null;
  }
}

/**
 * Handle slash commands
 */
async function handleCommand(text, chatId, userId, redis, services) {
  const command = text.split(' ')[0].toLowerCase();

  switch (command) {
    case '/start':
    case '/menu':
      return {
        chat_id: chatId,
        text: mainMenu.text,
        reply_markup: mainMenu.reply_markup,
        parse_mode: 'Markdown'
      };

    case '/live':
      return handleLiveGames(chatId, userId, redis, services);

    case '/odds':
      return handleOdds(chatId, userId, redis, services);

    case '/standings':
      return handleStandings(chatId, userId, redis, services);

    case '/news':
      return handleNews(chatId, userId, redis, services);

    case '/profile':
      return handleProfile(chatId, userId, redis, services);

    case '/vvip':
    case '/subscribe':
      return {
        chat_id: chatId,
        text: subscriptionMenu.text,
        reply_markup: subscriptionMenu.reply_markup,
        parse_mode: 'Markdown'
      };

    case '/help':
      return {
        chat_id: chatId,
        text: helpMenu.text,
        reply_markup: helpMenu.reply_markup,
        parse_mode: 'Markdown'
      };

    default:
      return {
        chat_id: chatId,
        text: `🌀 *BETRIX* - Command not recognized\n\nTry:\n/live - Live games\n/odds - Current odds\n/standings - League tables\n/news - Latest news\n/help - Full guide`,
        parse_mode: 'Markdown'
      };
  }
}

/**
 * Handle natural language queries
 */
async function handleNaturalLanguage(text, chatId, userId, redis, services) {
  try {
    // Parse user intent
    const parsed = parseMessage(text);

    if (!parsed.intent) {
      // Generic AI response
      return await handleGenericAI(text, chatId, userId, redis, services);
    }

    // Route by intent
    const query = extractQuery(parsed);

    switch (query.type) {
      case 'live_games':
        return await handleLiveGames(chatId, userId, redis, services, query);

      case 'odds':
        return await handleOdds(chatId, userId, redis, services, query);

      case 'standings':
        return await handleStandings(chatId, userId, redis, services, query);

      case 'news':
        return await handleNews(chatId, userId, redis, services, query);

      case 'profile':
        return await handleProfile(chatId, userId, redis, services);

      case 'upgrade':
        return {
          chat_id: chatId,
          text: subscriptionMenu.text,
          reply_markup: subscriptionMenu.reply_markup,
          parse_mode: 'Markdown'
        };

      default:
        return await handleGenericAI(text, chatId, userId, redis, services);
    }
  } catch (err) {
    logger.error('NLP handling error', err);
    return await handleGenericAI(text, chatId, userId, redis, services);
  }
}

/**
 * Handle live games request
 */
async function handleLiveGames(chatId, userId, redis, services, query = {}) {
  try {
    const { openLiga, rss } = services;

    // Get live matches from cache
    let games = [];
    if (openLiga) {
      try {
        const recent = await openLiga.getRecentMatches(query.sport || 'bl1', new Date().getFullYear(), 5);
        games = recent.slice(0, 5);
      } catch (e) {
        logger.warn('Failed to fetch live games', e);
      }
    }

    const response = formatLiveGames(games, query.sport || 'Football');

    return {
      chat_id: chatId,
      text: response,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Get Odds', callback_data: 'menu_odds' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Live games handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to fetch live games. Try again later.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle odds request
 */
async function handleOdds(chatId, userId, redis, services, query = {}) {
  try {
    const subscription = await getUserSubscription(redis, userId);

    // Check tier access
    if (subscription.tier === 'FREE' && query.isFree === false) {
      return {
        chat_id: chatId,
        text: formatUpgradePrompt('Advanced odds analysis'),
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👑 Upgrade to VVIP', callback_data: 'sub_upgrade_vvip' }],
            [{ text: '🔙 Back', callback_data: 'menu_main' }]
          ]
        }
      };
    }

    // Fetch odds from services
    let matches = [];
    if (services.footballData) {
      try {
        const fixtures = await services.footballData.fixturesFromCsv('E0', '2425');
        matches = fixtures.slice(0, 8);
      } catch (e) {
        logger.warn('Failed to fetch odds', e);
      }
    }

    const response = formatOdds(matches);

    return {
      chat_id: chatId,
      text: response,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚽ Live Games', callback_data: 'menu_live' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Odds handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to fetch odds data.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle standings request
 */
async function handleStandings(chatId, userId, redis, services, query = {}) {
  try {
    const { openLiga } = services;

    let standings = [];
    if (openLiga) {
      try {
        const league = query.league || 'BL1';
        standings = await openLiga.getStandings(league) || [];
      } catch (e) {
        logger.warn('Failed to fetch standings', e);
      }
    }

    const response = formatStandings(query.league || 'Premier League', standings);

    return {
      chat_id: chatId,
      text: response,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Odds', callback_data: 'menu_odds' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Standings handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to fetch standings.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle news request
 */
async function handleNews(chatId, userId, redis, services, query = {}) {
  try {
    const { rss } = services;

    let articles = [];
    if (rss) {
      try {
        const feeds = [
          'https://feeds.bbci.co.uk/sport/football/rss.xml',
          'https://www.theguardian.com/football/rss'
        ];
        const result = await rss.fetchMultiple(feeds);
        articles = result.slice(0, 5);
      } catch (e) {
        logger.warn('Failed to fetch news', e);
      }
    }

    const response = formatNews(articles);

    return {
      chat_id: chatId,
      text: response,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚽ Live Games', callback_data: 'menu_live' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('News handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to fetch news.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle profile request
 */
async function handleProfile(chatId, userId, redis, services) {
  try {
    const user = await redis.hgetall(`user:${userId}`);
    const subscription = await getUserSubscription(redis, userId);

    const profileData = {
      name: user.name || 'BETRIX User',
      tier: subscription.tier,
      joinDate: user.joinDate || new Date().toLocaleDateString(),
      predictions: user.predictions || 0,
      winRate: user.winRate || 0,
      points: user.points || 0,
      referralCode: userId.toString(36).toUpperCase(),
      referrals: user.referrals || 0,
      bonusPoints: user.bonusPoints || 0,
      nextTier: subscription.tier === 'FREE' ? 'PRO' : 'VVIP'
    };

    const response = formatProfile(profileData);

    return {
      chat_id: chatId,
      text: response + `\n\n${formatSubscriptionDetails(subscription)}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👑 Upgrade', callback_data: 'sub_upgrade_vvip' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Profile handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to load profile.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle generic AI response
 */
async function handleGenericAI(text, chatId, userId, redis, services) {
  try {
    const { aiChain } = services;

    if (!aiChain) {
      return {
        chat_id: chatId,
        text: `🌀 *BETRIX* - Sorry, I couldn't understand that. Try:\n/live\n/odds\n/standings\n/news`,
        parse_mode: 'Markdown'
      };
    }

    // Get AI response
    const response = await aiChain.analyze({
      userId,
      query: text,
      context: 'sports_betting'
    });

    return {
      chat_id: chatId,
      text: formatNaturalResponse(response || 'Unable to analyze this request.'),
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('AI handler error', err);
    return {
      chat_id: chatId,
      text: `🌀 *BETRIX* - ${err.message || 'Unable to process your request.'}`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle callback queries (button clicks)
 */
export async function handleCallbackQuery(callbackQuery, redis, services) {
  try {
    const { id: cbId, from: { id: userId }, data } = callbackQuery;
    const chatId = callbackQuery.message.chat.id;

    logger.info('Callback query', { userId, data });

    // Route callback
    if (data.startsWith('menu_')) {
      return handleMenuCallback(data, chatId, userId, redis);
    }

    if (data.startsWith('sport_')) {
      return handleSportCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('sub_')) {
      return handleSubscriptionCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('profile_')) {
      return handleProfileCallback(data, chatId, userId, redis);
    }

    if (data.startsWith('help_')) {
      return handleHelpCallback(data, chatId, userId, redis);
    }

    if (data.startsWith('league_')) {
      return handleLeagueCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('league_live_')) {
      return handleLeagueLiveCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('league_standings_')) {
      return handleLeagueStandingsCallback(data, chatId, userId, redis, services);
    }

    // Handle payment verification
    if (data.startsWith('verify_payment_')) {
      return handlePaymentVerification(data, chatId, userId, redis);
    }

    // Handle payment method selection with tier
    if (data.startsWith('pay_')) {
      return handlePaymentMethodSelection(data, chatId, userId, redis, services);
    }

    // Handle quick bet start
    if (data.startsWith('bet_fixture_')) {
      return handleBetCreate(data, chatId, userId, redis, services);
    }

    // Handle bet placement confirmation
    if (data.startsWith('place_bet_')) {
      return handlePlaceBet(data, chatId, userId, redis, services);
    }

    // Acknowledge callback
    return {
      method: 'answerCallbackQuery',
      callback_query_id: cbId
    };
  } catch (err) {
    logger.error('Callback query error', err);
    return null;
  }
}

/**
 * Handle menu callbacks
 */
function handleMenuCallback(data, chatId, userId, redis) {
  const menuMap = {
    'menu_main': mainMenu,
    'menu_live': { text: 'Select a sport for live games:', reply_markup: sportsMenu.reply_markup },
    'menu_odds': { text: 'Loading odds...', reply_markup: sportsMenu.reply_markup },
    'menu_standings': { text: 'Select a league for standings:', reply_markup: sportsMenu.reply_markup },
    'menu_news': { text: 'Loading latest news...', reply_markup: mainMenu.reply_markup },
    'menu_profile': profileMenu,
    'menu_vvip': subscriptionMenu,
    'menu_help': helpMenu
  };

  const menu = menuMap[data];
  if (!menu) return null;

  return {
    method: 'editMessageText',
    chat_id: chatId,
    message_id: undefined,
    text: menu.text,
    reply_markup: menu.reply_markup,
    parse_mode: 'Markdown'
  };
}

async function handleLeagueCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_', '') || null;
  const buttons = [
    [{ text: '🔴 Live matches', callback_data: `league_live_${leagueId}` }],
    [{ text: '📊 Standings', callback_data: `league_standings_${leagueId}` }],
    [{ text: '🔙 Back', callback_data: 'menu_main' }]
  ];

  return {
    method: 'editMessageText',
    chat_id: chatId,
    message_id: undefined,
    text: `League ${leagueId} — Choose an action:`,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  };
}

async function handleLeagueLiveCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_live_', '');
  try {
    let fixtures = [];
    if (services && services.apiFootball && typeof services.apiFootball.getFixturesByLeague === 'function') {
      const res = await services.apiFootball.getFixturesByLeague(leagueId, { live: true });
      fixtures = res?.response || [];
    }

    const games = (fixtures || []).map(f => ({
      id: f.fixture?.id || f.id || f.fixture_id || null,
      home: f.teams?.home?.name || f.home || 'Home',
      away: f.teams?.away?.name || f.away || 'Away',
      status: f.fixture?.status?.short || f.status || 'LIVE',
      minute: f.fixture?.status?.elapsed || null,
      score: (f.goals || f.score) ? { home: f.goals?.home ?? f.score?.fulltime?.home ?? null, away: f.goals?.away ?? f.score?.fulltime?.away ?? null } : null
    }));

    const responseText = formatLiveGames(games, 'League');

    // Build inline keyboard with quick bet buttons for top 3 fixtures
    const keyboard = [];
    for (let i = 0; i < Math.min(games.length, 3); i++) {
      const f = games[i];
      if (f && f.id) {
        keyboard.push([{ text: `Quick Bet: ${f.home} vs ${f.away}`, callback_data: `bet_fixture_${f.id}` }]);
      }
    }
    keyboard.push([{ text: '🔙 Back', callback_data: 'menu_main' }]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: responseText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.warn('handleLeagueLiveCallback failed', err);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `Unable to fetch live matches for league ${leagueId}`,
      parse_mode: 'Markdown'
    };
  }
}

async function handleLeagueStandingsCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_standings_', '');
  try {
    let standings = null;
    if (services && services.apiFootball && typeof services.apiFootball.getStandings === 'function') {
      const res = await services.apiFootball.getStandings(leagueId, new Date().getFullYear());
      standings = res?.response?.[0] || null;
    }

    const response = formatStandings(standings, `League ${leagueId}`);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: response,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]] }
    };
  } catch (err) {
    logger.warn('handleLeagueStandingsCallback failed', err);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `Unable to fetch standings for league ${leagueId}`,
      parse_mode: 'Markdown'
    };
  }
}

// ----------------------
// Betslip helpers
// ----------------------
async function createBetslip(redis, userId, fixtureId, fixtureText) {
  const id = `BETS${userId}${Date.now()}`;
  const bet = {
    id,
    userId,
    fixtureId,
    fixtureText,
    stake: 100,
    selection: 'home',
    createdAt: new Date().toISOString()
  };
  // store for 1 hour
  await redis.setex(`betslip:${id}`, 3600, JSON.stringify(bet));
  return bet;
}

async function handleBetCreate(data, chatId, userId, redis, services) {
  try {
    const fixtureId = data.replace('bet_fixture_', '');

    // Try to resolve fixture info via apiFootball if available
    let fixtureText = `Fixture ${fixtureId}`;
    try {
      if (services && services.apiFootball && typeof services.apiFootball.getFixture === 'function') {
        const res = await services.apiFootball.getFixture(fixtureId);
        const f = res?.response?.[0];
        if (f) fixtureText = `${f.teams?.home?.name || 'Home'} vs ${f.teams?.away?.name || 'Away'}`;
      }
    } catch (e) {
      logger.warn('Could not resolve fixture details', e);
    }

    const bet = await createBetslip(redis, userId, fixtureId, fixtureText);

    const text = `🧾 *Betslip*\n\nFixture: *${bet.fixtureText}*\nStake: KES ${bet.stake}\nSelection: *${bet.selection}*\n\nTap to confirm your bet.`;

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Place Bet', callback_data: `place_bet_${bet.id}` }],
          [{ text: '✏️ Change Stake', callback_data: `edit_bet_${bet.id}` }],
          [{ text: '🔙 Back', callback_data: 'menu_live' }]
        ]
      }
    };
  } catch (err) {
    logger.error('handleBetCreate error', err);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '❌ Failed to create betslip. Try again later.',
      parse_mode: 'Markdown'
    };
  }
}

async function handlePlaceBet(data, chatId, userId, redis) {
  try {
    const betId = data.replace('place_bet_', '');
    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) {
      return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip expired or not found.', parse_mode: 'Markdown' };
    }
    const bet = JSON.parse(raw);

    // For free users, we mock placement and store in user's bets history
    const txId = `BTX${Date.now()}`;
    await redis.rpush(`user:${userId}:bets`, JSON.stringify({ ...bet, placedAt: new Date().toISOString(), txId }));
    // remove betslip
    await redis.del(`betslip:${betId}`);

    const text = `✅ Bet placed!\n\nFixture: *${bet.fixtureText}*\nStake: KES ${bet.stake}\nSelection: *${bet.selection}*\nTransaction: \\`${txId}\\`\n\nGood luck!`;

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🎯 My Bets', callback_data: 'profile_bets' }, { text: '🔙 Main Menu', callback_data: 'menu_main' }]] }
    };
  } catch (err) {
    logger.error('handlePlaceBet error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Failed to place bet.', parse_mode: 'Markdown' };
  }
}

/**
 * Handle sport selection
 */
async function handleSportCallback(data, chatId, userId, redis, services) {
  const sportKey = data.replace('sport_', '');
  const sportName = sportKey.charAt(0).toUpperCase() + sportKey.slice(1);

  // Try to fetch popular leagues for this sport
  try {
    let leagues = [];
    if (services && services.apiFootball && typeof services.apiFootball.getLeagues === 'function') {
      const res = await services.apiFootball.getLeagues(sportKey);
      leagues = (res?.response || []).slice(0, 6).map(l => ({ id: l.league?.id || l.id, name: l.league?.name || l.name }));
    }

    // Fallback static list
    if (!leagues || leagues.length === 0) {
      leagues = [
        { id: '39', name: 'Premier League' },
        { id: '140', name: 'La Liga' },
        { id: '135', name: 'Serie A' },
        { id: '61', name: 'Ligue 1' }
      ];
    }

    const keyboard = leagues.map(l => [{ text: `${l.name}`, callback_data: `league_${l.id}` }]);
    keyboard.push([{ text: '🔙 Back', callback_data: 'menu_main' }]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `*${sportName}* — Select a league to view live matches and standings:`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.warn('handleSportCallback failed', err);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `Loading ${sportName} data...`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle subscription callbacks
 */
async function handleSubscriptionCallback(data, chatId, userId, redis, services) {
  try {
    // Handle manage subscription
    if (data === 'sub_manage') {
      const subscription = await getUserSubscription(redis, userId);
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `Your current subscription:\n\n${formatSubscriptionDetails(subscription)}`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'menu_vvip' }]
          ]
        }
      };
    }

    // Handle tier selection (sub_free, sub_pro, sub_vvip, sub_plus)
    if (data.startsWith('sub_')) {
      const tier = data.replace('sub_', '').toUpperCase();
      const tierConfig = TIERS[tier];
      
      if (!tierConfig) {
        return {
          method: 'answerCallbackQuery',
          callback_query_id: undefined,
          text: '❌ Invalid tier selection',
          show_alert: false
        };
      }

      // Get user's region (default KE for now)
      const userRegion = await redis.hget(`user:${userId}:profile`, 'region') || 'KE';
      
      // Get available payment methods for region
      const paymentMethods = getAvailablePaymentMethods(userRegion);

      // Persist selected tier for this user for 15 minutes so payment callbacks can reference it
      try {
        await redis.setex(`user:${userId}:pending_payment`, 900, JSON.stringify({ tier, createdAt: Date.now() }));
      } catch (e) {
        logger.warn('Failed to persist pending payment', e);
      }
      
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `🌀 *${tierConfig.name}* - KES ${tierConfig.price}/month\n\n✨ *Features:*\n${tierConfig.features.map(f => `• ${f}`).join('\n')}\n\n*Select payment method:*`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buildPaymentMethodButtons(paymentMethods, tier)
        }
      };
    }

    // Handle subscription tier selection from main menu
    const tier = data.replace('sub_', '').toUpperCase();
    const tierConfig = TIERS[tier];

    if (!tierConfig) {
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid tier selection',
        show_alert: false
      };
    }

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `💳 Ready to upgrade to ${tierConfig.name}?\n\nKES ${tierConfig.price}/month\n\nClick Pay to continue.`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Proceed to Payment', callback_data: `pay_${tier}` }],
          [{ text: '🔙 Back', callback_data: 'menu_vvip' }]
        ]
      }
    };
  } catch (error) {
    logger.error('Subscription callback error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '❌ An error occurred. Please try again.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Build payment method buttons based on available methods
 */
function buildPaymentMethodButtons(methods, tier) {
  const buttons = [];
  
  // Safaricom Till (high priority for KE)
  if (methods.includes('SAFARICOM_TILL')) {
    const TILL_NUMBER = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';
    buttons.push([{
      text: `🏪 Safaricom Till #${TILL_NUMBER} (Recommended)`,
      callback_data: `pay_safaricom_till_${tier}`
    }]);
  }
  
  // M-Pesa
  if (methods.includes('MPESA')) {
    buttons.push([{
      text: '📱 M-Pesa STK Push',
      callback_data: `pay_mpesa_${tier}`
    }]);
  }
  
  // PayPal
  if (methods.includes('PAYPAL')) {
    buttons.push([{
      text: '💳 PayPal',
      callback_data: `pay_paypal_${tier}`
    }]);
  }
  
  // Binance
  if (methods.includes('BINANCE')) {
    buttons.push([{
      text: '₿ Binance Pay',
      callback_data: `pay_binance_${tier}`
    }]);
  }
  
  // SWIFT
  if (methods.includes('SWIFT')) {
    buttons.push([{
      text: '🏦 Bank Transfer (SWIFT)',
      callback_data: `pay_swift_${tier}`
    }]);
  }
  
  // Back button
  buttons.push([{
    text: '🔙 Back',
    callback_data: 'menu_vvip'
  }]);
  
  return buttons;
}

/**
 * Handle profile callbacks
 */
function handleProfileCallback(data, chatId, userId, redis) {
  const responses = {
    'profile_stats': 'Your performance metrics',
    'profile_bets': 'Your betting history',
    'profile_favorites': 'Your favorite teams/leagues',
    'profile_settings': 'Account settings'
  };

  return {
    method: 'sendMessage',
    chat_id: chatId,
    text: `🌀 *BETRIX* - ${responses[data] || 'Coming soon'}`,
    parse_mode: 'Markdown'
  };
}

/**
 * Handle help callbacks
 */
function handleHelpCallback(data, chatId, userId, redis) {
  const responses = {
    'help_faq': '📚 Frequently Asked Questions\n\nQ: How accurate are predictions?\nA: Our AI model achieves 80-85% accuracy on selected matches.\n\nMore FAQs coming soon!',
    'help_demo': '🎮 Demo Mode\n\nTry our features with sample data!',
    'help_contact': '📧 Contact Support\n\nemail: support@betrix.app\n📱 Telegram: @betrix_support'
  };

  return {
    method: 'sendMessage',
    chat_id: chatId,
    text: responses[data] || 'Help section',
    parse_mode: 'Markdown'
  };
}

/**
 * Handle payment method selection with tier extraction
 */
async function handlePaymentMethodSelection(data, chatId, userId, redis, services) {
  try {
    const parts = data.split('_');
    // Format: pay_METHOD or pay_METHOD_TIER
    const paymentMethod = parts.slice(1, -1).join('_').toUpperCase();
    const tier = parts[parts.length - 1].toUpperCase();

    // If tier is not provided in the callback (older buttons), try to read pending tier
    let selectedTier = tier;
    if (!selectedTier || selectedTier === '') {
      try {
        const pending = await redis.get(`user:${userId}:pending_payment`);
        if (pending) {
          const pendingObj = JSON.parse(pending);
          selectedTier = pendingObj.tier || selectedTier;
        }
      } catch (e) {
        logger.warn('Failed to read pending tier from redis', e);
      }
    }

    const userRegion = await redis.hget(`user:${userId}:profile`, 'region') || 'KE';
    
    // Validate region
    if (paymentMethod === 'SAFARICOM_TILL' && userRegion !== 'KE') {
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '🇰🇪 Safaricom Till only available in Kenya',
        show_alert: true
      };
    }

    // Create payment order
    const order = await createPaymentOrder(
      redis,
      userId,
      selectedTier,
      paymentMethod,
      userRegion
    );

    // Get payment instructions
    const instructions = await getPaymentInstructions(redis, order.orderId, paymentMethod);

    // Build step-by-step text
    let instrText = '';
    if (instructions) {
      // Use provided descriptive text if available
      if (instructions.description) instrText += `*${instructions.description}*\n\n`;

      // Steps may be in .steps or .manualSteps
      const steps = instructions.steps || instructions.manualSteps || [];
      if (Array.isArray(steps) && steps.length > 0) {
        instrText += 'Follow these steps:\n';
        for (let i = 0; i < steps.length; i++) {
          instrText += `${i + 1}. ${steps[i]}\n`;
        }
        instrText += '\n';
      }

      // Additional helper fields
      if (instructions.tillNumber) instrText += `Till: *${instructions.tillNumber}*\n`;
      if (instructions.reference) instrText += `Reference: \\`${instructions.reference}\\`\n`;
      if (instructions.checkoutUrl) instrText += `Open the payment link to continue.`;
    } else {
      instrText = `Please follow the provider instructions to complete payment for order ${order.orderId}.`;
    }

    // Build buttons: provider-specific CTAs and common verification
    const keyboard = [];

    if (instructions && instructions.checkoutUrl) {
      keyboard.push([{ text: `${PAYMENT_PROVIDERS[paymentMethod]?.symbol || '💳'} Pay with ${PAYMENT_PROVIDERS[paymentMethod]?.name || paymentMethod}`, url: instructions.checkoutUrl }]);
    }

    if (instructions && instructions.qrCode) {
      keyboard.push([{ text: '🔎 View QR', url: instructions.qrCode }]);
    }

    // Always include verify and change method
    keyboard.push([{ text: '✅ I have paid', callback_data: `verify_payment_${order.orderId}` }]);
    keyboard.push([{ text: '🔙 Change method', callback_data: 'menu_vvip' }]);

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: instrText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (error) {
    logger.error('Payment method selection error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `❌ Payment setup failed: ${error.message}`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle payment verification when user confirms payment
 */
async function handlePaymentVerification(data, chatId, userId, redis) {
  try {
    const orderId = data.replace('verify_payment_', '');
    // Use payment-router's verification to ensure consistent activation
    try {
      const verification = await verifyAndActivatePayment(redis, orderId, `manual_${Date.now()}`);
      const tier = verification.tier;
      const tierConfig = TIERS[tier] || { name: tier, features: [] };

      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `✅ *Payment Confirmed!*\n\n🎉 Welcome to ${tierConfig.name}!\n\n✨ *Features unlocked:*\n${(tierConfig.features || []).map(f => `• ${f}`).join('\n')}\n\nEnjoy your premium experience with 🌀 BETRIX!`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 Back to Main Menu', callback_data: 'menu_main' }]
          ]
        }
      };
    } catch (e) {
      logger.error('Payment verification failed', e);
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `❌ Verification failed: ${e.message || 'unknown error'}`,
        parse_mode: 'Markdown'
      };
    }
  } catch (error) {
    logger.error('Payment verification error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `❌ Verification failed: ${error.message}\n\nPlease contact support or try again.`,
      parse_mode: 'Markdown'
    };
  }
}

export default {
  handleMessage,
  handleCallbackQuery,
  handleCommand,
  handleNaturalLanguage
};
