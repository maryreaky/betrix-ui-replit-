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
// instantiate a module-level logger for this handler
const logger = new Logger('TelegramHandlerV2');
function normalizeApiFootballFixture(fx) {
  // api-football fixture shape -> { home, away, homeOdds, drawOdds, awayOdds }
  try {
    const home = fx.teams?.home?.name || fx.home?.name || fx.home || 'Home';
    const away = fx.teams?.away?.name || fx.away?.name || fx.away || 'Away';
    // odds are often under "odds" -> bookmakers -> bets
    let homeOdds = '-';
    let drawOdds = '-';
    let awayOdds = '-';
    if (fx.odds && Array.isArray(fx.odds)) {
      const bk = fx.odds[0];
      if (bk && bk.bookmakers) {
        const market = bk.bookmakers[0];
        const vals = market?.bets?.[0]?.values || market?.values || [];
        homeOdds = vals[0]?.odd || homeOdds;
        drawOdds = vals[1]?.odd || drawOdds;
        awayOdds = vals[2]?.odd || awayOdds;
      }
    }
    // older api-football responses put odds under "odds" -> "home/away/draw"
    if (fx.homeOdds || fx.odds?.home) homeOdds = fx.homeOdds || fx.odds?.home || homeOdds;
    if (fx.drawOdds || fx.odds?.draw) drawOdds = fx.drawOdds || fx.odds?.draw || drawOdds;
    if (fx.awayOdds || fx.odds?.away) awayOdds = fx.awayOdds || fx.odds?.away || awayOdds;

    return { home, away, homeOdds, drawOdds, awayOdds, prediction: fx.prediction || null };
  } catch (e) {
    return { home: 'Home', away: 'Away', homeOdds: '-', drawOdds: '-', awayOdds: '-' };
  }
}

function normalizeAllSportsMatch(it) {
  // RapidAPI / AllSports compact event format
  try {
    const home = it.home_team?.name || it.homeTeam || it.home || it.team1 || 'Home';
    const away = it.away_team?.name || it.awayTeam || it.away || it.team2 || 'Away';
    const score = (it.home_score != null && it.away_score != null) ? `${it.home_score}-${it.away_score}` : null;
    const time = it.minute || it.status || null;
    const homeOdds = it.odds?.home || it.bookmakers?.[0]?.odds?.home || '-';
    const drawOdds = it.odds?.draw || it.bookmakers?.[0]?.odds?.draw || '-';
    const awayOdds = it.odds?.away || it.bookmakers?.[0]?.odds?.away || '-';
    return { home, away, score, time, homeOdds, drawOdds, awayOdds };
  } catch (e) {
    return { home: 'Home', away: 'Away', score: null, time: null, homeOdds: '-', drawOdds: '-', awayOdds: '-' };
  }
}

function normalizeSportsDataEvent(it) {
  // SportsData-like event/fixture -> normalize to common shape
  try {
    const home = it.homeTeam?.name || it.homeTeamName || it.home?.name || it.home || 'Home';
    const away = it.awayTeam?.name || it.awayTeamName || it.away?.name || it.away || 'Away';
    const score = (it.homeScore != null && it.awayScore != null) ? `${it.homeScore}-${it.awayScore}` : (it.score ? it.score : null);
    const time = it.status || it.matchTime || it.minute || null;
    const homeOdds = it.odds?.home || it.homeOdds || '-';
    const drawOdds = it.odds?.draw || it.drawOdds || '-';
    const awayOdds = it.odds?.away || it.awayOdds || '-';
    return { home, away, score, time, homeOdds, drawOdds, awayOdds };
  } catch (e) {
    return { home: 'Home', away: 'Away', score: null, time: null, homeOdds: '-', drawOdds: '-', awayOdds: '-' };
  }
}


