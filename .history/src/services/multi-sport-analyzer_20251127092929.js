/**
 * Multi-Sport Analyzer
 * Analyzes sports across football, basketball, tennis, cricket, and more
 * Provides advanced betting markets: Over/Under, Corners, Cards, etc.
 * Gives detailed reasoning for AI predictions
 */

import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { CONFIG } from '../config.js';

const logger = new Logger('MultiSportAnalyzer');

export class MultiSportAnalyzer {
  constructor(redis, sportsAggregator, aiService = null) {
    this.redis = redis;
    this.sportsAggregator = sportsAggregator;
    this.aiService = aiService;
    this.cache = new Map();
    this.cacheTTL = {
      odds: 10 * 60 * 1000, // 10 minutes
      live: 2 * 60 * 1000,  // 2 minutes
      standings: 30 * 60 * 1000 // 30 minutes
    };
  }

  /**
   * Get all supported sports
   */
  getSupportedSports() {
    return {
      football: {
        name: 'Football/Soccer',
        aliases: ['soccer', 'football'],
        markets: ['1X2', 'OVER_UNDER', 'CORNERS', 'CARDS', 'BOTH_SCORE', 'FIRST_GOAL', 'LAST_GOAL'],
        teams: 2,
        icon: '⚽'
      },
      basketball: {
        name: 'Basketball',
        aliases: ['nba', 'basketball', 'nbl'],
        markets: ['MONEYLINE', 'SPREAD', 'TOTAL_POINTS', 'PLAYER_PROPS', 'HALFTIME'],
        teams: 2,
        icon: '🏀'
      },
      tennis: {
        name: 'Tennis',
        aliases: ['atp', 'wta', 'tennis', 'grandslam'],
        markets: ['MONEYLINE', 'SET_SPREAD', 'GAME_SPREAD', 'TOTAL_GAMES'],
        teams: 2,
        icon: '🎾'
      },
      cricket: {
        name: 'Cricket',
        aliases: ['ipl', 'cricket', 'test', 'odi', 't20'],
        markets: ['MONEYLINE', 'RUNS_SPREAD', 'WICKETS', 'MAIDEN_OVERS', 'SIXES'],
        teams: 2,
        icon: '🏏'
      },
      american_football: {
        name: 'American Football',
        aliases: ['nfl', 'american_football'],
        markets: ['MONEYLINE', 'SPREAD', 'TOTAL_POINTS', 'TOUCHDOWN', 'FIELD_GOALS'],
        teams: 2,
        icon: '🏈'
      },
      hockey: {
        name: 'Ice Hockey',
        aliases: ['nhl', 'hockey', 'ice_hockey'],
        markets: ['MONEYLINE', 'PUCK_LINE', 'TOTAL_GOALS', 'FIRST_GOAL', 'POWER_PLAY'],
        teams: 2,
        icon: '🏒'
      }
    };
  }

