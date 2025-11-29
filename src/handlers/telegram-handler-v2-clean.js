/**
 * Telegram Handler v2 (clean)
 * Minimal, robust handler to restore worker startup and preserve core flows:
 * - /live command renders paginated soccer menu with REAL SportMonks data
 * - callback routes: match:<id>:<sport>, odds:<id>, menu_live_page:<sport>:<page>
 */

import { Logger } from '../utils/logger.js';
import { formatOdds, buildLiveMenuPayload } from './menu-handler.js';
import SportMonksService from '../services/sportmonks-service.js';

const logger = new Logger('TelegramHandlerV2');

function tryParseJson(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function getLiveMatchesBySport(sport, redis, sportsAggregator, sportMonksAPI) {
  try {
    // For soccer/football, always fetch LIVE data from SportMonks
    if (sport === 'soccer' || sport === 'football') {
      try {
        logger.info('🔄 Fetching LIVE soccer matches from SportMonks...');
        
        // Try to use SportMonks service directly
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
      } catch (e) {
        logger.warn('SportMonks fetch error', e?.message || String(e));
      }
    }

    // Fallback: Try cached data
    const cacheKey = 'betrix:prefetch:live:by-sport';
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = tryParseJson(cached);
      if (data && data.sports && data.sports[sport] && Array.isArray(data.sports[sport].samples)) {
        logger.info(`📦 Got cached ${sport} matches (${data.sports[sport].count || 0} total)`);
        return data.sports[sport].samples;
      }
    }

    if (sport === 'soccer') {
      const live39 = await redis.get('live:39').catch(() => null);
      const parsed = tryParseJson(live39);
      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.info('📦 Got cached soccer matches from live:39');
        return parsed;
      }
    }

    // Last resort: return empty array (not demo data)
    logger.warn(`⚠️ No live ${sport} matches available from any source`);
    return [];
  } catch (e) {
    logger.warn('getLiveMatchesBySport failed', e?.message || String(e));
    return [];
  }
}

export async function handleMessage(update, redis, services) {
  try {
    const message = update.message || update.edited_message;
    if (!message) return null;
    const chatId = message.chat.id;
    const text = message.text || '';

    if (text && text.startsWith('/live')) {
      const sportMonksAPI = services && services.sportMonks;
      const games = await getLiveMatchesBySport('soccer', redis, services && services.sportsAggregator, sportMonksAPI);
      const payload = buildLiveMenuPayload(games, 'Soccer', 'FREE', 1, 6);
      return { method: 'sendMessage', chat_id: chatId, text: payload.text, reply_markup: payload.reply_markup, parse_mode: 'Markdown' };
    }

    return { method: 'sendMessage', chat_id: chatId, text: 'Send /live to view live soccer matches.' };
  } catch (e) {
    logger.warn('handleMessage error', e?.message || String(e));
    return null;
  }
}

export async function handleCallbackQuery(update, redis, services) {
  try {
    const cq = update.callback_query;
    if (!cq || !cq.data) return null;
    const data = cq.data;
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;

    if (data.startsWith('match:')) {
      const parts = data.split(':');
      const matchId = parts[1];
      const sport = parts[2] || 'soccer';
      const agg = services && services.sportsAggregator;
      if (!agg) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Service unavailable.' };
      try {
        const match = await agg.getMatchById(matchId, sport);
        if (!match) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Match not found.' };
        const home = match.home || match.home_team || match.homeName || 'Home';
        const away = match.away || match.away_team || match.awayName || 'Away';
        const score = (match.homeScore != null || match.awayScore != null) ? `${match.homeScore || 0}-${match.awayScore || 0}` : '';
        const text = `*${home}* vs *${away}*\n${score}\nProvider: ${match.provider || 'unknown'}`;
        return { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text, parse_mode: 'Markdown' };
      } catch (e) {
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Failed to load match details', show_alert: true };
      }
    }

    if (data.startsWith('odds:')) {
      const parts = data.split(':');
      const matchId = parts[1];
      const agg = services && services.sportsAggregator;
      if (!agg) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Service unavailable.' };
      try {
        const odds = await agg.getOdds(matchId);
        const text = (odds && odds.length > 0) ? formatOdds(odds) : 'No odds available for this match.';
        return { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text, parse_mode: 'Markdown' };
      } catch (e) {
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Failed to load odds', show_alert: true };
      }
    }

    if (data.startsWith('menu_live_page') || data.startsWith('menu_live_refresh')) {
      try {
        const parts = data.split(':');
        const sport = parts[1] || 'soccer';
        const page = parseInt(parts[2], 10) || 1;
        const sportMonksAPI = services && services.sportMonks;
        const games = await getLiveMatchesBySport(sport, redis, services && services.sportsAggregator, sportMonksAPI);
        const payload = buildLiveMenuPayload(games, sport.charAt(0).toUpperCase() + sport.slice(1), 'FREE', page, 6);
        if (cq && cq.message && typeof cq.message.message_id !== 'undefined') {
          return [
            { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text: payload.text, reply_markup: payload.reply_markup, parse_mode: 'Markdown' },
            { method: 'answerCallbackQuery', callback_query_id: cq.id, text: '' }
          ];
        }
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unable to update message.' };
      } catch (e) {
        logger.warn('Failed to handle pagination', e?.message || String(e));
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unable to load page.' };
      }
    }

    return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unknown action' };
  } catch (e) {
    logger.warn('handleCallbackQuery failed', e?.message || String(e));
    return null;
  }
}

/**
 * Unified command handler for /start, /menu, /help, /live
 */
export async function handleCommand(command, chatId, userId, redis, services) {
  try {
    logger.info(`Handling command: ${command}`);

    if (command === '/start' || command === '/menu' || command === '/help' || command.startsWith('/live')) {
      const sportMonksAPI = services && services.sportMonks;
      const games = await getLiveMatchesBySport('soccer', redis, services && services.sportsAggregator, sportMonksAPI);
      const payload = buildLiveMenuPayload(games, 'Soccer', 'FREE', 1, 6);
      return {
        chat_id: chatId,
        text: payload.text,
        reply_markup: payload.reply_markup,
        parse_mode: 'Markdown'
      };
    }

    return {
      chat_id: chatId,
      text: 'Send /live to view live soccer matches.',
      parse_mode: 'Markdown'
    };
  } catch (e) {
    logger.warn('handleCommand failed', e?.message || String(e));
    return {
      chat_id: chatId,
      text: '❌ Error processing command. Try /live',
      parse_mode: 'Markdown'
    };
  }
}

export default {
  handleMessage,
  handleCallbackQuery,
  handleCommand
};