function normalizeStandingsOpenLiga(table) {
  // Convert OpenLiga standings rows into { name, played, won, drawn, lost, goalDiff, points }
  try {
    return (table || []).map(t => ({
      name: t.TeamName || t.team?.name || t.name || 'Team',
      played: t.PlayedGames || t.played || t.matches || 0,
      won: t.Wins || t.won || 0,
      drawn: t.Draws || t.drawn || 0,
      lost: t.Losses || t.lost || 0,
      goalDiff: (t.GoalsFor || t.goalsFor || 0) - (t.GoalsAgainst || t.goalsAgainst || 0) || 0,
      points: t.Points || t.points || 0
    }));
  } catch (e) {
    return [];
  }
}

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
  // Defensive: ensure `text` is a string to avoid runtime TypeErrors
  if (text === undefined || text === null) text = '';
  if (typeof text !== 'string') {
    try {
      text = String(text);
    } catch (e) {
      text = '';
    }
  }
  const command = (text || '').split(' ')[0].toLowerCase();

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
    const { openLiga, rss, footballData } = services;

    // Get live matches from available services and normalize
    let gamesRaw = [];
    if (openLiga) {
      try {
        const recent = await openLiga.getRecentMatches(query.sport || 'BL1', new Date().getFullYear(), 5).catch(() => []);
        gamesRaw = gamesRaw.concat(recent || []);
      } catch (e) {
        logger.warn('Failed to fetch live games from openLiga', e);
      }
    }
    // fallback to footballData or scorebat if available
    if (footballData && gamesRaw.length === 0) {
      try {
        const fd = await footballData.fixturesFromCsv(query.sport || 'E0', String(new Date().getFullYear()));
        const fixtures = (fd && fd.fixtures) ? fd.fixtures : [];
        gamesRaw = gamesRaw.concat(fixtures.slice(0, 5));
      } catch (e) {
        logger.warn('Failed to fetch live games from footballData', e);
      }
    }

    // Normalize into simplified game objects
    const games = gamesRaw.slice(0, 10).map(it => {
      // detect source shape and pick normalizer
      if (!it) return { home: 'Home', away: 'Away', score: null, time: null };
      if (it.Team1 || it.MatchDateTime) return normalizeOpenLigaMatch(it);
      if (it.fixture || it.teams || it.league) return normalizeApiFootballFixture(it);
      if (it.homeTeam || it.homeTeamName || it.home_team || it.away_team || it.eventName) return normalizeAllSportsMatch(it);
      if (it.homeScore !== undefined || it.homeTeam || it.awayTeam || it.matchId || it.score) return normalizeSportsDataEvent(it);
      return normalizeFootballDataFixture(it);
    }).slice(0, 5);

    // Demo fallback when no providers available (useful for local/e2e)
    const enableDemo = process.env.ENABLE_DEMO === '1' || process.env.NODE_ENV !== 'production';
    if ((games == null || games.length === 0) && enableDemo) {
      // provide a small set of sample matches so menus are meaningful
      const demoGames = [
        { home: 'Home FC', away: 'Away United', score: '1-0', time: '45\'', odds: null },
        { home: 'City Rangers', away: 'Town Albion', score: null, time: '12\'', odds: null }
      ];
      return {
        chat_id: chatId,
        text: formatLiveGames(demoGames, query.sport || 'Football'),
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Get Odds', callback_data: 'menu_odds' }],
            [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
          ]
        }
      };
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

    // Fetch odds from services and normalize
    let matchesRaw = [];
    if (services.footballData) {
      try {
        const fd = await services.footballData.fixturesFromCsv(query.comp || 'E0', query.season || String(new Date().getFullYear()));
        matchesRaw = (fd && fd.fixtures) ? fd.fixtures.slice(0, 12) : [];
      } catch (e) {
        logger.warn('Failed to fetch odds from footballData', e);
      }
    }

    const matches = matchesRaw.map(m => {
      if (!m) return { home: 'Home', away: 'Away', homeOdds: '-', drawOdds: '-', awayOdds: '-' };
      if (m.fixture || m.teams || m.league) return normalizeApiFootballFixture(m);
      if (m.homeTeam || m.homeTeamName || m.home_team || m.away_team || m.eventName) return normalizeAllSportsMatch(m);
      if (m.homeScore !== undefined || m.homeTeam || m.awayTeam || m.matchId || m.score) return normalizeSportsDataEvent(m);
      return normalizeFootballDataFixture(m);
    }).slice(0, 8);

    // Demo fallback when no provider data and running locally/dev
    const enableDemo = process.env.ENABLE_DEMO === '1' || process.env.NODE_ENV !== 'production';
    let finalMatches = matches;
    if ((finalMatches == null || finalMatches.length === 0) && enableDemo) {
      finalMatches = [
        { home: 'Home FC', away: 'Away United', homeOdds: '1.85', drawOdds: '3.40', awayOdds: '4.20' },
        { home: 'City Rangers', away: 'Town Albion', homeOdds: '2.10', drawOdds: '3.10', awayOdds: '3.60' }
      ];
    }

    const response = formatOdds(finalMatches);

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

    let standingsRaw = [];
    if (openLiga) {
      try {
        const league = query.league || 'BL1';
        standingsRaw = await openLiga.getStandings(league) || [];
      } catch (e) {
        logger.warn('Failed to fetch standings from openLiga', e);
      }
    }

    const standings = normalizeStandingsOpenLiga(standingsRaw || []);
    // Demo fallback for standings when providers missing
    const enableDemo = process.env.ENABLE_DEMO === '1' || process.env.NODE_ENV !== 'production';
    const finalStandings = (standings && standings.length) ? standings : (enableDemo ? [
      { name: 'Home FC', played: 12, won: 8, drawn: 2, lost: 2, goalDiff: 12, points: 26 },
      { name: 'Away United', played: 12, won: 7, drawn: 3, lost: 2, goalDiff: 8, points: 24 }
    ] : []);

    const response = formatStandings(query.league || 'Premier League', finalStandings);

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
    
    // Handle bet stake edit selection
    if (data.startsWith('edit_bet_')) {
      return handleEditBet(data, chatId, userId, redis);
    }

    // Handle stake set callbacks: set_bet_{betId}_{amount}
    if (data.startsWith('set_bet_')) {
      return handleSetBetStake(data, chatId, userId, redis);
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
  
  try {
    // Get league name from mapping
    const leagueMap = {
      '39': 'Premier League',
      '140': 'La Liga',
      '135': 'Serie A',
      '61': 'Ligue 1',
      '78': 'Bundesliga',
      '2': 'Champions League',
      '3': 'Europa League'
    };
    const leagueName = leagueMap[leagueId] || `League ${leagueId}`;

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `📊 *${leagueName}*\n\nWhat would you like to see?`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔴 Live Now', callback_data: `league_live_${leagueId}` },
            { text: '📈 Odds', callback_data: `league_odds_${leagueId}` }
          ],
          [
            { text: '📊 Table', callback_data: `league_standings_${leagueId}` }
          ],
          [
            { text: '🔙 Back', callback_data: 'menu_live' }
          ]
        ]
      }
    };
  } catch (err) {
    logger.error('League callback error', err);
    return null;
  }
}

