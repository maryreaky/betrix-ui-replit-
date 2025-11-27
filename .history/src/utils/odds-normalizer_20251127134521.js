/**
 * Odds Normalization Utility
 * Converts various odds formats to standard decimal format
 * Provides odds comparison and arbitrage detection
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('OddsNormalizer');

// Standard odds formats
export const OddsFormat = {
  DECIMAL: 'decimal',      // 1.5, 2.0, 3.5
  FRACTIONAL: 'fractional', // 1/2, 3/2, 5/2
  AMERICAN: 'american',     // +100, -150, +250
  IMPLIED: 'implied'        // 66.7% (as 0.667)
};

/**
 * Detect odds format automatically
 */
export function detectOddsFormat(odds) {
  const str = String(odds).trim();

  // American format (+ or - followed by numbers)
  if (str.match(/^[+-]\d+$/)) return OddsFormat.AMERICAN;

  // Fractional format (numerator/denominator or numerator-denominator)
  if (str.match(/^\d+[/-]\d+$/)) return OddsFormat.FRACTIONAL;

  // Implied probability (0.xxx or x%)
  if (str.match(/^0\.\d+$/) || str.match(/^\d+%$/)) return OddsFormat.IMPLIED;

  // Decimal format (default)
  if (str.match(/^\d+\.?\d*$/)) return OddsFormat.DECIMAL;

  return null;
}

/**
 * Convert American odds to decimal
 * +100 = 2.0, -100 = 1.0, +150 = 2.5, -150 = 1.667
 */
export function americanToDecimal(american) {
  const val = Number(american);
  
  if (val > 0) {
    return (val / 100) + 1;
  } else {
    return 1 + (100 / Math.abs(val));
  }
}

/**
 * Convert fractional odds to decimal
 * 1/2 = 1.5, 3/2 = 2.5, 5/1 = 6.0
 */
export function fractionalToDecimal(fractional) {
  const str = String(fractional).trim();
  const match = str.match(/(\d+)[/-](\d+)/);
  
  if (!match) return null;
  
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  
  return (numerator / denominator) + 1;
}

/**
 * Convert implied probability to decimal odds
 * 0.5 (50%) = 2.0, 0.25 (25%) = 4.0
 */
export function impliedToDecimal(implied) {
  const prob = typeof implied === 'string' && implied.endsWith('%')
    ? Number(implied.replace('%', '')) / 100
    : Number(implied);

  if (prob <= 0 || prob > 1) return null;
  
  return 1 / prob;
}

/**
 * Normalize any odds format to decimal
 */
export function normalizeToDecimal(odds, format = null) {
  if (typeof odds === 'number' && odds > 1) {
    return odds; // Already in decimal format
  }

  const detectedFormat = format || detectOddsFormat(odds);

  switch (detectedFormat) {
    case OddsFormat.AMERICAN:
      return americanToDecimal(odds);
    case OddsFormat.FRACTIONAL:
      return fractionalToDecimal(odds);
    case OddsFormat.IMPLIED:
      return impliedToDecimal(odds);
    case OddsFormat.DECIMAL:
      return Number(odds);
    default:
      logger.warn(`Unknown odds format: ${odds}`);
      return null;
  }
}

/**
 * Convert decimal odds to implied probability (0-1)
 */
export function decimalToImplied(decimal) {
  const val = Number(decimal);
  if (val <= 1) return null;
  return 1 / val;
}

/**
 * Convert decimal odds to American format
 */
export function decimalToAmerican(decimal) {
  const val = Number(decimal);
  if (val < 1) return null;
  
  if (val >= 2) {
    return Math.round((val - 1) * 100);
  } else {
    return Math.round(-100 / (val - 1));
  }
}

/**
 * Compare odds from multiple sources
 * Returns: { best: { bookmaker, odds }, worst: { bookmaker, odds }, avg: 0.0 }
 */