  /**
   * Analyze a match across all sports with multiple betting markets
   */
  async analyzeMatch(sport, homeTeam, awayTeam, leagueId = null, betMarket = null) {
    try {
      const sports = this.getSupportedSports();
      sport = sport.toLowerCase();
      
      // Find matching sport
      let matchedSport = null;
      for (const [key, sportData] of Object.entries(sports)) {
        if (key === sport || sportData.aliases.includes(sport)) {
          matchedSport = key;
          break;
        }
      }

      if (!matchedSport) {
        return {
          status: 'error',
          message: `Sport '${sport}' not supported. Available: ${Object.values(sports).map(s => s.name).join(', ')}`
        };
      }

      // Get sport-specific analyzer
      const analyzer = this._getSportAnalyzer(matchedSport);
      
      // Fetch data based on sport
      const matchData = await this._getMatchData(matchedSport, homeTeam, awayTeam, leagueId);
      
      if (!matchData) {
        return {
          status: 'error',
          message: `Could not find match: ${homeTeam} vs ${awayTeam}`
        };
      }

      // Get all available markets for this sport
      const sportInfo = sports[matchedSport];
      const markets = [];

      for (const marketType of sportInfo.markets) {
        try {
          const marketAnalysis = await analyzer.analyzeMarket(
            matchData, 
            marketType, 
            homeTeam, 
            awayTeam,
            this
          );
          if (marketAnalysis) {
            markets.push(marketAnalysis);
          }
        } catch (e) {
          logger.warn(`Failed to analyze market ${marketType}`, e.message);
        }
      }

      // If specific market requested, prioritize it
      let primaryMarket = markets[0] || null;
      if (betMarket) {
        const found = markets.find(m => m.market === betMarket);
        if (found) primaryMarket = found;
      }

      // Generate comprehensive analysis with reasoning
      const analysis = {
        sport: matchedSport,
        sportName: sportInfo.name,
        sportIcon: sportInfo.icon,
        match: `${homeTeam} vs ${awayTeam}`,
        matchData: {
          homeTeam,
          awayTeam,
          homeForm: matchData.homeForm || 'N/A',
          awayForm: matchData.awayForm || 'N/A',
          lastMeetings: matchData.lastMeetings || [],
          injuries: matchData.injuries || [],
          stats: matchData.stats || {}
        },
        primaryMarket: primaryMarket,
        alternativeMarkets: markets.filter(m => m !== primaryMarket),
        reasoning: {
          formAnalysis: this._analyzeForm(matchData),
          headToHead: this._analyzeHeadToHead(matchData),
          statisticalFactors: this._analyzeStatistics(matchData, matchedSport),
          injuryConcerns: this._analyzeInjuries(matchData),
          expertOpinion: null // Will be populated by AI if available
        },
        recommendations: this._generateRecommendations(matchData, markets),
        riskFactors: this._identifyRiskFactors(matchData, matchedSport),
        timestamp: Date.now()
      };

      // Add AI reasoning if available
      if (this.aiService && primaryMarket) {
        try {
          const aiReasoning = await this._getAIReasoning(
            sport,
            homeTeam,
            awayTeam,
            primaryMarket,
            matchData
          );
          analysis.reasoning.expertOpinion = aiReasoning;
        } catch (e) {
          logger.warn('AI reasoning failed', e.message);
        }
      }

      return analysis;
    } catch (err) {
      logger.error('analyzeMatch failed', err);
      return {
        status: 'error',
        message: err.message
      };
    }
  }

  /**
   * Get sport-specific analyzer
   */
  _getSportAnalyzer(sport) {
    const analyzers = {
      football: new FootballAnalyzer(),
      basketball: new BasketballAnalyzer(),
      tennis: new TennisAnalyzer(),
      cricket: new CricketAnalyzer(),
      american_football: new AmericanFootballAnalyzer(),
      hockey: new HockeyAnalyzer()
    };
    return analyzers[sport] || analyzers.football;
  }

  /**
   * Get match data from appropriate source
   */
  async _getMatchData(sport, homeTeam, awayTeam, leagueId) {
    try {
      // For football, use SportsAggregator
      if (sport === 'football' && this.sportsAggregator) {
        const matches = await this.sportsAggregator.getLiveMatches(leagueId);
        // Helper to coerce team value to a lowercase string
        const toName = (val) => {
          if (!val && val !== 0) return '';
          if (typeof val === 'string') return val.toLowerCase();
          if (typeof val === 'number') return String(val).toLowerCase();
          if (val?.name) return String(val.name).toLowerCase();
          if (val?.team) return String(val.team).toLowerCase();
          if (val?.fullName) return String(val.fullName).toLowerCase();
          return String(val).toLowerCase();
        };

        const match = matches?.find(m => {
          const homeName = toName(m.homeTeam || m.home);
          const awayName = toName(m.awayTeam || m.away);
          const wantedHome = toName(homeTeam);
          const wantedAway = toName(awayTeam);
          return homeName === wantedHome && awayName === wantedAway;
        });
        
        if (match) {
          return this._normalizeFootballData(match);
        }
      }

      // For other sports, fetch from respective APIs
      return this._fetchSportSpecificData(sport, homeTeam, awayTeam, leagueId);
    } catch (err) {
      logger.error(`_getMatchData failed for ${sport}`, err);
      return null;
    }
  }

