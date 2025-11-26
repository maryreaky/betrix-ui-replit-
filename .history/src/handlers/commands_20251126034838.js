/**
 * BETRIX Command Handlers - Consolidated
 * All command implementations in one clean module
 * Supports: /start, /menu, /help, /live, /odds, /standings, /news, /profile, /vvip, /pricing
 * 
 * Usage: import { handleCommand } from './commands.js'
 * Then: await handleCommand(text, chatId, userId, redis, services)
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
  leagueMap,
  sportEmojis
} from './menu-system.js';
import { canAccessFeature, TIERS } from './payment-handler.js';

const logger = new Logger('Commands');

/**
 * Normalize an API-Football fixture (or similar) into a small shape used by formatLiveGames
 * Expected output: { home, away, status, minute, score: { home, away }, tip }
 */
function normalizeApiFootballFixture(f) {
  try {
    // Support multiple possible shapes
    const teams = f.teams || f.teams || {};
    const home = (teams.home && teams.home.name) || f.home || f.home_team || (f.teams && f.teams.home && f.teams.home.name) || null;
    const away = (teams.away && teams.away.name) || f.away || f.away_team || (f.teams && f.teams.away && f.teams.away.name) || null;

    // Status + minute
    const statusObj = f.fixture?.status || f.status || {};
    const status = statusObj.short || statusObj.long || statusObj.description || (statusObj.elapsed ? 'LIVE' : (statusObj.status || 'UNK'));
    const minute = statusObj.elapsed || f.minute || null;

    // Score extraction
    const scores = f.goals || f.score || f.result || {};
    const score = {
      home: (scores.home != null ? scores.home : (scores.fulltime && scores.fulltime.home) || (scores.full && scores[0] && scores[0].home) || null),
      away: (scores.away != null ? scores.away : (scores.fulltime && scores.fulltime.away) || (scores.full && scores[0] && scores[0].away) || null)
    };

    return {
      home: home || (f.teams && f.teams.home && f.teams.home.name) || 'Home',
      away: away || (f.teams && f.teams.away && f.teams.away.name) || 'Away',
      status: status || 'LIVE',
      minute: minute || null,
      score: (score.home != null || score.away != null) ? score : null,
      tip: f.prediction?.summary || f.tip || null
    };
  } catch (err) {
    logger.warn('normalizeApiFootballFixture failed', err?.message || err);
    return null;
  }
}

// League IDs for major football leagues (API-Football)
const LEAGUE_IDS = {
  'premier_league': 39,
  'la_liga': 140,
  'serie_a': 135,
  'ligue_1': 61,
  'bundesliga': 78,
  'champions_league': 1,
  'europa_league': 3,
  'mls': 253,
  'international': 1,
};

/**
 * Main command router
 * Routes text to the appropriate command handler
 */