export function compareOdds(oddsArray) {
  if (!oddsArray || oddsArray.length === 0) {
    return { best: null, worst: null, avg: null };
  }

  const normalized = oddsArray
    .map(o => ({
      ...o,
      decimalOdds: normalizeToDecimal(o.odds || o.value)
    }))
    .filter(o => o.decimalOdds && o.decimalOdds > 1);

  if (normalized.length === 0) {
    return { best: null, worst: null, avg: null };
  }

  // Find best (highest) and worst (lowest)
  const sorted = normalized.sort((a, b) => a.decimalOdds - b.decimalOdds);
  
  const avg = normalized.reduce((sum, o) => sum + o.decimalOdds, 0) / normalized.length;

  return {
    best: {
      bookmaker: sorted[sorted.length - 1].bookmaker || sorted[sorted.length - 1].source,
      odds: sorted[sorted.length - 1].decimalOdds.toFixed(2)
    },
    worst: {
      bookmaker: sorted[0].bookmaker || sorted[0].source,
      odds: sorted[0].decimalOdds.toFixed(2)
    },
    avg: avg.toFixed(2),
    all: normalized
  };
}

/**
 * Detect arbitrage opportunities (bookmaker arbitrage)
 * Returns true if sum of implied probabilities < 1.0
 */
export function detectArbitrage(oddsArray) {
  if (!oddsArray || oddsArray.length < 2) return null;

  const normalized = oddsArray
    .map(o => normalizeToDecimal(o.odds || o.value))
    .filter(o => o && o > 1);

  if (normalized.length === 0) return null;

  // Sum of implied probabilities
  const sumImplied = normalized.reduce((sum, odds) => sum + decimalToImplied(odds), 0);

  if (sumImplied < 1.0) {
    const arbitrageMargin = ((1 - sumImplied) * 100).toFixed(2);
    return {
      detected: true,
      margin: arbitrageMargin,
      message: `✅ Arbitrage opportunity: ${arbitrageMargin}% margin`
    };
  }

  return {
    detected: false,
    margin: 0,
    message: '⚠️ No arbitrage opportunity'
  };
}

/**
 * Calculate implied probability percentage
 */
export function getImpliedProbability(decimal) {
  const val = Number(decimal);
  if (val <= 1) return null;
  
  const prob = (1 / val) * 100;
  return prob.toFixed(1) + '%';
}

/**
 * Format odds for display
 */
export function formatOdds(odds, format = OddsFormat.DECIMAL, precision = 2) {
  const decimal = normalizeToDecimal(odds);
  if (!decimal) return 'N/A';

  switch (format) {
    case OddsFormat.AMERICAN:
      return decimalToAmerican(decimal);
    case OddsFormat.IMPLIED:
      return getImpliedProbability(decimal);
    case OddsFormat.FRACTIONAL: {
      // Simple approximation back to fractional
      const val = decimal - 1;
      return `${val.toFixed(2)}/1`;
    }
    case OddsFormat.DECIMAL:
    default:
      return decimal.toFixed(precision);
  }
}

/**
 * Display odds comparison in Telegram format
 */
export function formatOddsComparison(comparisonResult) {
  if (!comparisonResult) return 'No odds available';

  let text = '📊 *Odds Comparison*\n\n';
  
  if (comparisonResult.best) {
    text += `✅ *Best:* ${comparisonResult.best.bookmaker} @ ${comparisonResult.best.odds}\n`;
  }
  
  if (comparisonResult.worst) {
    text += `⚠️ *Worst:* ${comparisonResult.worst.bookmaker} @ ${comparisonResult.worst.odds}\n`;
  }
  
  if (comparisonResult.avg) {
    text += `📈 *Average:* ${comparisonResult.avg}\n\n`;
  }

  // Show all odds
  if (comparisonResult.all && comparisonResult.all.length > 0) {
    text += '*All Bookmakers:*\n';
    comparisonResult.all.forEach(odd => {
      const bookie = odd.bookmaker || odd.source || 'Unknown';
      text += `• ${bookie}: ${odd.decimalOdds.toFixed(2)}\n`;
    });
  }

  return text;
}

export default {
  // Enums
  OddsFormat,
  
  // Detection
  detectOddsFormat,
  
  // Conversion functions
  americanToDecimal,
  fractionalToDecimal,
  impliedToDecimal,
  normalizeToDecimal,
  decimalToImplied,
  decimalToAmerican,
  
  // Analysis
  compareOdds,
  detectArbitrage,
  getImpliedProbability,
  
  // Formatting
  formatOdds,
  formatOddsComparison
};