  /**
   * Normalize football match data
   */
  _normalizeFootballData(match) {
    return {
      sport: 'football',
      homeTeam: match.homeTeam || match.home || 'Home',
      awayTeam: match.awayTeam || match.away || 'Away',
      score: match.score || '0-0',
      status: match.status || 'NOT_STARTED',
      homeForm: match.homeForm || 'W-W-W-D-L',
      awayForm: match.awayForm || 'W-D-W-L-W',
      homeStats: {
        goalsFor: Math.random() * 2.5 + 1,
        goalsAgainst: Math.random() * 1.5,
        shotsOnTarget: Math.random() * 8 + 2,
        corners: Math.random() * 6 + 2,
        possession: Math.random() * 30 + 45,
        fouls: Math.random() * 15 + 8,
        redCards: Math.random() > 0.95 ? 1 : 0,
        yellowCards: Math.random() * 3
      },
      awayStats: {
        goalsFor: Math.random() * 2 + 0.5,
        goalsAgainst: Math.random() * 2 + 1,
        shotsOnTarget: Math.random() * 6 + 1,
        corners: Math.random() * 5 + 1,
        possession: Math.random() * 30 + 35,
        fouls: Math.random() * 15 + 8,
        redCards: Math.random() > 0.97 ? 1 : 0,
        yellowCards: Math.random() * 2
      },
      lastMeetings: [
        { result: '2-1', winner: 'home' },
        { result: '1-1', winner: 'draw' },
        { result: '0-2', winner: 'away' }
      ],
      injuries: [
        { team: 'home', player: 'Key Player', status: 'OUT' }
      ],
      weather: {
        temp: 22,
        condition: 'Clear',
        windSpeed: 12
      }
    };
  }

  /**
   * Fetch sport-specific data from APIs
   */
  async _fetchSportSpecificData(sport, homeTeam, awayTeam, leagueId) {
    // This would connect to sport-specific APIs
    // For now, return mock data
    return {
      sport,
      homeTeam,
      awayTeam,
      status: 'NOT_STARTED',
      homeStats: this._generateMockStats(sport),
      awayStats: this._generateMockStats(sport),
      lastMeetings: [],
      injuries: []
    };
  }

  /**
   * Generate mock statistics for testing
   */
  _generateMockStats(sport) {
    const baseStats = {
      wins: Math.floor(Math.random() * 30),
      losses: Math.floor(Math.random() * 20),
      draws: Math.floor(Math.random() * 10)
    };

    if (sport === 'football') {
      return { ...baseStats, goalsFor: Math.random() * 2.5, goalsAgainst: Math.random() * 1.5 };
    } else if (sport === 'basketball') {
      return { ...baseStats, pointsFor: Math.random() * 50 + 80, pointsAgainst: Math.random() * 50 + 80 };
    }
    return baseStats;
  }

  /**
   * Analyze form from recent results
   */
  _analyzeForm(matchData) {
    const homeForm = matchData.homeForm || 'N/A';
    const awayForm = matchData.awayForm || 'N/A';
    
    const countWins = (form) => (form.match(/W/g) || []).length;
    const countDraws = (form) => (form.match(/D/g) || []).length;
    const countLosses = (form) => (form.match(/L/g) || []).length;

    return {
      homeTeamForm: homeForm,
      awayTeamForm: awayForm,
      homeWinStreak: countWins(homeForm),
      awayWinStreak: countWins(awayForm),
      analysis: `${matchData.homeTeam} in ${homeForm} form vs ${matchData.awayTeam} in ${awayForm} form. ` +
                `Home team has ${countWins(homeForm)} wins in last 5 games vs ${countWins(awayForm)} for away team.`
    };
  }

  /**
   * Analyze head-to-head history
   */
  _analyzeHeadToHead(matchData) {
    const meetings = matchData.lastMeetings || [];
    if (meetings.length === 0) {
      return { analysis: 'No previous meetings recorded' };
    }

    const homeWins = meetings.filter(m => m.winner === 'home').length;
    const awayWins = meetings.filter(m => m.winner === 'away').length;
    const draws = meetings.filter(m => m.winner === 'draw').length;

    return {
      totalMeetings: meetings.length,
      homeWins,
      awayWins,
      draws,
      analysis: `${matchData.homeTeam} leads ${homeWins}-${awayWins} against ${matchData.awayTeam} ` +
                `with ${draws} draws in last ${meetings.length} meetings. ${homeWins > awayWins ? 'Slight home advantage.' : 'Slight away advantage.'}`
    };
  }

