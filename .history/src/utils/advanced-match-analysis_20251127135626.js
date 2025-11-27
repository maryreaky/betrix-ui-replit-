/**
 * Advanced Match Analysis Engine
 * Comprehensive match analysis with predictions, comparisons, and betting insights
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('AdvancedMatchAnalysis');

/**
 * Analyze a match and generate detailed insights
 */
export async function analyzeMatch(match, historicalData = {}, oddsData = {}) {
  try {
    const analysis = {
      matchId: match.id || `${match.home}_${match.away}`,
      home: match.home,
      away: match.away,
      timestamp: Date.now(),
      sections: {}
    };

    // 1. Form Analysis
    analysis.sections.form = analyzeFormData(match, historicalData);

    // 2. Head-to-Head
    analysis.sections.h2h = analyzeHeadToHead(match, historicalData);

    // 3. Offensive Power
    analysis.sections.offensive = analyzeOffensivePower(match, historicalData);

    // 4. Defensive Strength
    analysis.sections.defensive = analyzeDefensiveStrength(match, historicalData);

    // 5. Injuries & Missing Players
    analysis.sections.injuries = analyzeInjuries(match);

    // 6. Odds Prediction
    analysis.sections.odds = analyzeOddsPrediction(match, oddsData);

    // 7. Value Bets
    analysis.sections.valueBets = findValueBets(analysis, oddsData);

    // 8. Final Prediction
    analysis.prediction = generateFinalPrediction(analysis);
    analysis.confidence = calculateConfidence(analysis);

    return analysis;
  } catch (err) {
    logger.error('Match analysis error', err);
    return null;
  }
}

/**
 * Analyze team form (last 5 matches)
 */
function analyzeFormData(match, historical) {
  const homeForm = historical.homeForm || [];
  const awayForm = historical.awayForm || [];

  const homePoints = homeForm.slice(0, 5).reduce((sum, result) => {
    if (result.result === 'W') return sum + 3;
    if (result.result === 'D') return sum + 1;
    return sum;
  }, 0);

  const awayPoints = awayForm.slice(0, 5).reduce((sum, result) => {
    if (result.result === 'W') return sum + 3;
    if (result.result === 'D') return sum + 1;
    return sum;
  }, 0);

  const homeWins = homeForm.slice(0, 5).filter(r => r.result === 'W').length;
  const awayWins = awayForm.slice(0, 5).filter(r => r.result === 'W').length;

  return {
    homeForm: homeForm.slice(0, 5).map(r => r.result).join(''),
    awayForm: awayForm.slice(0, 5).map(r => r.result).join(''),
    homePoints,
    awayPoints,
    homeWins,
    awayWins,
    homeAvgGoals: calculateAvgGoals(homeForm),
    awayAvgGoals: calculateAvgGoals(awayForm),
    homeBetterForm: homePoints > awayPoints,
    formAdvantage: homePoints > awayPoints ? 'Home' : 'Away'
  };
}

/**
 * Analyze head-to-head history
 */
function analyzeHeadToHead(match, historical) {
  const h2hRecords = historical.headToHead || [];
  
  const homeWins = h2hRecords.filter(r => r.winner === 'home').length;
  const awayWins = h2hRecords.filter(r => r.winner === 'away').length;
  const draws = h2hRecords.filter(r => r.winner === 'draw').length;

  const homeGoalsH2H = h2hRecords.reduce((sum, r) => sum + (r.homeGoals || 0), 0);
  const awayGoalsH2H = h2hRecords.reduce((sum, r) => sum + (r.awayGoals || 0), 0);

  return {
    homeWins,
    awayWins,
    draws,
    totalMatches: homeWins + awayWins + draws,
    homeAvgGoals: homeWins + awayWins + draws > 0 ? (homeGoalsH2H / (homeWins + awayWins + draws)).toFixed(2) : 0,
    awayAvgGoals: homeWins + awayWins + draws > 0 ? (awayGoalsH2H / (homeWins + awayWins + draws)).toFixed(2) : 0,
    dominantTeam: homeWins > awayWins ? 'Home' : (awayWins > homeWins ? 'Away' : 'Balanced'),
    prediction: homeWins > awayWins ? 'Home Advantage' : (awayWins > homeWins ? 'Away Form Better' : 'Even Match')
  };
}

/**
 * Analyze offensive power
 */