/**
 * Handle live matches for a league
 */
async function handleLeagueLiveCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_live_', '');
  
  try {
    let matches = [];
    if (services && services.sportsAggregator) {
      try {
        matches = await services.sportsAggregator.getLiveMatches(leagueId);
      } catch (e) {
        logger.warn('Failed to fetch live matches', e);
      }
    }

    if (!matches || matches.length === 0) {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: '⏳ No live matches right now.\n\nCheck back soon!',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
        }
      };
    }

    // Format matches beautifully
    const matchText = matches.slice(0, 5).map((m, i) => {
      const score = m.homeScore !== null && m.awayScore !== null 
        ? `${m.homeScore}-${m.awayScore}`
        : '─';
      const status = m.status === 'LIVE' ? `🔴 ${m.time}` : `✅ ${m.time}`;
      return `${i+1}. ${m.home} vs ${m.away}\n   ${score} ${status}`;
    }).join('\n\n');

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🏟️ *Live Matches*\n\n${matchText}\n\n_Tap match for details_`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
      }
    };
  } catch (err) {
    logger.error('Live matches handler error', err);
    return null;
  }
}

/**
 * Handle odds for a league
 */
async function handleLeagueOddsCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_odds_', '');
  
  try {
    let odds = [];
    if (services && services.sportsAggregator) {
      try {
        odds = await services.sportsAggregator.getOdds(leagueId);
      } catch (e) {
        logger.warn('Failed to fetch odds', e);
      }
    }

    if (!odds || odds.length === 0) {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: '⏳ Odds not available.\n\nCheck back soon!',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
        }
      };
    }

    // Format odds beautifully
    const oddsText = odds.slice(0, 5).map((m, i) => {
      const h = m.homeOdds || m.odds?.home || '─';
      const d = m.drawOdds || m.odds?.draw || '─';
      const a = m.awayOdds || m.odds?.away || '─';
      return `${i+1}. ${m.home} vs ${m.away}\n   🏠 ${h} • 🤝 ${d} • ✈️ ${a}`;
    }).join('\n\n');

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `💰 *Best Odds*\n\n${oddsText}\n\n_Compare bookmakers_`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
      }
    };
  } catch (err) {
    logger.error('Odds handler error', err);
    return null;
  }
}

/**
 * Handle standings/table for a league
 */
async function handleLeagueStandingsCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_standings_', '');
  
  try {
    let standings = [];
    if (services && services.sportsAggregator) {
      try {
        standings = await services.sportsAggregator.getStandings(leagueId);
      } catch (e) {
        logger.warn('Failed to fetch standings', e);
      }
    }

    if (!standings || standings.length === 0) {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: '⏳ Standings not available.\n\nCheck back soon!',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
        }
      };
    }

    // Format standings beautifully (top 10)
    const tableText = standings.slice(0, 10).map((row, i) => {
      const pos = String(i + 1).padStart(2, ' ');
      const team = (row.team || row.Team || row.name || '?').substring(0, 15).padEnd(15);
      const pts = String(row.points || row.goalDifference || 0).padStart(3);
      return `${pos}. ${team} ${pts}`;
    }).join('\n');

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `📊 *League Table*\n\n\`\`\`\nPos Team           Pts\n${tableText}\n\`\`\``,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
      }
    };
  } catch (err) {
    logger.error('Standings handler error', err);
    return null;
  }
}

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

    const text = '✅ Bet placed!\n\nFixture: *' + bet.fixtureText + '*\nStake: KES ' + bet.stake + '\nSelection: *' + bet.selection + '*\nTransaction: `' + txId + '`\n\nGood luck!';

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

