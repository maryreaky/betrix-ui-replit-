/**
 * Telegram Handler v2 (full-featured)
 * Complete menu system with BETRIX branding + SportMonks live data integration
 */

import { Logger } from '../utils/logger.js';
import { mainMenu } from './menu-handler.js';
import SportMonksService from '../services/sportmonks-service.js';

const logger = new Logger('TelegramHandlerV2');

const ICONS = {
  brand: '🌀',
  live: '⚽',
  standings: '🏆',
  odds: '📊',
  tips: '💡',
  analysis: '🔍',
  menu: '📋',
  vvip: '⭐',
  help: '❓',
  pricing: '💰',
  news: '📰',
  status: '👤',
  signup: '📝',
  refer: '🎁'
};

function tryParseJson(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

/**
 * Fetch REAL live soccer matches from SportMonks
 */
async function getLiveSoccerMatches(redis, sportMonksAPI) {
  try {
    logger.info('🔄 Fetching LIVE soccer matches from SportMonks...');
    
    let matches = [];
    
    // Try via sportMonksAPI if available
    if (sportMonksAPI && typeof sportMonksAPI.getLivescores === 'function') {
      try {
        matches = await sportMonksAPI.getLivescores();
        logger.info(`✅ Got ${matches.length} live matches from sportMonksAPI`);
      } catch (e) {
        logger.debug('sportMonksAPI.getLivescores failed', e?.message);
      }
    }

    // Fallback: Try via SportMonksService directly
    if (!matches || matches.length === 0) {
      try {
        const sportMonksService = new SportMonksService();
        matches = await sportMonksService.getLivescores();
        logger.info(`✅ Got ${matches.length} live matches from SportMonksService`);
      } catch (e) {
        logger.debug('SportMonksService direct fetch failed', e?.message);
      }
    }

    // Normalize matches to expected format
    if (Array.isArray(matches) && matches.length > 0) {
      const normalized = matches.map(m => ({
        id: m.id || m.fixture_id || String(Math.random()),
        home: m.home_team || m.homeName || m.home || 'Unknown',
        away: m.away_team || m.awayName || m.away || 'Unknown',
        status: m.status || m.state || 'TBA',
        homeScore: m.homeScore !== undefined ? m.homeScore : m.score?.home,
        awayScore: m.awayScore !== undefined ? m.awayScore : m.score?.away,
        provider: 'SportMonks'
      }));
      logger.info(`✅ Normalized ${normalized.length} matches for display`);
      return normalized;
    }

    return [];
  } catch (e) {
    logger.warn('SportMonks fetch error', e?.message || String(e));
    return [];
  }
}

/**
 * Build live soccer menu with real match data
 */
async function buildLiveSoccerMenu(redis, sportMonksAPI) {
  try {
    const matches = await getLiveSoccerMatches(redis, sportMonksAPI);
    
    if (!matches || matches.length === 0) {
      return {
        text: `${ICONS.brand} *BETRIX - Premium Sports Analytics*\n\n${ICONS.live} *Live Soccer Matches*\n\nNo live soccer matches right now.\n\nCheck back later for exciting matchups! ⚽`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'menu_live_refresh:soccer:1' }],
            [{ text: '← Back to Menu', callback_data: 'menu_main' }]
          ]
        }
      };
    }

    // Build match list (limit to 10)
    const displayMatches = matches.slice(0, 10);
    const matchText = displayMatches.map((m, i) => {
      const score = (m.homeScore != null && m.awayScore != null) 
        ? `${m.homeScore}-${m.awayScore}`
        : '---';
      return `${i+1}. *${m.home}* *${score}* *${m.away}*\n   ⏱ ${m.status}`;
    }).join('\n\n');

    const text = `${ICONS.brand} *BETRIX - Premium Sports Analytics*\n\n${ICONS.live} *Live Soccer Matches* (${matches.length} total)\n\n${matchText}\n\n_Powered by SportMonks_`;

    // Build keyboard with match callbacks
    const keyboard = [];
    for (let i = 0; i < Math.min(displayMatches.length, 5); i++) {
      const m = displayMatches[i];
      keyboard.push([{ 
        text: `${m.home} vs ${m.away}`, 
        callback_data: `match:${m.id}:soccer` 
      }]);
    }
    
    // Add navigation buttons
    keyboard.push([
      { text: '🔄 Refresh', callback_data: 'menu_live_refresh:soccer:1' },
      { text: '← Back', callback_data: 'menu_main' }
    ]);

    return {
      text,
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (e) {
    logger.warn('buildLiveSoccerMenu error', e?.message || String(e));
    return {
      text: `${ICONS.brand} *BETRIX - Premium Sports Analytics*\n\n${ICONS.live} *Live Soccer*\n\nError loading matches. Try again.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Retry', callback_data: 'menu_live_refresh:soccer:1' }],
          [{ text: '← Back', callback_data: 'menu_main' }]
        ]
      }
    };
  }
}

export async function handleMessage(update, redis, services) {
  try {
    const message = update.message || update.edited_message;
    if (!message) return null;
    const chatId = message.chat.id;
    const text = message.text || '';

    // Route to appropriate handler
    if (text === '/start') {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: mainMenu.text,
        reply_markup: mainMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    if (text === '/menu') {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: mainMenu.text,
        reply_markup: mainMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    if (text === '/live') {
      const sportMonksAPI = services && services.sportMonks;
      const liveMenu = await buildLiveSoccerMenu(redis, sportMonksAPI);
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: liveMenu.text,
        reply_markup: liveMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    if (text === '/help') {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `${ICONS.help} *BETRIX Help*\n\n` +
          `${ICONS.menu} /menu - Main menu\n` +
          `${ICONS.live} /live - Live matches\n` +
          `${ICONS.standings} /standings - League standings\n` +
          `${ICONS.odds} /odds - Betting odds\n` +
          `${ICONS.tips} /tips - Expert tips\n` +
          `${ICONS.pricing} /pricing - Subscription plans`,
        parse_mode: 'Markdown'
      };
    }

    // Default: show main menu
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: mainMenu.text,
      reply_markup: mainMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (e) {
    logger.warn('handleMessage error', e?.message || String(e));
    return {
      method: 'sendMessage',
      chat_id: message.chat.id,
      text: '❌ Error processing message. Try /menu',
      parse_mode: 'Markdown'
    };
  }
}

export async function handleCallbackQuery(update, redis, services) {
  try {
    const cq = update.callback_query;
    if (!cq || !cq.data) return null;
    const data = cq.data;
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;

    // Main menu
    if (data === 'menu_main') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: mainMenu.text,
        reply_markup: mainMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    // Live menu
    if (data === 'menu_live') {
      const sportMonksAPI = services && services.sportMonks;
      const liveMenu = await buildLiveSoccerMenu(redis, sportMonksAPI);
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: liveMenu.text,
        reply_markup: liveMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    // Refresh live menu
    if (data.startsWith('menu_live_refresh')) {
      const sportMonksAPI = services && services.sportMonks;
      const liveMenu = await buildLiveSoccerMenu(redis, sportMonksAPI);
      return [
        {
          method: 'editMessageText',
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: liveMenu.text,
          reply_markup: liveMenu.reply_markup,
          parse_mode: 'Markdown'
        },
        {
          method: 'answerCallbackQuery',
          callback_query_id: cq.id,
          text: '🔄 Updated!'
        }
      ];
    }

    // Match details
    if (data.startsWith('match:')) {
      const parts = data.split(':');
      const matchId = parts[1];
      const sport = parts[2] || 'soccer';
      
      // TODO: Fetch match details from SportMonks
      return {
        method: 'answerCallbackQuery',
        callback_query_id: cq.id,
        text: `Match ID: ${matchId} (${sport})`,
        show_alert: false
      };
    }

    // Placeholder callbacks for other menu items
    if (data === 'menu_odds') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.odds} *Betting Odds & Analysis*\n\nSelect a sport to view latest odds:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚽ Soccer', callback_data: 'odds_soccer' }],
            [{ text: '🏈 NFL', callback_data: 'odds_nfl' }],
            [{ text: '🏀 NBA', callback_data: 'odds_nba' }],
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    if (data === 'menu_standings') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.standings} *League Standings*\n\nSelect a league to view standings:`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚽ Premier League', callback_data: 'standings_pl' }],
            [{ text: '⚽ La Liga', callback_data: 'standings_laliga' }],
            [{ text: '⚽ Serie A', callback_data: 'standings_seriea' }],
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    if (data === 'menu_news') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.news} *Latest Sports News*\n\nBreaking stories and updates from around the world.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    if (data === 'menu_vvip') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.vvip} *VVIP Subscription*\n\nUnlock premium features:\n\n✨ Advanced Match Analysis\n🎯 Expert Predictions\n💎 Priority Support\n🏆 Exclusive Tips\n\n_Starting from $9.99/month_`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Subscribe Now', callback_data: 'vvip_subscribe' }],
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    if (data === 'menu_help') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.help} *Help & Support*\n\n${ICONS.live} /live - View live matches\n${ICONS.odds} /odds - Check betting odds\n${ICONS.standings} /standings - League tables\n${ICONS.tips} /tips - Expert predictions\n${ICONS.menu} /menu - Return to menu`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    if (data === 'menu_profile') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `${ICONS.status} *My Profile*\n\n👤 User ID: ${chatId}\n💳 Plan: Free\n📊 Matches Viewed: 0`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Back', callback_data: 'menu_main' }]
          ]
        },
        parse_mode: 'Markdown'
      };
    }

    // Unknown action
    return {
      method: 'answerCallbackQuery',
      callback_query_id: cq.id,
      text: '❌ Unknown action',
      show_alert: false
    };
  } catch (e) {
    logger.warn('handleCallbackQuery failed', e?.message || String(e));
    return {
      method: 'answerCallbackQuery',
      callback_query_id: cq.id,
      text: '❌ Error processing action',
      show_alert: true
    };
  }
}