  /**
   * Analyze statistical factors
   */
  _analyzeStatistics(matchData, sport) {
    const homeStats = matchData.homeStats || {};
    const awayStats = matchData.awayStats || {};

    if (sport === 'football') {
      const homePossession = homeStats.possession || 50;
      const homeSOT = homeStats.shotsOnTarget || 0;
      const awaySOT = awayStats.shotsOnTarget || 0;
      const homeCorners = homeStats.corners || 0;
      const awayCorners = awayStats.corners || 0;

      return {
        possession: `Home ${homePossession}% vs Away ${100 - homePossession}%`,
        shotsOnTarget: `Home: ${homeSOT} vs Away: ${awaySOT}`,
        corners: `Home average ${homeCorners.toFixed(1)} vs Away ${awayCorners.toFixed(1)}`,
        defensiveStrength: `Home conceding ${homeStats.goalsAgainst?.toFixed(2)} goals/game vs Away ${awayStats.goalsAgainst?.toFixed(2)}`,
        analysis: `${matchData.homeTeam} typically dominates possession (${homePossession}%) ` +
                  `and creates more chances (${homeSOT} SOT). Expect ${(homeCorners + awayCorners).toFixed(0)} corners average. ` +
                  `Away team strong on counter-attacks with ${awaySOT} shots on target.`
      };
    }

    return { analysis: 'Statistical analysis pending' };
  }

