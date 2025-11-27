/**
 * SportsData.io API Integration
 * Fetches live sports data from SportsData.io
 * API Key: abdb2e2047734f23b576e1984d67e2d7
 * Docs: https://sportsdata.io/developers/api-documentation/
 */

import axios from 'axios';
import { Logger } from '../utils/logger.js';

const logger = new Logger('SportsDataAPI');

export class SportsDataAPI {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.SPORTSDATA_API_KEY || 'abdb2e2047734f23b576e1984d67e2d7';
    this.baseUrl = 'https://api.sportsdata.io/v3';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('SportsData API key not configured');
    }

    // Sport slug mappings
    this.sportMappings = {
      'football': { key: 'soccer', slug: 'soccer' },
      'soccer': { key: 'soccer', slug: 'soccer' },
      'nfl': { key: 'nfl', slug: 'nfl' },
      'mlb': { key: 'mlb', slug: 'mlb' },
      'nba': { key: 'nba', slug: 'nba' },
      'hockey': { key: 'nhl', slug: 'nhl' }
    };
  }

  /**
   * Get live matches for a sport
   * @param {string} sport - e.g., 'soccer', 'nfl', 'mlb'
   * @param {number} leagueId - Optional league ID
   * @returns {Promise<Array>} Live games
   */
  async getLiveGames(sport = 'soccer', leagueId = null) {
    if (!this.enabled) return [];

    try {
      const sportKey = this.sportMappings[sport]?.slug || 'soccer';
      const today = new Date().toISOString().split('T')[0];

      let url = `${this.baseUrl}/${sportKey}/scores/json/GamesByDate/${today}`;
      if (leagueId) {
        url += `?competitionId=${leagueId}`;
      }

      const response = await axios.get(url, {
        params: { key: this.apiKey }
      });

      return (response.data || []).map(game => ({
        id: game.GameId || game.EventId,
        home: game.HomeTeam || game.AwayTeamCountry || 'Home',
        away: game.AwayTeam || game.AwayTeamCountry || 'Away',
        score: game.HomeTeamScore !== undefined ? `${game.HomeTeamScore}-${game.AwayTeamScore}` : null,
        status: game.Status || 'Scheduled',
        time: game.DateTime || null,
        league: game.League || game.Competition || 'Unknown',
        sport: sport,
        odds: null
      }));
    } catch (error) {
      logger.error(`Failed to fetch live games from SportsData (${sport}):`, error.message);
      return [];
    }
  }

  /**
   * Get all competitions/leagues for a sport
   * @param {string} sport - e.g., 'soccer', 'nfl'
   * @returns {Promise<Array>} Available competitions
   */
  async getCompetitions(sport = 'soccer') {
    if (!this.enabled) return [];

    try {
      const sportKey = this.sportMappings[sport]?.slug || 'soccer';
      const response = await axios.get(`${this.baseUrl}/${sportKey}/scores/json/Competitions`, {
        params: { key: this.apiKey }
      });

      return (response.data || []).map(comp => ({
        id: comp.CompetitionId,
        name: comp.Name || comp.CompetitionName,
        country: comp.Area?.CountryCode || comp.Country || 'Unknown',
        season: comp.CurrentSeason?.Season || new Date().getFullYear(),
        sport: sport
      }));
    } catch (error) {
      logger.error(`Failed to fetch competitions from SportsData (${sport}):`, error.message);
      return [];
    }
  }

  /**
   * Get standings for a league/competition
   * @param {number} competitionId - Competition ID
   * @param {number} season - Season year
   * @returns {Promise<Array>} League standings
   */
  async getStandings(competitionId, season = null) {
    if (!this.enabled) return [];

    try {
      season = season || new Date().getFullYear();

      const response = await axios.get(
        `${this.baseUrl}/soccer/scores/json/Standings/${competitionId}/${season}`,
        { params: { key: this.apiKey } }
      );

      const standings = [];
      (response.data?.ConferenceWildcards || response.data || []).forEach(conf => {
        (conf.Divisions || [conf]).forEach(division => {
          (division.Teams || []).forEach(team => {
            standings.push({
              position: team.Ranking || standings.length + 1,
              team: team.TeamName || team.Name,
              played: team.Games,
              won: team.Wins,
              draw: team.Draws,
              lost: team.Losses,
              points: team.Points || team.Wins * 3 + (team.Draws || 0),
              goalDiff: team.GoalDifferential || 0
            });
          });
        });
      });

      return standings;
    } catch (error) {
      logger.error(`Failed to fetch standings from SportsData:`, error.message);
      return [];
    }
  }

  /**
   * Get betting odds for games
   * @param {string} sport - Sport slug
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Games with odds
   */
  async getBettingOdds(sport = 'soccer', date = null) {
    if (!this.enabled) return [];

    try {
      date = date || new Date().toISOString().split('T')[0];
      const sportKey = this.sportMappings[sport]?.slug || 'soccer';

      const response = await axios.get(
        `${this.baseUrl}/${sportKey}/scores/json/GamesByDate/${date}`,
        { params: { key: this.apiKey } }
      );

      return (response.data || []).map(game => ({
        id: game.GameId,
        home: game.HomeTeam,
        away: game.AwayTeam,
        odds: {
          '1xBet': this._extractOdds(game['1xBet']),
          'Bet365': this._extractOdds(game.Bet365),
          'DraftKings': this._extractOdds(game.DraftKings),
          'FanDuel': this._extractOdds(game.FanDuel)
        },
        spread: game.Spread || null,
        total: game.OverUnder || null
      }));
    } catch (error) {
      logger.error(`Failed to fetch betting odds from SportsData:`, error.message);
      return [];
    }
  }

  /**
   * Get team players/roster
   * @param {number} teamId - Team ID
   * @param {number} season - Season year
   * @returns {Promise<Array>} Team players
   */
  async getTeamRoster(teamId, season = null) {
    if (!this.enabled) return [];

    try {
      season = season || new Date().getFullYear();

      const response = await axios.get(
        `${this.baseUrl}/soccer/scores/json/Players/${teamId}/${season}`,
        { params: { key: this.apiKey } }
      );

      return (response.data || []).map(player => ({
        id: player.PlayerID,
        name: player.FirstName + ' ' + player.LastName,
        position: player.Position,
        number: player.Jersey,
        stats: {
          goals: player.GoalsScored,
          assists: player.Assists,
          appearances: player.Appearances
        }
      }));
    } catch (error) {
      logger.error(`Failed to fetch team roster from SportsData:`, error.message);
      return [];
    }
  }

  /**
   * Get player profile details
   * @param {number} playerId - Player ID
   * @returns {Promise<Object>} Player details
   */
  async getPlayerProfile(playerId) {
    if (!this.enabled) return null;

    try {
      const response = await axios.get(
        `${this.baseUrl}/soccer/scores/json/Player/${playerId}`,
        { params: { key: this.apiKey } }
      );

      const player = response.data;
      if (!player) return null;

      return {
        id: player.PlayerID,
        name: `${player.FirstName} ${player.LastName}`,
        team: player.CurrentTeamName,
        position: player.Position,
        number: player.Jersey,
        stats: {
          goals: player.GoalsScored,
          assists: player.Assists,
          yellow: player.YellowCards,
          red: player.RedCards,
          appearances: player.Appearances
        },
        nationality: player.Nationality,
        birthDate: player.BirthDate
      };
    } catch (error) {
      logger.error(`Failed to fetch player profile from SportsData:`, error.message);
      return null;
    }
  }

  /**
   * Get game schedule for a competition
   * @param {number} competitionId - Competition ID
   * @param {number} season - Season year
   * @returns {Promise<Array>} Scheduled games
   */
  async getSchedule(competitionId, season = null) {
    if (!this.enabled) return [];

    try {
      season = season || new Date().getFullYear();

      const response = await axios.get(
        `${this.baseUrl}/soccer/scores/json/Games/${competitionId}/${season}`,
        { params: { key: this.apiKey } }
      );

      return (response.data || []).map(game => ({
        id: game.GameId,
        home: game.HomeTeam,
        away: game.AwayTeam,
        date: game.DateTime,
        status: game.Status,
        score: game.HomeTeamScore !== null ? `${game.HomeTeamScore}-${game.AwayTeamScore}` : null,
        round: game.Round
      }));
    } catch (error) {
      logger.error(`Failed to fetch schedule from SportsData:`, error.message);
      return [];
    }
  }

  /**
   * Extract odds from sportsbook data
   * @private
   */
  _extractOdds(sportsbookData) {
    if (!sportsbookData) return null;
    
    return {
      home: parseFloat(sportsbookData.MoneyLine?.HomeTeamMoneyLine || 0) / 100,
      draw: parseFloat(sportsbookData.MoneyLine?.DrawMoneyLine || 0) / 100,
      away: parseFloat(sportsbookData.MoneyLine?.AwayTeamMoneyLine || 0) / 100
    };
  }
}

export default SportsDataAPI;