/**
 * Unified command handler for /start, /menu, /help, /live
 */
export async function handleCommand(command, chatId, userId, redis, services) {
  try {
    logger.info(`Handling command: ${command}`);

    if (command === '/start' || command === '/menu') {
      return {
        chat_id: chatId,
        text: mainMenu.text,
        reply_markup: mainMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    if (command === '/live') {
      const sportMonksAPI = services && services.sportMonks;
      const liveMenu = await buildLiveSoccerMenu(redis, sportMonksAPI);
      return {
        chat_id: chatId,
        text: liveMenu.text,
        reply_markup: liveMenu.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    if (command === '/help') {
      return {
        chat_id: chatId,
        text: `${ICONS.help} *BETRIX Help*\n\n${ICONS.menu} /menu - Main menu\n${ICONS.live} /live - Live matches\n${ICONS.standings} /standings - League standings\n${ICONS.odds} /odds - Betting odds\n${ICONS.tips} /tips - Expert tips\n${ICONS.pricing} /pricing - Subscription plans`,
        parse_mode: 'Markdown'
      };
    }

    // Default: main menu
    return {
      chat_id: chatId,
      text: mainMenu.text,
      reply_markup: mainMenu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (e) {
    logger.warn('handleCommand failed', e?.message || String(e));
    return {
      chat_id: chatId,
      text: '❌ Error processing command. Try /menu',
      parse_mode: 'Markdown'
    };
  }
}

export default {
  handleMessage,
  handleCallbackQuery,
  handleCommand
};