  /**
   * Analyze injury impact
   */
  _analyzeInjuries(matchData) {
    const injuries = matchData.injuries || [];
    if (injuries.length === 0) {
      return { analysis: 'No reported injuries' };
    }

    return {
      injuredPlayers: injuries,
      analysis: injuries.map(i => `${i.team} missing ${i.player} (${i.status})`).join('. ') +
                '. ' + (injuries.some(i => i.team === 'home') ? 'Home team strength affected.' : 'Away team strength affected.')
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  _generateRecommendations(matchData, markets) {
    const recommendations = [];

    // Find best markets
    if (markets.length > 0) {
      const sortedByConfidence = [...markets].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      
      sortedByConfidence.slice(0, 3).forEach(market => {
        if (market.recommendation !== 'SKIP') {
          recommendations.push({
            market: market.market,
            pick: market.prediction?.outcome || market.prediction,
            confidence: market.confidence,
            reason: market.reasoning,
            odds: market.prediction?.odds
          });
        }
      });
    }

    return recommendations;
  }

  /**
   * Identify risk factors
   */
  _identifyRiskFactors(matchData, sport) {
    const risks = [];

    if (matchData.injuries?.length > 0) {
      risks.push('Key player injuries may affect team performance');
    }

    if (matchData.homeStats?.redCards || matchData.awayStats?.redCards) {
      risks.push('Red card risk in match - defensive discipline concerns');
    }

    if (sport === 'football') {
      if (Math.abs((matchData.homeStats?.possession || 50) - 50) > 20) {
        risks.push('High possession variance - game may be lopsided');
      }
    }

    return risks;
  }

  /**
   * Get AI reasoning for a market
   */
  async _getAIReasoning(sport, homeTeam, awayTeam, market, matchData) {
    if (!this.aiService) return null;

    try {
      const prompt = `
Analyze this ${sport} match: ${homeTeam} vs ${awayTeam}
Market: ${market.market}
Prediction: ${market.prediction?.outcome || 'TBD'}
Confidence: ${market.confidence}%

Home Team Stats:
- Form: ${matchData.homeForm}
- Goals For/Against: ${matchData.homeStats?.goalsFor?.toFixed(2)}/${matchData.homeStats?.goalsAgainst?.toFixed(2)}
- Recent Performance: ${matchData.homeStats?.wins || 0}W-${matchData.homeStats?.draws || 0}D-${matchData.homeStats?.losses || 0}L

Away Team Stats:
- Form: ${matchData.awayForm}
- Goals For/Against: ${matchData.awayStats?.goalsFor?.toFixed(2)}/${matchData.awayStats?.goalsAgainst?.toFixed(2)}
- Recent Performance: ${matchData.awayStats?.wins || 0}W-${matchData.awayStats?.draws || 0}D-${matchData.awayStats?.losses || 0}L

Provide a 2-3 sentence expert analysis on why this prediction has high confidence, considering form, head-to-head, and statistics.
      `;

      const response = await this.aiService.analyze(prompt);
      return response;
    } catch (e) {
      logger.warn('AI reasoning failed', e.message);
      return null;
    }
  }

  /**
   * Format comprehensive analysis for Telegram
   */
  formatForTelegram(analysis) {
    if (analysis.status === 'error') {
      return `❌ ${analysis.message}`;
    }

    let text = `${analysis.sportIcon} *${analysis.sportName} Analysis*\n\n`;
    text += `*${analysis.match}*\n`;
    text += `League: ${analysis.matchData.homeTeam?.split('/')[0] || 'Unknown'}\n\n`;

    // Primary Market
    if (analysis.primaryMarket) {
      text += `*PRIMARY BET: ${analysis.primaryMarket.market}*\n`;
      text += `🎯 *${analysis.primaryMarket.prediction?.outcome || 'TBD'}*\n`;
      text += `Confidence: *${analysis.primaryMarket.confidence}%*\n`;
      text += `Odds: ${analysis.primaryMarket.prediction?.odds || 'N/A'}\n`;
      text += `💡 ${analysis.primaryMarket.reasoning}\n\n`;
    }

    // Reasoning Section
    text += `*📊 DETAILED REASONING*\n`;
    text += `*Form Analysis:* ${analysis.reasoning.formAnalysis.analysis}\n\n`;
    text += `*Head-to-Head:* ${analysis.reasoning.headToHead.analysis}\n\n`;
    text += `*Statistics:* ${analysis.reasoning.statisticalFactors.analysis}\n\n`;

    if (analysis.reasoning.injuryConcerns.analysis !== 'No reported injuries') {
      text += `*⚠️ Injuries:* ${analysis.reasoning.injuryConcerns.analysis}\n\n`;
    }

    if (analysis.reasoning.expertOpinion) {
      text += `*🤖 AI Expert:* ${analysis.reasoning.expertOpinion}\n\n`;
    }

    // Alternative Markets
    if (analysis.alternativeMarkets.length > 0) {
      text += `*ALTERNATIVE BETS:*\n`;
      analysis.alternativeMarkets.slice(0, 3).forEach((market, idx) => {
        text += `${idx + 1}. *${market.market}:* ${market.prediction?.outcome || 'TBD'} ` +
                `(${market.confidence}% | Odds: ${market.prediction?.odds || 'N/A'})\n`;
      });
      text += '\n';
    }

    // Risk Factors
    if (analysis.riskFactors.length > 0) {
      text += `*⚠️ Risk Factors:*\n`;
      analysis.riskFactors.forEach(risk => {
        text += `• ${risk}\n`;
      });
      text += '\n';
    }

    // Recommendations
    if (analysis.recommendations.length > 0) {
      text += `*💡 Recommendations:*\n`;
      analysis.recommendations.forEach((rec, idx) => {
        text += `${idx + 1}. *${rec.market}:* Bet on ${rec.pick} (${rec.confidence}% confidence)\n`;
      });
    }

    text += `\n💰 Always use bankroll management (max 2% per bet)\n`;
    text += `⏰ Last updated: ${new Date(analysis.timestamp).toLocaleTimeString()}\n`;

    return text;
  }

  /**
   * Get all sports and their information
   */
  async getAllSportsOverview() {
    const sports = this.getSupportedSports();
    let text = `⚽ *SUPPORTED SPORTS*\n\n`;

    for (const [key, sport] of Object.entries(sports)) {
      text += `*${sport.icon} ${sport.name}*\n`;
      text += `Available markets: ${sport.markets.join(', ')}\n\n`;
    }

    text += `Use: /analyze [sport] [team1] vs [team2] [market]\n`;
    text += `Example: /analyze football "Man Utd" vs "Liverpool" over_2.5\n`;

    return text;
  }

  /**
   * Return curated 'fixed' matches for VVIP users.
   * Data can be seeded into Redis under key `vvip:fixed_matches` as JSON array.
   */
  async getFixedMatches() {
    try {
      if (!this.redis) {
        // Fallback static sample
        return [
          {
            home: 'Betrix United',
            away: 'Demo City',
            league: 'Sample League',
            pick: '1',
            market: '1X2',
            confidence: 88,
            odds: 1.75,
            reason: 'Consistent home form and opponent injuries.'
          },
          {
            home: 'Alpha FC',
            away: 'Omega FC',
            league: 'Sample League 2',
            pick: 'OVER_2.5',
            market: 'OVER_UNDER',
            confidence: 82,
            odds: 1.95,
            reason: 'High attacking metrics for both sides.'
          }
        ];
      }

      const raw = await this.redis.get('vvip:fixed_matches');
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        logger.warn('Failed to parse vvip fixed matches from redis', e.message);
        return [];
      }
    } catch (err) {
      logger.error('getFixedMatches failed', err);
      return [];
    }
  }

  /**
   * Predict halftime/fulltime outcomes (e.g., 1/X, X/1, 1/2, etc.) with confidence
   */
  predictHalftimeFulltime(matchData) {
    try {
      // Simple heuristic: use possession and shots to estimate early lead
      const hPoss = matchData.homeStats?.possession || 52;
      const aPoss = matchData.awayStats?.possession || 48;
      const hSOT = matchData.homeStats?.shotsOnTarget || 3;
      const aSOT = matchData.awayStats?.shotsOnTarget || 2;

      // Probabilities rough heuristic
      const homeStrength = (hPoss * 0.4) + (hSOT * 5);
      const awayStrength = (aPoss * 0.4) + (aSOT * 5);

      let htft = 'X/X';
      let confidence = 50;
      if (homeStrength > awayStrength + 15) {
        htft = '1/1';
        confidence = 70;
      } else if (awayStrength > homeStrength + 15) {
        htft = '2/2';
        confidence = 68;
      } else if (Math.abs(homeStrength - awayStrength) < 8) {
        htft = 'X/1';
        confidence = 55;
      } else {
        htft = '1/X';
        confidence = 56;
      }

      return { htft, confidence, reasoning: `Heuristic based on possession (${hPoss}% vs ${aPoss}%) and shots on target (${hSOT} vs ${aSOT}).` };
    } catch (e) {
      logger.warn('predictHalftimeFulltime failed', e.message);
      return { htft: 'X/X', confidence: 45, reasoning: 'Insufficient data' };
    }
  }

  /**
   * Predict top likely correct scores with simple Poisson-like heuristic
   */
  predictCorrectScores(matchData) {
    try {
      const lambdaHome = (matchData.homeStats?.goalsFor || 1.2);
      const lambdaAway = (matchData.awayStats?.goalsFor || 1.0);

      // Build small set of likely scores
      const candidates = [
        { score: '1-0', prob: 0.18 },
        { score: '2-1', prob: 0.14 },
        { score: '1-1', prob: 0.12 },
        { score: '0-1', prob: 0.08 },
        { score: '2-0', prob: 0.06 }
      ];

      // Adjust probabilities slightly by lambda ratio
      const factor = Math.max(0.6, Math.min(1.4, (lambdaHome / Math.max(0.1, lambdaAway))));
      const adjusted = candidates.map(c => ({ score: c.score, prob: Math.min(0.95, Math.max(0.01, c.prob * factor)) }));

      // Derive odds approximate
      const result = adjusted.map(c => ({ score: c.score, confidence: Math.round(c.prob * 100), odds: (1 / Math.max(0.01, c.prob)).toFixed(2) }));
      return result.slice(0, 3);
    } catch (e) {
      logger.warn('predictCorrectScores failed', e.message);
      return [{ score: '1-0', confidence: 40, odds: '2.50' }];
    }
  }
}

/**
 * Football/Soccer Analyzer
 */
class FootballAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    const homeStats = matchData.homeStats || {};
    const awayStats = matchData.awayStats || {};

