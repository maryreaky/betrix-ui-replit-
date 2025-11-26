/**
 * BETRIX Data Models & State Machine
 * Redis schema, user states, payment states, AI cache, and utilities
 */

import logger from '../utils/logger.js';

// ============================================================================
// USER PROFILE MODEL
// ============================================================================

export const UserProfileSchema = {
  // Identity
  user_id: 'telegram_user_id',
  name: 'string (full name)',
  country: 'string (KE, UG, TZ, etc)',
  age: 'number (18-120)',
  phone: 'string (for M-Pesa)',
  email: 'string',

  // Account status
  signup_paid: 'boolean (true/false)',
  signup_date: 'timestamp',
  created_at: 'timestamp',
  last_active: 'timestamp',

  // VVIP subscription
  vvip_tier: 'string (inactive, daily, weekly, monthly)',
  vvip_expiry: 'timestamp',
  vvip_auto_renew: 'boolean',

  // Preferences
  preferred_site: 'string (betika, sportpesa, etc)',
  favorite_leagues: 'array of league codes',
  preferred_currency: 'string (KES, USD)',
  timezone: 'string (Africa/Nairobi)',
  notifications_enabled: 'boolean',

  // Betting stats
  total_bets_placed: 'number',
  win_rate: 'number (percentage)',
  total_won: 'number (KES)',
  total_stake: 'number (KES)',

  // Referral
  referral_code: 'string',
  referral_count: 'number',
  referral_earnings: 'number'
};

/**
 * Initialize a new user in Redis
 */
export async function createUserProfile(redis, userId, profileData) {
  const profile = {
    user_id: userId,
    name: profileData.name || '',
    country: profileData.country || 'KE',
    age: profileData.age || 0,
    phone: profileData.phone || '',
    email: profileData.email || '',
    signup_paid: profileData.signup_paid || false,
    signup_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    vvip_tier: 'inactive',
    vvip_expiry: '',
    preferred_site: 'betika',
    favorite_leagues: '',
    total_bets_placed: 0,
    win_rate: 0,
    total_won: 0,
    total_stake: 0,
    referral_code: generateReferralCode(userId),
    referral_count: 0,
    referral_earnings: 0
  };

  await redis.hset(`user:${userId}`, profile);
  logger.info('User profile created', { userId, name: profile.name });
  return profile;
}

/**
 * Get user profile from Redis
 */
export async function getUserProfile(redis, userId) {
  const profile = await redis.hgetall(`user:${userId}`);
  return Object.keys(profile).length > 0 ? profile : null;
}

/**
 * Update user profile field
 */
export async function updateUserProfile(redis, userId, field, value) {
  await redis.hset(`user:${userId}`, field, value);
  await redis.hset(`user:${userId}`, 'last_active', new Date().toISOString());
}

// ============================================================================
// PAYMENT LEDGER MODEL
// ============================================================================

export const PaymentLedgerSchema = {
  // Identifiers
  payment_id: 'string (auto-generated UUID)',
  order_id: 'string (ORD<timestamp>)',
  user_id: 'string (telegram_user_id)',
  reference: 'string (provider reference)',

  // Payment details
  amount: 'number (KES or USD)',
  currency: 'string (KES, USD)',
  method: 'string (mpesa, paypal, binance, card)',
  purpose: 'string (signup_fee, vvip_daily, vvip_weekly, vvip_monthly)',

  // Status tracking
  status: 'string (pending, confirmed, failed, refunded)',
  created_at: 'timestamp',
  confirmed_at: 'timestamp',
  expires_at: 'timestamp (for pending payments)',

  // Webhook & verification
  webhook_received: 'boolean',
  webhook_verified: 'boolean',
  provider_status: 'string (from provider)',
  metadata: 'json (custom provider data)'
};

/**
 * Create a payment record
 */