// Present stake options to user
async function handleEditBet(data, chatId, userId, redis) {
  try {
    const betId = data.replace('edit_bet_', '');
    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip not found or expired.', parse_mode: 'Markdown' };
    const bet = JSON.parse(raw);

    const keyboard = [
      [ { text: 'KES 50', callback_data: `set_bet_${bet.id}_50` }, { text: 'KES 100', callback_data: `set_bet_${bet.id}_100` } ],
      [ { text: 'KES 200', callback_data: `set_bet_${bet.id}_200` }, { text: 'KES 500', callback_data: `set_bet_${bet.id}_500` } ],
      [ { text: '🔙 Cancel', callback_data: `bet_fixture_${bet.fixtureId}` } ]
    ];

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `✏️ *Edit Stake*\n\nCurrent stake: KES ${bet.stake}\nChoose a new stake:`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.error('handleEditBet error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Error editing bet.', parse_mode: 'Markdown' };
  }
}

// Handle stake selection and update betslip
async function handleSetBetStake(data, chatId, userId, redis) {
  try {
    // format set_bet_{betId}_{amount}
    const parts = data.split('_');
    const betId = parts[2];
    const amount = Number(parts[3] || 0);
    if (!betId || !amount) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Invalid stake selection.', parse_mode: 'Markdown' };

    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip expired or not found.', parse_mode: 'Markdown' };
    const bet = JSON.parse(raw);
    bet.stake = amount;
    await redis.setex(`betslip:${betId}`, 3600, JSON.stringify(bet));

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🧾 *Betslip Updated*\n\nFixture: *${bet.fixtureText}*\nNew stake: KES ${bet.stake}\n\nTap to place the bet.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ Place Bet', callback_data: `place_bet_${bet.id}` }, { text: '🔙 Back', callback_data: 'menu_live' }]] }
    };
  } catch (err) {
    logger.error('handleSetBetStake error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Error setting stake.', parse_mode: 'Markdown' };
  }
}

