/**
 * Match Formatter for Telegram Bot Display
 * Formats live matches, fixtures, and odds for clean Telegram message display
 */

export class MatchFormatter {
  /**
   * Format a single live match for Telegram display
   * Returns emoji-enhanced string suitable for Telegram messages
   */
  static formatLiveMatch(match) {
    if (!match) return '';

    const status = match.status || 'UNKNOWN';
    const live = status === 'LIVE';
    
    // Status emoji
    const statusEmoji = live ? '🔴' : 
                       status === 'FINISHED' ? '✅' :
                       status === 'SCHEDULED' ? '⏰' :
                       status === 'POSTPONED' ? '⚠️' : '❓';

    // Build score display
    const score = match.homeScore !== null && match.awayScore !== null 
      ? `${match.homeScore} - ${match.awayScore}`
      : 'vs';

    // Time display
    const timeDisplay = live ? `${match.time} ${statusEmoji}` : 
                       status === 'SCHEDULED' ? match.time : 
                       match.time;

    // League display
    const league = match.league ? `  📍 ${match.league}` : '';

    // Venue display
    const venue = match.venue && match.venue !== 'TBA' ? `  🏟️ ${match.venue}` : '';

    return `${statusEmoji} ${match.home} ${score} ${match.away}\n` +
           `   ${timeDisplay}${league}${venue}`;
  }

  /**
   * Format multiple live matches as a Telegram message
   * Groups by status (LIVE first, then others)
   */
  static formatLiveMatches(matches = []) {
    if (!matches || matches.length === 0) {
      return '⚽ No live matches at this time';
    }

    // Sort: LIVE first, then by time
    const sorted = [...matches].sort((a, b) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (a.status !== 'LIVE' && b.status === 'LIVE') return 1;
      return 0;
    });

    // Group by status
    const byStatus = {
      LIVE: [],
      SCHEDULED: [],
      FINISHED: [],
      OTHER: []
    };

    sorted.forEach(m => {
      if (m.status === 'LIVE') byStatus.LIVE.push(m);
      else if (m.status === 'SCHEDULED') byStatus.SCHEDULED.push(m);
      else if (m.status === 'FINISHED') byStatus.FINISHED.push(m);
      else byStatus.OTHER.push(m);
    });

    let message = '';

    // Live matches
    if (byStatus.LIVE.length > 0) {
      message += '🔴 LIVE NOW:\n';
      message += byStatus.LIVE.map(m => this.formatLiveMatch(m)).join('\n\n');
      message += '\n\n';
    }

    // Scheduled
    if (byStatus.SCHEDULED.length > 0) {
      message += '⏰ UPCOMING:\n';
      message += byStatus.SCHEDULED.map(m => this.formatLiveMatch(m)).join('\n\n');
      message += '\n\n';
    }

    // Finished
    if (byStatus.FINISHED.length > 0) {
      message += '✅ FINISHED:\n';
      message += byStatus.FINISHED.map(m => this.formatLiveMatch(m)).join('\n\n');
      message += '\n\n';
    }

    return message.trim();
  }

  /**
   * Format a single fixture for display
   */
  static formatFixture(fixture) {
    if (!fixture) return '';

    const dateStr = fixture.time || 'TBA';
    const venue = fixture.venue ? `\n🏟️ ${fixture.venue}` : '';
    const league = fixture.league ? `\n📍 ${fixture.league}` : '';

    return `⚽ ${fixture.home} vs ${fixture.away}\n⏰ ${dateStr}${venue}${league}`;
  }

  /**
   * Format multiple fixtures as a Telegram message
   */
  static formatFixtures(fixtures = []) {
    if (!fixtures || fixtures.length === 0) {
      return '📅 No upcoming fixtures';
    }

    const message = '📅 UPCOMING FIXTURES:\n\n' +
      fixtures.slice(0, 10).map((f, i) => 
        `${i + 1}. ${this.formatFixture(f)}`
      ).join('\n\n');

    if (fixtures.length > 10) {
      message += `\n\n... and ${fixtures.length - 10} more`;
    }

    return message;
  }

  /**
   * Format odds for display
   */
  static formatOdds(odds) {
    if (!odds) return '';

    return `💰 ${odds.home || 'Home'}\n` +
           `   ${odds.homeOdds || 'N/A'} | ${odds.drawOdds || 'N/A'} | ${odds.awayOdds || 'N/A'}\n` +
           `   vs ${odds.away || 'Away'}`;
  }

  /**
   * Format multiple odds entries
   */
  static formatOddsBoard(oddsArray = []) {
    if (!oddsArray || oddsArray.length === 0) {
      return '📊 No odds available';
    }

    const message = '📊 LIVE ODDS:\n\n' +
      oddsArray.slice(0, 5).map((o, i) =>
        `${i + 1}. ${this.formatOdds(o)}`
      ).join('\n\n');

    if (oddsArray.length > 5) {
      message += `\n\n... and ${oddsArray.length - 5} more`;
    }

    return message;
  }

  /**
   * Format standings table
   */
  static formatStandings(standings = []) {
    if (!standings || standings.length === 0) {
      return '📋 No standings available';
    }

    // Create table header
    let message = '📋 STANDINGS:\n\n' +
      '`Pos | Team                  | P | W | D | L | Pts`\n' +
      '`────────────────────────────────────────────────`\n';

    // Add rows (limit to top 20)
    standings.slice(0, 20).forEach(s => {
      const pos = String(s.position || s.pos || s.rank || '?').padEnd(3);
      const team = String(s.team || s.name || 'TBA').substring(0, 19).padEnd(21);
      const p = String(s.played || s.matches || '?').padEnd(3);
      const w = String(s.won || s.wins || '?').padEnd(3);
      const d = String(s.drawn || s.draws || '?').padEnd(3);
      const l = String(s.lost || s.losses || '?').padEnd(3);
      const pts = String(s.points || s.pts || '?').padEnd(4);

      message += `${pos}| ${team} | ${p}| ${w}| ${d}| ${l}| ${pts}\n`;
    });

    message += '`────────────────────────────────────────────────`';

    return message;
  }

  /**
   * Create an inline keyboard for match actions
   * Used with Telegram inline buttons
   */
  static getMatchKeyboard(match) {
    if (!match) return null;

    return {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: `refresh_match_${match.id}` },
          { text: '📊 Stats', callback_data: `stats_${match.id}` }
        ],
        [
          { text: '💬 Comments', callback_data: `comments_${match.id}` }
        ]
      ]
    };
  }

  /**
   * Format a summary status message
   */
  static formatSummary(liveCount = 0, upcomingCount = 0, finishedCount = 0) {
    return `📊 SPORTS FEED SUMMARY\n\n` +
           `🔴 Live Matches: ${liveCount}\n` +
           `⏰ Upcoming: ${upcomingCount}\n` +
           `✅ Finished: ${finishedCount}\n` +
           `─────────────────────\n` +
           `Total: ${liveCount + upcomingCount + finishedCount}`;
  }
}

export default MatchFormatter;