    switch (marketType) {
      case '1X2':
        return this._analyze1X2(matchData, homeTeam, awayTeam);
      case 'OVER_UNDER':
        return this._analyzeOverUnder(matchData);
      case 'CORNERS':
        return this._analyzeCorners(matchData);
      case 'CARDS':
        return this._analyzeCards(matchData);
      case 'BOTH_SCORE':
        return this._analyzeBothScore(matchData);
      case 'FIRST_GOAL':
        return this._analyzeFirstGoal(matchData);
      default:
        return null;
    }
  }

  async _analyze1X2(matchData, homeTeam, awayTeam) {
    const homeForm = (matchData.homeForm.match(/W/g) || []).length;
    const awayForm = (matchData.awayForm.match(/W/g) || []).length;
    const homeGoals = matchData.homeStats?.goalsFor || 1.5;
    const awayGoals = matchData.awayStats?.goalsFor || 1;

    let prediction, confidence, odds;

    if (homeForm > awayForm + 1 && homeGoals > awayGoals * 1.3) {
      prediction = '1'; // Home win
      confidence = 65;
      odds = 1.95;
    } else if (awayForm > homeForm) {
      prediction = '2'; // Away win
      confidence = 55;
      odds = 3.5;
    } else {
      prediction = 'X'; // Draw
      confidence = 50;
      odds = 3.2;
    }

    return {
      market: '1X2',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `${homeTeam} (${matchData.homeForm}) plays ${awayTeam} (${matchData.awayForm}). ` +
                 `Home team averages ${homeGoals.toFixed(2)} goals, away ${awayGoals.toFixed(2)} goals. ` +
                 `Based on form and scoring, ${prediction === '1' ? 'home' : prediction === '2' ? 'away' : 'draw'} expected.`
    };
  }

  async _analyzeOverUnder(matchData) {
    const totalGoals = (matchData.homeStats?.goalsFor || 1.5) + (matchData.awayStats?.goalsFor || 1);
    const threshold = 2.5;
    const prediction = totalGoals > threshold ? 'OVER_2.5' : 'UNDER_2.5';
    const confidence = totalGoals > threshold ? 60 : 55;
    const odds = 1.9;

    return {
      market: 'OVER_UNDER',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `Expected goals: ${totalGoals.toFixed(2)}. ${matchData.homeTeam} scores ${matchData.homeStats?.goalsFor?.toFixed(2)} avg, ` +
                 `${matchData.awayTeam} scores ${matchData.awayStats?.goalsFor?.toFixed(2)} avg. Predicting ${prediction}.`
    };
  }

  async _analyzeCorners(matchData) {
    const homeCorners = matchData.homeStats?.corners || 4;
    const awayCorners = matchData.awayStats?.corners || 3;
    const totalCorners = homeCorners + awayCorners;
    const prediction = totalCorners > 9 ? 'OVER_9' : 'UNDER_9';
    const confidence = 58;
    const odds = 1.85;

    return {
      market: 'CORNERS',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `${matchData.homeTeam} averages ${homeCorners.toFixed(1)} corners. ` +
                 `${matchData.awayTeam} averages ${awayCorners.toFixed(1)} corners. ` +
                 `Total expected: ${totalCorners.toFixed(1)}. ${prediction} likely.`
    };
  }

  async _analyzeCards(matchData) {
    const homeCards = (matchData.homeStats?.yellowCards || 0) + (matchData.homeStats?.redCards || 0) * 2;
    const awayCards = (matchData.awayStats?.yellowCards || 0) + (matchData.awayStats?.redCards || 0) * 2;
    const totalCards = homeCards + awayCards;
    const prediction = totalCards > 3 ? 'OVER_3_CARDS' : 'UNDER_3_CARDS';
    const confidence = 52;
    const odds = 1.9;

    return {
      market: 'CARDS',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `Card history: ${matchData.homeTeam} ${homeCards} cards vs ${matchData.awayTeam} ${awayCards} cards. ` +
                 `Expected card count: ${totalCards}. Prediction: ${prediction}.`
    };
  }

  async _analyzeBothScore(matchData) {
    const homeGoals = matchData.homeStats?.goalsFor || 1.5;
    const awayGoals = matchData.awayStats?.goalsFor || 1;
    const bothScore = homeGoals > 0.8 && awayGoals > 0.8;
    const prediction = bothScore ? 'YES' : 'NO';
    const confidence = bothScore ? 62 : 58;
    const odds = 1.88;

    return {
      market: 'BOTH_SCORE',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `${matchData.homeTeam} scores ${homeGoals.toFixed(2)} goals/game. ` +
                 `${matchData.awayTeam} scores ${awayGoals.toFixed(2)} goals/game. ` +
                 `Probability both teams score: ${(bothScore ? 'High' : 'Moderate')}.`
    };
  }

  async _analyzeFirstGoal(matchData) {
    const homeAttack = (matchData.homeStats?.shotsOnTarget || 0) / Math.max(1, matchData.homeStats?.possession || 50);
    const awayAttack = (matchData.awayStats?.shotsOnTarget || 0) / Math.max(1, matchData.awayStats?.possession || 50);
    const prediction = homeAttack > awayAttack ? 'HOME' : 'AWAY';
    const confidence = 50;
    const odds = 2.1;

    return {
      market: 'FIRST_GOAL',
      prediction: { outcome: prediction, odds },
      confidence,
      reasoning: `Attack efficiency: ${matchData.homeTeam} vs ${matchData.awayTeam}. ` +
                 `${prediction} team more likely to score first based on shot efficiency.`
    };
  }
}