export async function handleCommand(text, chatId, userId, redis, services) {
  const command = text.split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1);

  try {
    switch (command) {
      case '/start':
        return await handleStart(chatId, userId, redis, services);
      
      case '/menu':
        return await handleMenu(chatId, userId, redis);
      
      case '/help':
        return await handleHelp(chatId);
      
      case '/live':
        return await handleLive(chatId, userId, args[0], redis, services);
      
      case '/odds':
        return await handleOdds(chatId, userId, args[0], redis, services);
      
      case '/standings':
        return await handleStandings(chatId, userId, args[0], redis, services);
      
      case '/news':
        return await handleNews(chatId, userId, redis, services);

      case '/analyze':
        return await handleAnalyze(chatId, userId, args.join(' '), redis, services);

      case '/tips':
        return await handleTips(chatId, userId, redis, services);
      
      case '/profile':
        return await handleProfile(chatId, userId, redis);
      
      case '/vvip':
      case '/subscribe':
        return await handleVVIP(chatId, userId, redis);
      
      case '/pricing':
        return await handlePricing(chatId, userId, redis);

      default:
        return {
          chat_id: chatId,
          text: `🌀 *Command not found: ${command}*\n\nTry /help or /menu for available commands.`,
          parse_mode: 'Markdown'
        };
    }
  } catch (err) {
    logger.error(`Command ${command} failed`, err);
    return {
      chat_id: chatId,
      text: '❌ Error processing command. Try /menu',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /start - Welcome and main menu
 * Shows greeting + main menu buttons
 */
export async function handleStart(chatId, userId, redis, services) {
  logger.info('handleStart', { userId, chatId });
  
  try {
    // Get or create user in Redis
    const userKey = `user:${userId}`;
    let user = await redis.hgetall(userKey);
    
    if (!user || !Object.keys(user).length) {
      // New user - create default
      user = {
        id: userId,
        created_at: new Date().toISOString(),
        tier: 'FREE',
        referral_code: `ref_${userId}_${Date.now()}`
      };
      await redis.hset(userKey, user);
      logger.info('New user created', { userId });
    }
    
    const greeting = `${mainMenu.text}\n\n👋 Welcome to *BETRIX* - your AI sports betting companion!`;
    
    return {
      chat_id: chatId,
      text: greeting,
      reply_markup: mainMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleStart error', err);
    return {
      chat_id: chatId,
      text: 'Welcome to BETRIX! Try /menu',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /menu - Show main menu
 */
export async function handleMenu(chatId, userId, redis) {
  logger.info('handleMenu', { userId });
  
  try {
    const user = await redis.hgetall(`user:${userId}`);
    const tier = user?.tier || 'FREE';
    
    return {
      chat_id: chatId,
      text: mainMenu.text,
      reply_markup: mainMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleMenu error', err);
    return {
      chat_id: chatId,
      text: 'Error loading menu',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /help - Show help menu
 */
export async function handleHelp(chatId) {
  logger.info('handleHelp', { chatId });
  
  return {
    chat_id: chatId,
    text: helpMenu.text,
    reply_markup: helpMenu.reply_markup,
    parse_mode: 'Markdown'
  };
}

/**
 * /live - Show live matches
 */
export async function handleLive(chatId, userId, sport, redis, services) {
  logger.info('handleLive', { userId, sport });
  
  try {
    // Check if user can access this feature
    const user = await redis.hgetall(`user:${userId}`);
    const tier = user?.tier || 'FREE';
    
    // Free users get limited live matches
    const maxMatches = tier === 'FREE' ? 3 : 20;
    
    let games = [];
    
    // Try to fetch from API-Football (via services or fetch directly)
    try {
      if (services && services.apiFootball && typeof services.apiFootball.getLive === 'function') {
        const response = await services.apiFootball.getLive();
        const raw = response?.response || [];
        // Normalize api-football fixtures into the shape expected by formatLiveGames
        games = raw.map(f => normalizeApiFootballFixture(f)).filter(Boolean);
      } else if (services && services.api && typeof services.api.getLive === 'function') {
        const raw = await services.api.getLive();
        games = (raw || []).map(f => normalizeApiFootballFixture(f)).filter(Boolean);
      }
    } catch (e) {
      logger.warn('Failed to fetch live matches', e);
      games = [];
    }

    // Filter and limit
    games = (games || []).slice(0, maxMatches);
    
    // If no games, show helpful message
    if (games.length === 0) {
      return {
        chat_id: chatId,
        text: `🔴 *Live Matches*\n\n⏰ No live matches right now.\n\nTry /standings for league tables or /odds to compare betting lines.`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Standings', callback_data: 'menu_standings' },
              { text: '🎲 Odds', callback_data: 'menu_odds' }
            ],
            [{ text: '🔙 Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }
    
    const formatted = formatLiveGames(games, sport || 'Football');
    
    return {
      chat_id: chatId,
      text: formatted,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'menu_live' },
            { text: '🏆 Standings', callback_data: 'menu_standings' }
          ],
          [{ text: '🔙 Back', callback_data: 'menu_main' }]
        ]
      },
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleLive error', err);
    return {
      chat_id: chatId,
      text: '❌ Error fetching live matches. Try again in a moment.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /odds - Show odds and analysis
 */
export async function handleOdds(chatId, userId, fixtureId, redis, services) {
  logger.info('handleOdds', { userId, fixtureId });
  
  try {
    // If no fixture ID provided, show selector
    if (!fixtureId) {
      return {
        chat_id: chatId,
        text: `🎲 *Betting Odds*\n\nTo view odds for a specific match:\n\n\`/odds [fixture-id]\`\n\nExample: \`/odds 123456\`\n\n💡 Use /live to find fixture IDs.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔴 Live Matches', callback_data: 'menu_live' }],
            [{ text: '🔙 Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    const user = await redis.hgetall(`user:${userId}`);
    const tier = user?.tier || 'FREE';
    
    // VVIP-only detailed odds
    let odds = null;
    try {
      if (services && services.apiFootball && typeof services.apiFootball.getOdds === 'function') {
        const response = await services.apiFootball.getOdds(fixtureId);
        odds = response?.response?.[0] || null;
      }
    } catch (e) {
      logger.warn('Failed to fetch odds', e);
    }
    
    const formatted = formatOdds(odds, fixtureId);
    
    // Append tier message if free
    let text = formatted;
    if (tier === 'FREE') {
      text += '\n\n💎 *Detailed odds analysis* requires VVIP. Upgrade with /vvip';
    }
    
    return {
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔴 Live', callback_data: 'menu_live' },
            { text: '💎 VVIP', callback_data: 'menu_vvip' }
          ],
          [{ text: '🔙 Back', callback_data: 'menu_main' }]
        ]
      },
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleOdds error', err);
    return {
      chat_id: chatId,
      text: '❌ Error fetching odds. Please try again.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /standings - Show league standings
 */
export async function handleStandings(chatId, userId, league, redis, services) {
  logger.info('handleStandings', { userId, league });
  
  try {
    // If no league provided, show selector
    if (!league) {
      return {
        chat_id: chatId,
        text: `🏆 *League Standings*\n\nSelect a league to view the current standings:`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League', callback_data: 'league_39' },
              { text: '🇪🇸 La Liga', callback_data: 'league_140' }
            ],
            [
              { text: '🇮🇹 Serie A', callback_data: 'league_135' },
              { text: '🇫🇷 Ligue 1', callback_data: 'league_61' }
            ],
            [
              { text: '🇩🇪 Bundesliga', callback_data: 'league_78' },
              { text: '🏆 Champions League', callback_data: 'league_1' }
            ],
            [{ text: '🔙 Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    let standings = null;
    try {
      // Try to get standings from API-Football
      // League param could be league ID (39) or league name
      const leagueId = LEAGUE_IDS[league.toLowerCase()] || parseInt(league, 10);
      const season = new Date().getFullYear();
      
      if (services && services.apiFootball && typeof services.apiFootball.getStandings === 'function') {
        const response = await services.apiFootball.getStandings(leagueId, season);
        standings = response?.response?.[0] || null;
      }
    } catch (e) {
      logger.warn('Failed to fetch standings', e);
    }
    
    const formatted = formatStandings(standings, league || 'Premier League');
    
    return {
      chat_id: chatId,
      text: formatted,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'menu_standings' },
            { text: '🔴 Live', callback_data: 'menu_live' }
          ],
          [{ text: '🔙 Back', callback_data: 'menu_main' }]
        ]
      },
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleStandings error', err);
    return {
      chat_id: chatId,
      text: '❌ Error fetching standings. Please try again.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /news - Latest sports news
 */
export async function handleNews(chatId, userId, redis, services) {
  logger.info('handleNews', { userId });
  
  try {
    // Try to fetch articles from provided services (if available)
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
      logger.warn('Failed to fetch news from services.api', e);
    }

    // Fallback to empty list; formatNews will handle empty case
    const formatted = formatNews(articles);

    // Build inline keyboard to allow reading articles when available
    const keyboard = { inline_keyboard: [] };
    if (Array.isArray(articles) && articles.length > 0) {
      // Add up to 5 article buttons
      for (let i = 0; i < Math.min(5, articles.length); i++) {
        const a = articles[i];
        keyboard.inline_keyboard.push([
          { text: `📄 Read: ${a.title?.slice(0, 30) || 'Article'}`, callback_data: `news_${i}` }
        ]);
      }
      keyboard.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'menu_main' }]);
    } else {
      keyboard.inline_keyboard.push([{ text: '🔙 Back', callback_data: 'menu_main' }]);
    }

    return {
      chat_id: chatId,
      text: formatted,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleNews error', err);
    return {
      chat_id: chatId,
      text: '❌ Error fetching news',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /analyze - AI match analysis (uses services.ai if available)
 */
export async function handleAnalyze(chatId, userId, query, redis, services) {
  logger.info('handleAnalyze', { userId, query });

  if (!query || !query.trim()) {
    return {
      chat_id: chatId,
      text: '🧠 Usage: /analyze [home] vs [away]\nExample: /analyze Liverpool vs Man City',
      parse_mode: 'Markdown'
    };
  }

  try {
    if (services && services.ai && typeof services.ai.analyze === 'function') {
      const result = await services.ai.analyze(query, { userId, tier: (await redis.hgetall(`user:${userId}`))?.tier });
      return { chat_id: chatId, text: result.text || result, parse_mode: 'Markdown' };
    }

    // Fallback: simple mock analysis
    const mock = `🔎 *Quick Analysis*\n\nMatch: ${query}\nPrediction: Draw\nConfidence: 62%\n\nUpgrade to VVIP for deeper analysis.`;
    return { chat_id: chatId, text: mock, parse_mode: 'Markdown' };
  } catch (err) {
    logger.error('handleAnalyze error', err);
    return { chat_id: chatId, text: '❌ Error running analysis. Try again later.', parse_mode: 'Markdown' };
  }
}

/**
 * /tips - Short betting tips
 */
export async function handleTips(chatId, userId, redis, services) {
  logger.info('handleTips', { userId });

  try {
    if (services && services.ai && typeof services.ai.tips === 'function') {
      const tips = await services.ai.tips({ userId });
      return { chat_id: chatId, text: tips.text || tips, parse_mode: 'Markdown' };
    }

    const fallback = `🎯 *Quick Tips*\n\n• Manage bankroll: stake <= 2% per bet\n• Look for value >10%\n• Avoid betting on every match\n• Use VVIP for model-backed staking plans`;
    return { chat_id: chatId, text: fallback, parse_mode: 'Markdown' };
  } catch (err) {
    logger.error('handleTips error', err);
    return { chat_id: chatId, text: '❌ Error fetching tips', parse_mode: 'Markdown' };
  }
}

/**
 * /profile - Show user profile
 */
export async function handleProfile(chatId, userId, redis) {
  logger.info('handleProfile', { userId });
  
  try {
    const user = await redis.hgetall(`user:${userId}`);
    const formatted = formatProfile(user);
    
    return {
      chat_id: chatId,
      text: formatted,
      reply_markup: profileMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleProfile error', err);
    return {
      chat_id: chatId,
      text: '❌ Error loading profile',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /vvip or /subscribe - Show subscription menu
 */
export async function handleVVIP(chatId, userId, redis) {
  logger.info('handleVVIP', { userId });
  
  try {
    const user = await redis.hgetall(`user:${userId}`);
    const tier = user?.tier || 'FREE';
    
    let greeting = '🎉 *Upgrade to VVIP*';
    if (tier !== 'FREE') {
      greeting = `✨ *You are on ${tier} tier*\n\n🎯 Want to upgrade?`;
    }
    
    const text = greeting + '\n\n' + subscriptionMenu.text;
    
    return {
      chat_id: chatId,
      text: text,
      reply_markup: subscriptionMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleVVIP error', err);
    return {
      chat_id: chatId,
      text: '❌ Error loading subscription menu',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * /pricing - Show pricing table
 */
export async function handlePricing(chatId, userId, redis) {
  logger.info('handlePricing', { userId });
  
  const pricing = `🌀 *BETRIX Pricing*

*Free Tier*
• Basic live matches
• Limited analysis
• No ads

*Pro Tier (KES 899/month)*
• 🤖 AI-powered analysis
• 📈 Real-time odds
• Priority support

*VVIP Tier (KES 2,699/month)*
• 👑 All Pro features
• 🎯 Advanced predictions
• Custom notifications
• 24/7 support

*BETRIX Plus (KES 8,999/month)*
• 💎 Everything
• VIP chat access
• Exclusive strategies

Want to subscribe? /vvip`;

  return {
    chat_id: chatId,
    text: pricing,
    parse_mode: 'Markdown'
  };
}

export default {
  handleCommand,
  handleStart,
  handleMenu,
  handleHelp,
  handleLive,
  handleOdds,
  handleStandings,
  handleNews,
  handleProfile,
  handleVVIP,
  handlePricing
};
