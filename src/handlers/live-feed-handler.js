/**
 * Live Feed Command Handler
 * Handles Telegram commands for live matches, fixtures, and sports updates
 * Uses SportMonks API with proper data formatting
 */

import { Logger } from '../utils/logger.js';
import { MatchFormatter } from '../utils/match-formatter.js';

const logger = new Logger('LiveFeedHandler');

export class LiveFeedHandler {
  constructor(bot, sportsAggregator, redis) {
    this.bot = bot;
    this.aggregator = sportsAggregator;
    this.redis = redis;
  }

  /**
   * Handle /live command - show all live matches
   */
  async handleLiveCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      logger.info(`/live command from ${chatId}`);
      
      // Get all live matches
      const matches = await this.aggregator.getAllLiveMatches();
      
      if (!matches || matches.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          '🌀 No live matches at this moment.\n\n' +
          'Check /fixtures for upcoming games or /subscribe for live updates!',
          { parse_mode: 'HTML' }
        );
      }

      const message = MatchFormatter.formatLiveMatches(matches);
      
      // Send with keyboard
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'cmd_live_refresh' }],
            [{ text: '📅 Fixtures', callback_data: 'cmd_fixtures' }],
            [{ text: '📊 Summary', callback_data: 'cmd_summary' }]
          ]
        }
      });
    } catch (e) {
      logger.error('handleLiveCommand error:', e.message);
      await this.bot.sendMessage(
        chatId,
        '❌ Error fetching live matches. Please try again.',
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Handle /fixtures command - show upcoming fixtures
   */
  async handleFixturesCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      logger.info(`/fixtures command from ${chatId}`);
      
      // Get upcoming fixtures
      const fixtures = await this.aggregator.getFixtures();
      
      if (!fixtures || fixtures.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          '📅 No upcoming fixtures available at this moment.\n\n' +
          'Check /live for current matches!',
          { parse_mode: 'HTML' }
        );
      }

      const message = MatchFormatter.formatFixtures(fixtures);
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'cmd_fixtures_refresh' }],
            [{ text: '🔴 Live Now', callback_data: 'cmd_live' }],
            [{ text: '📊 Summary', callback_data: 'cmd_summary' }]
          ]
        }
      });
    } catch (e) {
      logger.error('handleFixturesCommand error:', e.message);
      await this.bot.sendMessage(
        chatId,
        '❌ Error fetching fixtures. Please try again.',
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Handle /standings command - show league standings
   */
  async handleStandingsCommand(msg) {
    const chatId = msg.chat.id;
    const args = msg.text.split(' ').slice(1);
    const leagueId = args[0] || 39; // Default to Premier League
    
    try {
      logger.info(`/standings command from ${chatId} for league ${leagueId}`);
      
      const standings = await this.aggregator.getStandings(leagueId);
      
      if (!standings || standings.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          '📋 No standings available for this league.',
          { parse_mode: 'HTML' }
        );
      }

      const message = MatchFormatter.formatStandings(standings);
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: `cmd_standings_${leagueId}` }],
            [{ text: '🔴 Live', callback_data: 'cmd_live' }],
            [{ text: '📅 Fixtures', callback_data: 'cmd_fixtures' }]
          ]
        }
      });
    } catch (e) {
      logger.error('handleStandingsCommand error:', e.message);
      await this.bot.sendMessage(
        chatId,
        '❌ Error fetching standings. Please try again.',
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Handle /summary command - show overall feed summary
   */
  async handleSummaryCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      logger.info(`/summary command from ${chatId}`);
      
      // Get all data
      const [liveMatches, fixtures, standings] = await Promise.all([
        this.aggregator.getAllLiveMatches(),
        this.aggregator.getFixtures(),
        this.aggregator.getStandings(39)
      ]);

      // Count by status
      const live = (liveMatches || []).filter(m => m.status === 'LIVE').length;
      const upcoming = (fixtures || []).filter(f => f.status === 'SCHEDULED').length;
      const finished = (liveMatches || []).filter(m => m.status === 'FINISHED').length;

      const message = MatchFormatter.formatSummary(live, upcoming, finished) +
        '\n\n📊 Data from SportMonks & Football-Data';
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔴 Live Matches', callback_data: 'cmd_live' }],
            [{ text: '📅 Fixtures', callback_data: 'cmd_fixtures' }],
            [{ text: '📋 Standings', callback_data: 'cmd_standings_39' }]
          ]
        }
      });
    } catch (e) {
      logger.error('handleSummaryCommand error:', e.message);
      await this.bot.sendMessage(
        chatId,
        '❌ Error fetching summary. Please try again.',
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Handle match detail request
   */
  async handleMatchDetail(msg, matchId) {
    const chatId = msg.chat.id;
    
    try {
      const match = await this.aggregator.getMatchById(matchId, 'football');
      
      if (!match) {
        return await this.bot.sendMessage(
          chatId,
          '❌ Match not found.',
          { parse_mode: 'HTML' }
        );
      }

      const detail = `<b>${match.home}</b> ${match.homeScore || '?'} - ${match.awayScore || '?'} <b>${match.away}</b>\n\n` +
        `Status: <b>${match.status}</b>\n` +
        `Time: ${match.time}\n` +
        `League: ${match.league}\n` +
        `Venue: ${match.venue}`;
      
      await this.bot.sendMessage(chatId, detail, {
        parse_mode: 'HTML',
        reply_markup: MatchFormatter.getMatchKeyboard(match)
      });
    } catch (e) {
      logger.error('handleMatchDetail error:', e.message);
      await this.bot.sendMessage(
        chatId,
        '❌ Error loading match details.',
        { parse_mode: 'HTML' }
      );
    }
  }

  /**
   * Handle callback queries for inline buttons
   */
  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    try {
      if (data === 'cmd_live_refresh') {
        await this.bot.editMessageText(
          '⏳ Loading live matches...',
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' }
        );
        await this.handleLiveCommand({ chat: { id: chatId }, text: '/live' });
      } else if (data === 'cmd_fixtures_refresh') {
        await this.handleFixturesCommand({ chat: { id: chatId }, text: '/fixtures' });
      } else if (data === 'cmd_live') {
        await this.handleLiveCommand({ chat: { id: chatId }, text: '/live' });
      } else if (data === 'cmd_fixtures') {
        await this.handleFixturesCommand({ chat: { id: chatId }, text: '/fixtures' });
      } else if (data === 'cmd_summary') {
        await this.handleSummaryCommand({ chat: { id: chatId }, text: '/summary' });
      } else if (data.startsWith('cmd_standings_')) {
        const leagueId = data.split('_')[2];
        await this.handleStandingsCommand({ chat: { id: chatId }, text: `/standings ${leagueId}` });
      }

      // Answer callback query
      await this.bot.answerCallbackQuery(query.id);
    } catch (e) {
      logger.error('handleCallback error:', e.message);
      await this.bot.answerCallbackQuery(query.id, {
        text: '❌ Error processing request',
        show_alert: true
      });
    }
  }

  /**
   * Register all command handlers with the bot
   */
  registerHandlers() {
    this.bot.onText(/^\/live(\s|$)/, msg => this.handleLiveCommand(msg));
    this.bot.onText(/^\/fixtures(\s|$)/, msg => this.handleFixturesCommand(msg));
    this.bot.onText(/^\/standings(\s|$)/, msg => this.handleStandingsCommand(msg));
    this.bot.onText(/^\/summary(\s|$)/, msg => this.handleSummaryCommand(msg));
    
    this.bot.on('callback_query', query => this.handleCallback(query));
    
    logger.info('✅ Live feed command handlers registered');
  }
}

export default LiveFeedHandler;