function analyzeOffensivePower(match, historical) {
  const homeStats = historical.homeStats || {};
  const awayStats = historical.awayStats || {};

  const homeGoalsPerGame = homeStats.goalsFor / (homeStats.gamesPlayed || 1);
  const awayGoalsPerGame = awayStats.goalsFor / (awayStats.gamesPlayed || 1);
  const homeGoalsAllowed = homeStats.goalsAgainst / (homeStats.gamesPlayed || 1);
  const awayGoalsAllowed = awayStats.goalsAgainst / (awayStats.gamesPlayed || 1);

  return {
    homeGoalsPerGame: homeGoalsPerGame.toFixed(2),
    awayGoalsPerGame: awayGoalsPerGame.toFixed(2),
    homeGoalsAllowed: homeGoalsAllowed.toFixed(2),
    awayGoalsAllowed: awayGoalsAllowed.toFixed(2),
    homeOffensiveStrength: homeGoalsPerGame > awayGoalsAllowed ? 'Strong' : 'Weak',
    awayOffensiveStrength: awayGoalsPerGame > homeGoalsAllowed ? 'Strong' : 'Weak',
    expectedGoals: {
      home: (homeGoalsPerGame - (awayGoalsAllowed / 2)).toFixed(2),
      away: (awayGoalsPerGame - (homeGoalsAllowed / 2)).toFixed(2)
    }
  };
}

/**
 * Analyze defensive strength
 */
function analyzeDefensiveStrength(match, historical) {
  const homeStats = historical.homeStats || {};
  const awayStats = historical.awayStats || {};

  const homeDefense = homeStats.goalsAgainst || 0;
  const awayDefense = awayStats.goalsAgainst || 0;

  return {
    homeGoalsAllowedTotal: homeDefense,
    awayGoalsAllowedTotal: awayDefense,
    homeDefensiveRating: homeDefense < 30 ? 'Excellent' : (homeDefense < 40 ? 'Good' : 'Poor'),
    awayDefensiveRating: awayDefense < 30 ? 'Excellent' : (awayDefense < 40 ? 'Good' : 'Poor'),
    homeCleanSheets: homeStats.cleanSheets || 0,
    awayCleanSheets: awayStats.cleanSheets || 0,
    strongerDefense: homeDefense < awayDefense ? 'Home' : (awayDefense < homeDefense ? 'Away' : 'Balanced')
  };
}

/**
 * Check for key injuries
 */
function analyzeInjuries(match) {
  const homeInjuries = match.homeInjuries || [];
  const awayInjuries = match.awayInjuries || [];

  const keyPositions = ['GK', 'CB', 'ST', 'CM'];
  const homeKeyInjuries = homeInjuries.filter(i => keyPositions.includes(i.position));
  const awayKeyInjuries = awayInjuries.filter(i => keyPositions.includes(i.position));

  return {
    homeInjuries: homeInjuries.length,
    awayInjuries: awayInjuries.length,
    homeKeyInjuries: homeKeyInjuries.length,
    awayKeyInjuries: awayKeyInjuries.length,
    homeImpact: homeKeyInjuries.length > 2 ? 'High' : (homeKeyInjuries.length > 0 ? 'Medium' : 'Low'),
    awayImpact: awayKeyInjuries.length > 2 ? 'High' : (awayKeyInjuries.length > 0 ? 'Medium' : 'Low'),
    missingPlayers: {
      home: homeKeyInjuries.map(i => i.name),
      away: awayKeyInjuries.map(i => i.name)
    }
  };
}

/**
 * Predict match outcome based on odds
 */
function analyzeOddsPrediction(match, oddsData) {
  if (!oddsData.homeOdds) {
    return { prediction: 'No odds available', implied: {} };
  }

  const homeImplied = (1 / (oddsData.homeOdds || 2)).toFixed(3);
  const drawImplied = (1 / (oddsData.drawOdds || 3.5)).toFixed(3);
  const awayImplied = (1 / (oddsData.awayOdds || 3)).toFixed(3);

  const total = parseFloat(homeImplied) + parseFloat(drawImplied) + parseFloat(awayImplied);
  const homeProb = (parseFloat(homeImplied) / total * 100).toFixed(1);
  const drawProb = (parseFloat(drawImplied) / total * 100).toFixed(1);
  const awayProb = (parseFloat(awayImplied) / total * 100).toFixed(1);

  let prediction = 'Draw';
  if (homeProb > drawProb && homeProb > awayProb) prediction = `${match.home} Win`;
  if (awayProb > homeProb && awayProb > drawProb) prediction = `${match.away} Win`;

  return {
    prediction,
    implied: {
      home: homeProb,
      draw: drawProb,
      away: awayProb
    },
    marketFavorite: Math.max(homeProb, drawProb, awayProb) === homeProb ? 'Home' : 
                    (Math.max(homeProb, drawProb, awayProb) === awayProb ? 'Away' : 'Draw'),
    confidence: Math.max(homeProb, drawProb, awayProb)
  };
}