export async function createPaymentRecord(redis, paymentData) {
  const paymentId = `PAY${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const orderId = `ORD${Date.now()}`;

  const record = {
    payment_id: paymentId,
    order_id: orderId,
    user_id: paymentData.user_id,
    amount: paymentData.amount,
    currency: paymentData.currency || 'KES',
    method: paymentData.method,
    purpose: paymentData.purpose || 'signup_fee',
    status: 'pending',
    created_at: new Date().toISOString(),
    confirmed_at: '',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    webhook_received: false,
    webhook_verified: false,
    provider_status: '',
    metadata: JSON.stringify(paymentData.metadata || {})
  };

  // Store in two places: by payment_id and by order_id
  await redis.hset(`payment:${paymentId}`, record);
  await redis.hset(`order:${orderId}`, record);

  // Add to user's payment list
  await redis.rpush(`user:${paymentData.user_id}:payments`, paymentId);

  logger.info('Payment record created', { paymentId, orderId, user_id: paymentData.user_id });
  return record;
}

/**
 * Get payment by order ID
 */
export async function getPaymentByOrderId(redis, orderId) {
  return await redis.hgetall(`order:${orderId}`);
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(redis, paymentId, status, providerStatus = '') {
  await redis.hset(`payment:${paymentId}`, 'status', status);
  if (providerStatus) {
    await redis.hset(`payment:${paymentId}`, 'provider_status', providerStatus);
  }
  if (status === 'confirmed') {
    await redis.hset(`payment:${paymentId}`, 'confirmed_at', new Date().toISOString());
  }
}

// ============================================================================
// AI OUTPUT CACHE MODEL
// ============================================================================

export const AIOutputSchema = {
  query_id: 'string (auto-generated)',
  user_id: 'string',
  query: 'string (original user input)',
  fixture_id: 'string (if match analysis)',
  prediction: 'string (Pick/outcome)',
  confidence: 'number (0-100%)',
  narrative: 'string (explanation)',
  risk_flags: 'array (warnings)',
  provider: 'string (azure_openai, gemini, huggingface)',
  model_used: 'string (specific model name)',
  timestamp: 'timestamp',
  accuracy_verified: 'boolean (post-match))',
  was_correct: 'boolean (post-match)'
};

/**
 * Cache AI output for analytics and learning
 */
export async function cacheAIOutput(redis, userId, output) {
  const queryId = `AI${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

  const cached = {
    query_id: queryId,
    user_id: userId,
    query: output.query,
    fixture_id: output.fixture_id || '',
    prediction: output.prediction,
    confidence: output.confidence,
    narrative: output.narrative,
    risk_flags: JSON.stringify(output.risk_flags || []),
    provider: output.provider || 'unknown',
    model_used: output.model_used || 'unknown',
    timestamp: new Date().toISOString(),
    accuracy_verified: false,
    was_correct: false
  };

  // Store by query ID and add to user's AI history
  await redis.hset(`ai_output:${queryId}`, cached);
  await redis.rpush(`user:${userId}:ai_outputs`, queryId);

  // Keep last 100 outputs in cache for each user
  const count = await redis.llen(`user:${userId}:ai_outputs`);
  if (count > 100) {
    const oldId = await redis.lpop(`user:${userId}:ai_outputs`);
    await redis.del(`ai_output:${oldId}`);
  }

  return cached;
}

// ============================================================================
// SESSION & STATE MACHINE
// ============================================================================

export const StateTypes = {
  IDLE: 'idle',
  SIGNUP_NAME: 'signup_name',
  SIGNUP_COUNTRY: 'signup_country',
  SIGNUP_AGE: 'signup_age',
  PAYMENT_PENDING: 'payment_pending',
  BETTING_SLIP_ACTIVE: 'betting_slip_active',
  ANALYZING: 'analyzing',
  BROWSING_ODDS: 'browsing_odds'
};

/**
 * Get user's current state
 */
export async function getUserState(redis, userId) {
  const state = await redis.get(`user:${userId}:state`);
  return state || StateTypes.IDLE;
}

/**
 * Set user's current state
 */
export async function setUserState(redis, userId, state, ttl = 3600) {
  await redis.setex(`user:${userId}:state`, ttl, state);
}

/**
 * Get state data (e.g., partial signup form)
 */
export async function getStateData(redis, userId) {
  const data = await redis.hgetall(`user:${userId}:state_data`);
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Set state data
 */
export async function setStateData(redis, userId, data, ttl = 3600) {
  await redis.del(`user:${userId}:state_data`);
  await redis.hset(`user:${userId}:state_data`, data);
  await redis.expire(`user:${userId}:state_data`, ttl);
}

// ============================================================================
// ODDS CACHE MODEL
// ============================================================================

export const OddsCacheSchema = {
  fixture_id: 'string (from provider)',
  home_team: 'string',
  away_team: 'string',
  kickoff: 'timestamp',
  league: 'string',
  odds_home: 'number',
  odds_draw: 'number',
  odds_away: 'number',
  source: 'string (provider name)',
  updated_at: 'timestamp',
  expires_at: 'timestamp'
};

/**
 * Cache fixture odds for fast retrieval
 */
export async function cacheFixtureOdds(redis, fixtureId, odds) {
  const cached = {
    fixture_id: fixtureId,
    home_team: odds.home_team,
    away_team: odds.away_team,
    kickoff: odds.kickoff,
    league: odds.league || 'Unknown',
    odds_home: odds.odds_home,
    odds_draw: odds.odds_draw,
    odds_away: odds.odds_away,
    source: odds.source || 'aggregated',
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour TTL
  };

  await redis.hset(`odds:${fixtureId}`, cached);
  await redis.expire(`odds:${fixtureId}`, 3600);
  return cached;
}

/**
 * Get cached fixture odds
 */
export async function getCachedFixtureOdds(redis, fixtureId) {
  return await redis.hgetall(`odds:${fixtureId}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique referral code
 */
function generateReferralCode(userId) {
  const code = `BX${userId}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  return code;
}

/**
 * Format currency display
 */
export function formatCurrency(amount, currency = 'KES') {
  if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  }
  return `${Math.round(amount)} KES`;
}

/**
 * Calculate VVIP expiry date
 */
export function calculateVVIPExpiry(tier) {
  const now = new Date();
  let expiryDate;

  switch (tier) {
    case 'daily':
      expiryDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return null;
  }

  return expiryDate.toISOString();
}

export default {
  UserProfileSchema,
  PaymentLedgerSchema,
  AIOutputSchema,
  StateTypes,
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  createPaymentRecord,
  getPaymentByOrderId,
  updatePaymentStatus,
  cacheAIOutput,
  getUserState,
  setUserState,
  getStateData,
  setStateData,
  cacheFixtureOdds,
  getCachedFixtureOdds,
  formatCurrency,
  calculateVVIPExpiry
};
