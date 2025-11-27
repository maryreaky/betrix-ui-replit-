/**
 * Superior Fixtures Management System
 * Advanced fixture browsing, filtering, and interactive selection
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('FixturesManager');

/**
 * Build comprehensive fixtures display with filtering options
 */
export class FixturesManager {
  constructor(redis) {
    this.redis = redis;
    this.fixtures = new Map();
    this.leagueCache = new Map();
  }

  /**
   * Get fixtures by league with caching
   */
  async getLeagueFixtures(leagueId, view = 'upcoming', limit = 15) {
    try {
      const cacheKey = `fixtures:${leagueId}:${view}`;
      const cached = await this.redis?.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Would be populated by sports aggregator
      const fixtures = this.fixtures.get(leagueId) || [];
      
      // Filter by view
      const now = Date.now();
      let filtered = [];

      if (view === 'upcoming') {
        filtered = fixtures.filter(f => {
          const fixtureTime = new Date(f.date || f.time || 0).getTime();
          return fixtureTime > now;
        });
      } else if (view === 'live') {
        filtered = fixtures.filter(f => f.status === 'LIVE' || f.status === 'live' || f.status === 'IN_PLAY');
      } else if (view === 'completed') {
        filtered = fixtures.filter(f => f.status === 'FINISHED' || f.status === 'FT' || f.status === 'finished');
      }

      // Sort by date
      filtered.sort((a, b) => {
        const timeA = new Date(a.date || a.time || 0).getTime();
        const timeB = new Date(b.date || b.time || 0).getTime();
        return view === 'completed' ? timeB - timeA : timeA - timeB;
      });

      const result = filtered.slice(0, limit);

      // Cache for 5 minutes
      if (this.redis) {
        await this.redis.setex(cacheKey, 300, JSON.stringify(result));
      }

      return result;
    } catch (err) {
      logger.error('Get league fixtures error', err);
      return [];
    }
  }