/**
 * Handle sport selection
 */
async function handleSportCallback(data, chatId, userId, redis, services) {
  const sportKey = data.replace('sport_', '');
  const sportName = sportKey.charAt(0).toUpperCase() + sportKey.slice(1);

  try {
    // Get leagues from sports aggregator or fallback to hardcoded
    let leagues = [];
    
    if (services && services.sportsAggregator) {
      try {
        const allLeagues = await services.sportsAggregator.getLeagues(sportKey);
        leagues = allLeagues.slice(0, 8).map(l => ({
          id: l.id || l.league?.id || l.competition?.id || '0',
          name: l.name || l.league?.name || l.competition?.name || 'Unknown'
        }));
      } catch (e) {
        logger.warn('Failed to fetch leagues from aggregator', e);
      }
    }

    // Fallback to popular leagues if none fetched
    if (!leagues || leagues.length === 0) {
      leagues = [
        { id: '39', name: '⚽ Premier League (England)' },
        { id: '140', name: '⚽ La Liga (Spain)' },
        { id: '135', name: '⚽ Serie A (Italy)' },
        { id: '61', name: '⚽ Ligue 1 (France)' },
        { id: '78', name: '⚽ Bundesliga (Germany)' },
        { id: '2', name: '🏆 UEFA Champions League' },
        { id: '3', name: '🏆 UEFA Europa League' },
        { id: '39', name: '📺 Other Leagues' }
      ];
    }

    const keyboard = leagues.map(l => [{
      text: l.name.includes('⚽') || l.name.includes('🏆') ? l.name : `⚽ ${l.name}`,
      callback_data: `league_${l.id}`
    }]);
    keyboard.push([{ text: '🔙 Back to Sports', callback_data: 'menu_live' }]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🏟️ *${sportName}* - Select a league\n\nChoose your favorite league to see live matches, odds, and standings.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.warn('handleSportCallback failed', err);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `Loading ${sportName} leagues...`,
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
      const paymentMethodObjects = getAvailablePaymentMethods(userRegion);
      const paymentMethodIds = paymentMethodObjects.map(m => m.id);
      
      // Handle case where no payment methods are available
      if (!paymentMethodIds || paymentMethodIds.length === 0) {
        return {
          method: 'answerCallbackQuery',
          callback_query_id: undefined,
          text: `❌ No payment methods available in your region (${userRegion}). Please contact support.`,
          show_alert: true
        };
      }

      // Persist selected tier for this user for 15 minutes so payment callbacks can reference it
      try {
        await redis.setex(`user:${userId}:pending_payment`, 900, JSON.stringify({ tier, region: userRegion, createdAt: Date.now() }));
      } catch (e) {
        logger.warn('Failed to persist pending payment', e);
      }
      
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `🌀 *${tierConfig.name}* - KES ${tierConfig.price}/month\n\n✨ *Features:*\n${tierConfig.features.map(f => `• ${f}`).join('\n')}\n\n*Select payment method:*`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buildPaymentMethodButtons(paymentMethodIds, tier)
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
 * methodIds: array of method ID strings like ['SAFARICOM_TILL', 'MPESA', 'BINANCE']
 */
function buildPaymentMethodButtons(methodIds, tier) {
  const buttons = [];
  
  if (!methodIds || methodIds.length === 0) return buttons;
  
  // Safaricom Till (high priority for KE)
  if (methodIds.includes('SAFARICOM_TILL')) {
    const TILL_NUMBER = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';
    buttons.push([{
      text: `🏪 Safaricom Till #${TILL_NUMBER} (Recommended)`,
      callback_data: `pay_safaricom_till_${tier}`
    }]);
  }
  
  // M-Pesa
  if (methodIds.includes('MPESA')) {
    buttons.push([{
      text: '📱 M-Pesa STK Push',
      callback_data: `pay_mpesa_${tier}`
    }]);
  }
  
  // PayPal
  if (methodIds.includes('PAYPAL')) {
    buttons.push([{
      text: '💳 PayPal',
      callback_data: `pay_paypal_${tier}`
    }]);
  }
  
  // Binance
  if (methodIds.includes('BINANCE')) {
    buttons.push([{
      text: '₿ Binance Pay',
      callback_data: `pay_binance_${tier}`
    }]);
  }
  
  // SWIFT
  if (methodIds.includes('SWIFT')) {
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
async function handleProfileCallback(data, chatId, userId, redis) {
  try {
    if (data === 'profile_stats') {
      const user = await redis.hgetall(`user:${userId}`) || {};
      const sub = await getUserSubscription(redis, userId);
      
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: formatProfile({
          name: user.name || 'BETRIX User',
          tier: sub.tier || 'FREE',
          joinDate: user.joinDate || new Date().toLocaleDateString(),
          predictions: user.predictions || 0,
          winRate: user.winRate || '0',
          points: user.points || 0,
          referralCode: user.referralCode || `USER${userId}`,
          referrals: user.referrals || 0,
          bonusPoints: user.bonusPoints || 0
        }),
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_bets') {
      const bets = await redis.lrange(`user:${userId}:bets`, 0, 4) || [];
      const betList = bets.length > 0 
        ? `Recent bets:\n${bets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
        : 'No bets placed yet. Start by selecting a match!';
      
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `💰 *My Bets*\n\n${betList}\n\n_Tap a bet to view details_`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_favorites') {
      const favs = await redis.smembers(`user:${userId}:favorites`) || [];
      const favList = favs.length > 0
        ? `Your favorite teams:\n${favs.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
        : 'No favorites yet. Add teams to track them!';
      
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `⭐ *My Favorites*\n\n${favList}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_settings') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `🔧 *Account Settings*\n\n• Notifications: ✅ Enabled\n• Language: 🌐 English\n• Timezone: 🕐 UTC+3\n\n_Settings panel coming soon!_`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    // Fallback
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `🌀 *BETRIX* - Profile Feature`,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('Profile callback error', err);
    return null;
  }
}

/**
 * Handle help callbacks
 */
async function handleHelpCallback(data, chatId, userId, redis) {
  try {
    if (data === 'help_faq') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `❓ *Frequently Asked Questions*

*Q: How do I place a bet?*
A: Tap ⚽ Live Games → Select sport → Choose a match → Tap "Quick Bet"

*Q: What are the subscription tiers?*
A: Free (basic), Pro (KES 899/mo), VVIP (KES 2,699/mo), Plus (KES 8,999/mo)

*Q: How do I make a payment?*
A: Go to 💰 Subscribe → Pick your plan → Choose payment method

*Q: What's the referral code for?*
A: Share your code with friends. When they sign up, you both earn bonuses!

*Q: Is BETRIX available 24/7?*
A: Yes! Bet anytime, live analysis every day.

*Need more help?*
Contact: support@betrix.app`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    if (data === 'help_demo') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `🎮 *Try the Demo*

Let's walk through a real example:

*Step 1:* Tap ⚽ Live Games
*Step 2:* Select ⚽ Football
*Step 3:* Choose Premier League
*Step 4:* You'll see live matches
*Step 5:* Tap a match → "Quick Bet"
*Step 6:* Enter your stake
*Step 7:* Confirm bet

💡 *Pro Tip:* Use VVIP for advanced predictions with 85%+ accuracy!

Ready? Tap "Back" and start! 🚀`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    if (data === 'help_contact') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `📧 *Contact Support*

We're here to help! Reach out:

📧 *Email:* support@betrix.app
💬 *WhatsApp:* +254 700 123456
🐦 *Twitter:* @BETRIXApp
📱 *Telegram:* @BETRIXSupport

*Response time:* Usually within 2 hours

*For billing issues:* billing@betrix.app
*For technical support:* tech@betrix.app`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    // Fallback
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `📚 *Help & Support*\n\n${data}`,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('Help callback error', err);
    return null;
  }
}

/**
 * Handle payment method selection with tier extraction
 */
async function handlePaymentMethodSelection(data, chatId, userId, redis, services) {
  try {
    const parts = data.split('_');
    // Format: pay_METHOD_TIER (e.g., pay_mpesa_vvip, pay_safaricom_till_pro)
    if (parts.length < 3) {
      logger.error('Invalid payment callback format', { data, parts });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid payment selection. Please try again.',
        show_alert: true
      };
    }
    
    const tier = parts[parts.length - 1].toUpperCase();
    const paymentMethod = parts.slice(1, -1).join('_').toUpperCase();
    
    // Validate tier
    if (!TIERS[tier]) {
      logger.error('Invalid tier in payment callback', { data, tier });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid tier. Please try again.',
        show_alert: true
      };
    }
    
    // Validate payment method exists in PAYMENT_PROVIDERS
    if (!PAYMENT_PROVIDERS[paymentMethod]) {
      logger.error('Unknown payment method', { data, paymentMethod });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: `❌ Payment method '${paymentMethod}' not recognized. Please try again.`,
        show_alert: true
      };
    }

    // Read region from pending payment record (set when tier was selected) or from user profile
    let userRegion = 'KE';
    try {
      const pending = await redis.get(`user:${userId}:pending_payment`);
      if (pending) {
        const pendingObj = JSON.parse(pending);
        userRegion = pendingObj.region || userRegion;
      }
    } catch (e) {
      logger.warn('Failed to read pending region from redis', e);
    }
    
    // Fallback to profile region
    if (userRegion === 'KE') {
      const profileRegion = await redis.hget(`user:${userId}:profile`, 'region').catch(() => null);
      if (profileRegion) userRegion = profileRegion;
    }

    // Validate payment method is available for user's region
    const available = getAvailablePaymentMethods(userRegion);
    if (!available.find(m => m.id === paymentMethod)) {
      const availableNames = available.map(m => m.name).join(', ');
      logger.warn('Payment method not available for region', { paymentMethod, userRegion, available: availableNames });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: `❌ ${paymentMethod} is not available in ${userRegion}. Available: ${availableNames}`,
        show_alert: true
      };
    }

    // Create payment order
    const order = await createPaymentOrder(
      redis,
      userId,
      tier,
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
      if (instructions.tillNumber) instrText += 'Till: *' + instructions.tillNumber + '*\n';
      if (instructions.reference) instrText += 'Reference: `' + instructions.reference + '`\n';
      if (instructions.checkoutUrl) instrText += 'Open the payment link to continue.';
    } else {
      instrText = 'Please follow the provider instructions to complete payment for order ' + order.orderId + '.';
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