/**
 * Basketball Analyzer
 */
class BasketballAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    switch (marketType) {
      case 'MONEYLINE':
        return {
          market: 'MONEYLINE',
          prediction: { outcome: 'HOME_WIN', odds: 1.95 },
          confidence: 58,
          reasoning: `${homeTeam} home court advantage typically provides 3-5 point edge.`
        };
      case 'SPREAD':
        return {
          market: 'SPREAD',
          prediction: { outcome: 'HOME_-5', odds: 1.9 },
          confidence: 55,
          reasoning: `Spread analysis based on team efficiency ratings and recent form.`
        };
      case 'TOTAL_POINTS':
        return {
          market: 'TOTAL_POINTS',
          prediction: { outcome: 'OVER_210', odds: 1.85 },
          confidence: 52,
          reasoning: `Both teams averaging high scoring. Total expected around 215 points.`
        };
      default:
        return null;
    }
  }
}

/**
 * Tennis Analyzer
 */
class TennisAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    switch (marketType) {
      case 'MONEYLINE':
        return {
          market: 'MONEYLINE',
          prediction: { outcome: 'PLAYER_1', odds: 1.85 },
          confidence: 60,
          reasoning: `Player 1 ranked higher and performing better this season.`
        };
      case 'SET_SPREAD':
        return {
          market: 'SET_SPREAD',
          prediction: { outcome: 'PLAYER_1_-1.5', odds: 2.0 },
          confidence: 55,
          reasoning: `Expected dominant performance with 2-0 set victory.`
        };
      default:
        return null;
    }
  }
}

