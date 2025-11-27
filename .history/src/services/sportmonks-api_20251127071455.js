/**
 * SportMonks API Integration
 * Fetches live sports data from SportMonks API
 * API Key: zUdIC2auUmiG6bUS5v7Mc53IxJwqiQ2gBMyFqsTI9KnnBJJQMM5eExZsPh42
 */

import axios from 'axios';
import { Logger } from '../utils/logger.js';

const logger = new Logger('SportMonksAPI');

export class SportMonksAPI {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.SPORTMONKS_API_KEY || 'zUdIC2auUmiG6bUS5v7Mc53IxJwqiQ2gBMyFqsTI9KnnBJJQMM5eExZsPh42';
    this.baseUrl = 'https://api.sportmonks.com/v3';
    this.enabled = !!this.apiKey;
    
    if (!this.enabled) {
      logger.warn('SportMonks API key not configured');
    }
  }

  /**
   * Get live matches for a specific sport
   * @param {string} sportSlug - e.g., 'football', 'baseball'
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Live matches
   */
  async getLiveMatches(sportSlug = 'football', limit = 20) {
    if (!this.enabled) return [];
    
    try {
      const response = await axios.get(`${this.baseUrl}/${sportSlug}/fixtures/inplay`, {
        params: {
          api_token: this.apiKey,
          include: 'teams,league,scores',
          per_page: limit
        }
      });

      return (response.data?.data || []).map(match => ({
        id: match.id,
        home: match.teams?.data?.[0]?.name || 'Home',
        away: match.teams?.data?.[1]?.name || 'Away',
        score: match.scores?.data ? `${match.scores.data[0]?.score || 0}-${match.scores.data[1]?.score || 0}` : null,
        time: match.minute_text || null,
        status: match.status,
        league: match.league?.data?.name || 'Unknown',
        sport: sportSlug,
        odds: null,
        timestamp: match.starting_at
      }));
    } catch (error) {
      logger.error(`Failed to fetch live matches from SportMonks (${sportSlug}):`, error.message);
      return [];
    }
  }

  /**
   * Get all available leagues/competitions
   * @param {string} sportSlug - e.g., 'football'
   * @returns {Promise<Array>} Available leagues
   */
  async getLeagues(sportSlug = 'football') {
    if (!this.enabled) return [];
    
    try {
      const response = await axios.get(`${this.baseUrl}/${sportSlug}/leagues`, {
        params: {
          api_token: this.apiKey,
          per_page: 50
        }
      });

      return (response.data?.data || []).map(league => ({
        id: league.id,
        name: league.name,
        country: league.country?.data?.name || 'Unknown',
        sport: sportSlug
      }));
    } catch (error) {
      logger.error(`Failed to fetch leagues from SportMonks (${sportSlug}):`, error.message);
      return [];
    }
  }

  /**
   * Get standings/table for a league
   * @param {number} leagueId - League ID
   * @returns {Promise<Array>} League standings
   */
  async getStandings(leagueId) {
    if (!this.enabled) return [];
    
    try {
      const response = await axios.get(`${this.baseUrl}/football/standings`, {
        params: {
          api_token: this.apiKey,
          filter: { league_id: leagueId },
          include: 'team'
        }
      });

      const standings = [];
      (response.data?.data || []).forEach(standing => {
        standings.push({
          position: standing.position,
          team: standing.team?.data?.name || 'Unknown',
          played: standing.games_played,
          won: standing.won,
          draw: standing.draw,
          lost: standing.lost,
          points: standing.points,
          goalDiff: standing.goal_difference
        });
      });
      return standings;
    } catch (error) {
      logger.error(`Failed to fetch standings from SportMonks (${leagueId}):`, error.message);
      return [];
    }
  }

  /**
   * Get match details including odds
   * @param {number} matchId - Match ID
   * @returns {Promise<Object>} Match details
   */
  async getMatchDetails(matchId) {
    if (!this.enabled) return null;
    
    try {
      const response = await axios.get(`${this.baseUrl}/football/fixtures/${matchId}`, {
        params: {
          api_token: this.apiKey,
          include: 'teams,league,odds,scores'
        }
      });

      const match = response.data?.data;
      if (!match) return null;

      return {
        id: match.id,
        home: match.teams?.data?.[0]?.name || 'Home',
        away: match.teams?.data?.[1]?.name || 'Away',
        score: match.scores?.data ? `${match.scores.data[0]?.score || 0}-${match.scores.data[1]?.score || 0}` : null,
        time: match.minute_text,
        status: match.status,
        league: match.league?.data?.name || 'Unknown',
        odds: this._formatOdds(match.odds?.data || []),
        stats: match.statistics || {}
      };
    } catch (error) {
      logger.error(`Failed to fetch match details from SportMonks (${matchId}):`, error.message);
      return null;
    }
  }

  /**
   * Format odds from SportMonks data
   * @private
   */
  _formatOdds(oddsData) {
    if (!Array.isArray(oddsData) || oddsData.length === 0) return null;

    const formatted = {};
    oddsData.forEach(odds => {
      const provider = odds.bookmaker?.data?.name || 'Unknown';
      formatted[provider] = {
        home: parseFloat(odds.odds_1x2?.data?.home || 0),
        draw: parseFloat(odds.odds_1x2?.data?.draw || 0),
        away: parseFloat(odds.odds_1x2?.data?.away || 0)
      };
    });
    return formatted;
  }

  /**
   * Search for upcoming matches
   * @param {string} searchTerm - Team or league name
   * @param {number} days - Days ahead to search
   * @returns {Promise<Array>} Upcoming matches
   */
  async searchUpcomingMatches(searchTerm, days = 7) {
    if (!this.enabled) return [];
    
    try {
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

      const response = await axios.get(`${this.baseUrl}/football/fixtures/between`, {
        params: {
          api_token: this.apiKey,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          include: 'teams,league',
          per_page: 100
        }
      });

      const matches = [];
      (response.data?.data || []).forEach(match => {
        const home = match.teams?.data?.[0]?.name || '';
        const away = match.teams?.data?.[1]?.name || '';
        
        if (home.toLowerCase().includes(searchTerm.toLowerCase()) || 
            away.toLowerCase().includes(searchTerm.toLowerCase())) {
          matches.push({
            id: match.id,
            home: home,
            away: away,
            league: match.league?.data?.name || 'Unknown',
            startTime: match.starting_at
          });
        }
      });

      return matches;
    } catch (error) {
      logger.error(`Failed to search upcoming matches from SportMonks:`, error.message);
      return [];
    }
  }
}

export default SportMonksAPI;