  /**
   * Get matches for today
   */
  async getTodayMatches(sport = 'football') {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const allFixtures = Array.from(this.fixtures.values()).flat();
      
      return allFixtures.filter(f => {
        const fixtureDate = new Date(f.date || f.time || 0);
        fixtureDate.setHours(0, 0, 0, 0);
        return fixtureDate.getTime() === today.getTime() && (f.sport || sport).toLowerCase() === sport.toLowerCase();
      }).sort((a, b) => {
        const timeA = new Date(a.date || a.time || 0).getTime();
        const timeB = new Date(b.date || b.time || 0).getTime();
        return timeA - timeB;
      });
    } catch (err) {
      logger.error('Get today matches error', err);
      return [];
    }
  }

  /**
   * Get matches for upcoming week
   */
  async getUpcomingWeek(sport = 'football') {
    try {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const allFixtures = Array.from(this.fixtures.values()).flat();

      return allFixtures.filter(f => {
        const fixtureDate = new Date(f.date || f.time || 0);
        return fixtureDate >= today && fixtureDate <= nextWeek && (f.sport || sport).toLowerCase() === sport.toLowerCase();
      }).sort((a, b) => {
        const timeA = new Date(a.date || a.time || 0).getTime();
        const timeB = new Date(b.date || b.time || 0).getTime();
        return timeA - timeB;
      });
    } catch (err) {
      logger.error('Get upcoming week error', err);
      return [];
    }
  }

  /**
   * Format match for display with all relevant info
   */
  formatMatch(match, includeStats = true) {
    const home = match.home || match.homeTeam || 'Home';
    const away = match.away || match.awayTeam || 'Away';
    const score = match.score || (match.homeScore !== undefined ? `${match.homeScore}-${match.awayScore}` : '─');
    const status = match.status || 'SCHEDULED';
    const time = match.time || match.minute || 'TBD';
    const league = match.league || match.competition || '';

    let formatted = `*${home}* vs *${away}*\n`;

    // Status indicator
    if (status === 'LIVE' || status === 'live' || status === 'IN_PLAY') {
      formatted += `🔴 LIVE \`${score}\` ⏱ ${time}\n`;
    } else if (status === 'FINISHED' || status === 'FT' || status === 'finished') {
      formatted += `✅ FT \`${score}\`\n`;
    } else {
      formatted += `📅 ${time} (${new Date(match.date || match.time || 0).toLocaleDateString()})\n`;
    }

    // League info
    if (league) {
      formatted += `🏆 ${league}\n`;
    }

    // Stats if available and requested
    if (includeStats) {
      if (match.odds) {
        formatted += `💰 Odds: ${match.odds.home || '-'} • ${match.odds.draw || '-'} • ${match.odds.away || '-'}\n`;
      }

      if (match.possession) {
        formatted += `⚙️ Possession: ${match.possession.home || '-'}% • ${match.possession.away || '-'}%\n`;
      }

      if (match.stats?.shots) {
        formatted += `🎯 Shots: ${match.stats.shots.home || '-'} • ${match.stats.shots.away || '-'}\n`;
      }
    }

    return formatted;
  }

  /**
   * Build interactive fixture browser keyboard
   */
  buildFixtureBrowserKeyboard(leagueId, currentView = 'upcoming') {
    return {
      inline_keyboard: [
        [
          { text: currentView === 'upcoming' ? '📅 Upcoming ✓' : '📅 Upcoming', callback_data: `fixtures_${leagueId}_upcoming` },
          { text: currentView === 'live' ? '🔴 Live ✓' : '🔴 Live', callback_data: `fixtures_${leagueId}_live` }
        ],
        [
          { text: currentView === 'completed' ? '✅ Completed ✓' : '✅ Completed', callback_data: `fixtures_${leagueId}_completed` },
          { text: '⭐ Favorites', callback_data: 'fav_matches' }
        ],
        [
          { text: '🔙 Back to Leagues', callback_data: 'menu_live' }
        ]
      ]
    };
  }

  /**
   * Build match selection buttons (compact view)
   */
  buildMatchSelectionButtons(matches, leagueId, maxButtons = 10) {
    const buttons = [];

    matches.slice(0, maxButtons).forEach((match, idx) => {
      const score = match.homeScore !== undefined ? `${match.homeScore}-${match.awayScore}` : '─';
      const label = `${match.home.substring(0, 8)} ${score} ${match.away.substring(0, 8)}`;
      buttons.push({
        text: label,
        callback_data: `match_${leagueId}_${idx}`
      });
    });

    return buttons;
  }

  /**
   * Format today's matches summary
   */
  async getTodaySummary() {
    try {
      const todayMatches = await this.getTodayMatches();
      
      if (todayMatches.length === 0) {
        return '📭 No matches today. Check back tomorrow!';
      }

      let summary = `📅 *Today's Matches* (${todayMatches.length} total)\n\n`;

      // Group by league
      const byLeague = {};
      todayMatches.forEach(m => {
        const league = m.league || 'Other';
        if (!byLeague[league]) byLeague[league] = [];
        byLeague[league].push(m);
      });

      // Format by league
      Object.entries(byLeague).forEach(([league, matches]) => {
        summary += `🏆 *${league}* (${matches.length})\n`;
        matches.slice(0, 3).forEach(m => {
          const time = new Date(m.date || m.time || 0).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const status = m.status === 'LIVE' ? '🔴' : '📅';
          summary += `${status} ${time} - *${m.home}* vs *${m.away}*\n`;
        });
        if (matches.length > 3) {
          summary += `... and ${matches.length - 3} more\n`;
        }
        summary += '\n';
      });

      return summary;
    } catch (err) {
      logger.error('Get today summary error', err);
      return '❌ Error loading today\'s matches.';
    }
  }

  /**
   * Get featured matches (top leagues, big teams)
   */
  async getFeaturedMatches() {
    try {
      const topLeagues = ['39', '140', '135', '78', '61', '2'];
      const featured = [];

      for (const leagueId of topLeagues) {
        const fixtures = await this.getLeagueFixtures(leagueId, 'upcoming', 3);
        featured.push(...fixtures);
      }

      // Sort by date and limit
      return featured.sort((a, b) => {
        const timeA = new Date(a.date || a.time || 0).getTime();
        const timeB = new Date(b.date || b.time || 0).getTime();
        return timeA - timeB;
      }).slice(0, 10);
    } catch (err) {
      logger.error('Get featured matches error', err);
      return [];
    }
  }

  /**
   * Get matches by teams
   */
  getMatchesByTeams(team1, team2) {
    try {
      const allFixtures = Array.from(this.fixtures.values()).flat();
      
      return allFixtures.filter(f => {
        const home = (f.home || f.homeTeam || '').toLowerCase();
        const away = (f.away || f.awayTeam || '').toLowerCase();
        const t1 = team1.toLowerCase();
        const t2 = team2.toLowerCase();

        return (home === t1 && away === t2) || (home === t2 && away === t1);
      });
    } catch (err) {
      logger.error('Get matches by teams error', err);
      return [];
    }
  }

  /**
   * Format comparison between upcoming teams
   */
  formatMatchPreview(match) {
    let preview = `🔮 *Match Preview*\n\n`;
    preview += `*${match.home}* vs *${match.away}*\n\n`;

    if (match.date) {
      preview += `📅 ${new Date(match.date).toLocaleDateString()}\n`;
      preview += `⏰ ${new Date(match.date).toLocaleTimeString()}\n\n`;
    }

    if (match.league) {
      preview += `🏆 ${match.league}\n`;
    }

    if (match.venue) {
      preview += `🏟️ ${match.venue}\n`;
    }

    // Recent form
    if (match.homeForm || match.awayForm) {
      preview += `\n📊 *Recent Form:*\n`;
      preview += `${match.home}: ${match.homeForm || 'N/A'}\n`;
      preview += `${match.away}: ${match.awayForm || 'N/A'}\n`;
    }

    // Head to head
    if (match.headToHead) {
      preview += `\n⚖️ *Head to Head:*\n`;
      preview += `${match.home} wins: ${match.headToHead.homeWins || 0}\n`;
      preview += `${match.away} wins: ${match.headToHead.awayWins || 0}\n`;
      preview += `Draws: ${match.headToHead.draws || 0}\n`;
    }

    return preview;
  }

  /**
   * High-confidence matches (strong patterns)
   */
  getHighConfidenceMatches() {
    try {
      const allFixtures = Array.from(this.fixtures.values()).flat();

      return allFixtures.filter(f => {
        // High confidence if:
        // 1. Strong head-to-head advantage
        // 2. One team in excellent form (WWWW)
        // 3. Large goal difference expected
        // 4. Significant odds gap

        const homeWins = (f.homeForm || '').match(/W/g)?.length || 0;
        const awayWins = (f.awayForm || '').match(/W/g)?.length || 0;

        return (homeWins >= 3 || awayWins >= 3) &&
               Math.abs((f.odds?.homeOdds || 2) - (f.odds?.awayOdds || 2.5)) > 1;
      }).slice(0, 5);
    } catch (err) {
      logger.error('Get high confidence matches error', err);
      return [];
    }
  }

  /**
   * Value bets (odds mismatch)
   */
  getValueBetMatches() {
    try {
      const allFixtures = Array.from(this.fixtures.values()).flat();

      return allFixtures.filter(f => {
        // Value if: Market underestimates a team in good form
        const marketHome = f.odds?.homeOdds || 2;
        const homeWins = (f.homeForm || '').match(/W/g)?.length || 0;

        return homeWins >= 2 && marketHome > 2.5;
      }).slice(0, 5);
    } catch (err) {
      logger.error('Get value bet matches error', err);
      return [];
    }
  }
}

export default FixturesManager;