/**
 * Find value betting opportunities
 */
function findValueBets(analysis, oddsData) {
  const valueBets = [];

  // Over/Under analysis
  if (analysis.sections.offensive && analysis.sections.offensive.expectedGoals) {
    const expectedTotal = 
      parseFloat(analysis.sections.offensive.expectedGoals.home) +
      parseFloat(analysis.sections.offensive.expectedGoals.away);

    if (expectedTotal > 2.5 && oddsData.over2_5 < 1.85) {
      valueBets.push({
        option: 'Over 2.5 Goals',
        expected: expectedTotal.toFixed(1),
        odds: oddsData.over2_5,
        confidence: 'Medium',
        roi: ((1 / oddsData.over2_5) - 1).toFixed(2)
      });
    }
  }

  // Both teams to score
  const homeExpected = analysis.sections.offensive?.expectedGoals?.home;
  const awayExpected = analysis.sections.offensive?.expectedGoals?.away;
  if (homeExpected > 0.8 && awayExpected > 0.8 && oddsData.btts < 1.70) {
    valueBets.push({
      option: 'Both Teams to Score',
      confidence: 'High',
      odds: oddsData.btts,
      roi: ((1 / oddsData.btts) - 1).toFixed(2)
    });
  }

  return valueBets;
}

/**
 * Generate final prediction based on all analysis
 */
function generateFinalPrediction(analysis) {
  const form = analysis.sections.form;
  const h2h = analysis.sections.h2h;
  const offensive = analysis.sections.offensive;
  const defensive = analysis.sections.defensive;

  let score = 0;
  let maxScore = 0;

  // Form (20%)
  if (form.homePoints > form.awayPoints) score += 2;
  else if (form.awayPoints > form.homePoints) score -= 2;
  maxScore += 2;

  // H2H (20%)
  if (h2h.homeWins > h2h.awayWins) score += 2;
  else if (h2h.awayWins > h2h.homeWins) score -= 2;
  maxScore += 2;

  // Offensive Power (20%)
  if (offensive.homeOffensiveStrength === 'Strong' && offensive.awayOffensiveStrength !== 'Strong') score += 1;
  if (offensive.awayOffensiveStrength === 'Strong' && offensive.homeOffensiveStrength !== 'Strong') score -= 1;
  maxScore += 1;

  // Defensive Strength (20%)
  if (defensive.strongerDefense === 'Home') score += 1;
  else if (defensive.strongerDefense === 'Away') score -= 1;
  maxScore += 1;

  // Odds (20%)
  const marketHome = analysis.sections.odds?.implied?.home || 50;
  if (marketHome > 50) score += 1;
  else if (marketHome < 50) score -= 1;
  maxScore += 1;

  // Generate prediction
  const percentage = ((score + maxScore) / (2 * maxScore)) * 100;
  
  if (percentage > 65) return `${analysis.home} to Win`;
  if (percentage > 55) return `${analysis.home} Likely`;
  if (percentage > 45) return 'Draw or ${analysis.home}';
  if (percentage > 35) return `${analysis.away} Likely`;
  if (percentage >= 20) return `${analysis.away} to Win`;
  return 'Uncertain';
}

/**
 * Calculate overall confidence level
 */
function calculateConfidence(analysis) {
  let confidence = 50;

  // Check data completeness
  const dataPoints = Object.keys(analysis.sections).length;
  confidence += Math.min(dataPoints * 5, 20);

  // Form consistency (higher = more confident)
  const form = analysis.sections.form;
  const formPattern = form.homeForm || '';
  const consecutiveWins = (formPattern.match(/W+/) || [''])[0].length;
  confidence += Math.min(consecutiveWins * 3, 10);

  // H2H clarity (historical dominance = more confident)
  const h2h = analysis.sections.h2h;
  if (h2h.totalMatches > 5) {
    const winDifference = Math.abs(h2h.homeWins - h2h.awayWins);
    confidence += Math.min(winDifference * 2, 10);
  }

  return Math.min(confidence, 95);
}

/**
 * Calculate average goals
 */
function calculateAvgGoals(matches) {
  if (!matches || matches.length === 0) return 0;
  const totalGoals = matches.reduce((sum, m) => sum + (m.goals || 0), 0);
  return (totalGoals / matches.length).toFixed(2);
}

export default {
  analyzeMatch,
  analyzeFormData,
  analyzeHeadToHead,
  analyzeOffensivePower,
  analyzeDefensiveStrength,
  analyzeInjuries,
  analyzeOddsPrediction,
  findValueBets,
  generateFinalPrediction,
  calculateConfidence
};