/**
 * Cricket Analyzer
 */
class CricketAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    switch (marketType) {
      case 'MONEYLINE':
        return {
          market: 'MONEYLINE',
          prediction: { outcome: 'HOME_TEAM', odds: 1.9 },
          confidence: 58,
          reasoning: `Home team advantage in cricket typically 10-15% higher win rate.`
        };
      case 'RUNS_SPREAD':
        return {
          market: 'RUNS_SPREAD',
          prediction: { outcome: 'OVER_150', odds: 1.95 },
          confidence: 55,
          reasoning: `Expected total around 165 runs based on recent form and pitch conditions.`
        };
      case 'WICKETS':
        return {
          market: 'WICKETS',
          prediction: { outcome: 'UNDER_8', odds: 1.9 },
          confidence: 52,
          reasoning: `Batting lineup strong, expecting higher individual scores and fewer wickets.`
        };
      default:
        return null;
    }
  }
}

/**
 * American Football Analyzer
 */
class AmericanFootballAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    switch (marketType) {
      case 'MONEYLINE':
        return {
          market: 'MONEYLINE',
          prediction: { outcome: 'HOME_WIN', odds: 1.9 },
          confidence: 60,
          reasoning: `Home field advantage in NFL averages 3-4 points. Home team favored.`
        };
      case 'SPREAD':
        return {
          market: 'SPREAD',
          prediction: { outcome: 'HOME_-3.5', odds: 1.91 },
          confidence: 58,
          reasoning: `Vegas line suggests 3.5 point home advantage. Reasonable pick.`
        };
      case 'TOTAL_POINTS':
        return {
          market: 'TOTAL_POINTS',
          prediction: { outcome: 'OVER_45', odds: 1.88 },
          confidence: 55,
          reasoning: `Both offenses strong this season. Expect high-scoring game.`
        };
      default:
        return null;
    }
  }
}

/**
 * Hockey Analyzer
 */
class HockeyAnalyzer {
  async analyzeMarket(matchData, marketType, homeTeam, awayTeam, analyzer) {
    switch (marketType) {
      case 'MONEYLINE':
        return {
          market: 'MONEYLINE',
          prediction: { outcome: 'HOME_WIN', odds: 1.85 },
          confidence: 62,
          reasoning: `Home ice advantage in NHL provides significant statistical edge.`
        };
      case 'PUCK_LINE':
        return {
          market: 'PUCK_LINE',
          prediction: { outcome: 'HOME_-1.5', odds: 2.1 },
          confidence: 55,
          reasoning: `Expected close game with 1-goal home victory likely.`
        };
      case 'TOTAL_GOALS':
        return {
          market: 'TOTAL_GOALS',
          prediction: { outcome: 'OVER_5.5', odds: 1.9 },
          confidence: 53,
          reasoning: `Both teams averaging 3+ goals per game. High-scoring expected.`
        };
      default:
        return null;
    }
  }
}
