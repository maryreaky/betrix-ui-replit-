/**
 * Payment Handler - Manages subscriptions and tier upgrades
 * Integrates with Telegram Stars and external payment providers
 */

import { Logger } from '../utils/logger.js';

const logger = new Logger('PaymentHandler');

// Subscription tiers and pricing (in KES)
export const TIERS = {
  SIGNUP: {
    name: 'Signup Fee',
    symbol: '📝',
    price: 150, // KES, ~1 USD
    billingPeriod: 'one-time',
    features: [
      'Access to analyze feature',
      'Core betting tools',
      'Basic live scores',
      'Community access'
    ]
  },
  FREE: {
    name: 'Free',
    symbol: '⭐',
    price: 0,
    billingPeriod: 'forever',
    features: [
      'Basic live scores',
      'News feed',
      'Limited AI analysis (10/day)',
      'Community access'
    ]
  },
  PRO: {
    name: 'Pro',
    symbol: '📊',
    price: 899,
    billingPeriod: 'month',
    features: [
      'All FREE features',
      'Unlimited AI analysis',
      'Real-time odds updates',
      'Basic predictions',
      'No ads'
    ]
  },
  VVIP: {
    name: 'VVIP',
    symbol: '👑',
    price: 2699,
    billingPeriod: 'month',
    features: [
      'All PRO features',
      'Advanced predictions (85%+ accuracy)',
      'Arbitrage alerts',
      'Historical analytics',
      'Custom notifications',
      'Priority support'
    ]
  },
  PLUS: {
    name: 'BETRIX Plus',
    symbol: '💎',
    price: 8999,
    billingPeriod: 'month',
    features: [
      'All VVIP features',
      'All sports covered',
      'Premium API access',
      'Team/player analysis',
      'Injury reports',
      'White-label option',
      'Dedicated account manager'
    ]
  }
};

/**
 * Create Telegram Stars payment
 */
export async function createTelegramPayment(redis, userId, tier, totalPrice) {
  try {
    const paymentId = `${userId}_${Date.now()}`;
    const payload = {
      userId,
      tier,
      amount: totalPrice,
      currency: 'XTR', // Telegram Stars
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Store payment in Redis with 24h TTL
    await redis.setex(
      `payment:${paymentId}`,
      86400,
      JSON.stringify(payload)
    );

    logger.info('Payment created', { paymentId, userId, tier });
    
    return {
      paymentId,
      ...payload
    };
  } catch (err) {
    logger.error('Payment creation failed', err);
    throw err;
  }
}

/**
 * Verify and process payment completion
 */
export async function processPayment(redis, paymentId, transactionId) {
  try {
    const payment = await redis.get(`payment:${paymentId}`);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const paymentData = JSON.parse(payment);
    
    // Update user tier
    const userKey = `user:${paymentData.userId}`;
    await redis.hset(userKey, 'tier', paymentData.tier);
    await redis.hset(userKey, 'subscriptionExpiry', 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Store transaction
    await redis.setex(
      `transaction:${transactionId}`,
      30 * 24 * 60 * 60,
      JSON.stringify({
        paymentId,
        tier: paymentData.tier,
        amount: paymentData.amount,
        status: 'completed',
        completedAt: new Date().toISOString()
      })
    );

    // Update payment status
    paymentData.status = 'completed';
    paymentData.transactionId = transactionId;
    await redis.setex(`payment:${paymentId}`, 86400, JSON.stringify(paymentData));

    logger.info('Payment processed', { paymentId, userId: paymentData.userId, tier: paymentData.tier });

    return {
      success: true,
      tier: paymentData.tier,
      message: `Welcome to BETRIX ${TIERS[paymentData.tier].name}! 👑`
    };
  } catch (err) {
    logger.error('Payment processing failed', err);
    throw err;
  }
}

/**
 * Get user's current subscription
 */
export async function getUserSubscription(redis, userId) {
  try {
    let user = null;
    
    // Try to get as hash first (correct storage type)
    try {
      user = await redis.hgetall(`user:${userId}`);
    } catch (e) {
      // If it's stored as wrong type, try to get and parse
      if (e.message && e.message.includes('WRONGTYPE')) {
        try {
          // Delete the malformed key and start fresh
          await redis.del(`user:${userId}`);
          user = null;
        } catch (delErr) {
          logger.warn('Failed to clean up malformed user key', delErr);
          user = null;
        }
      } else {
        throw e;
      }
    }

    if (!user || Object.keys(user).length === 0 || !user.tier) {
      return {
        tier: 'FREE',
        symbol: TIERS.FREE.symbol,
        features: TIERS.FREE.features,
        expiresAt: null
      };
    }

    const expiry = user.subscriptionExpiry || null;
    const isExpired = expiry && new Date(expiry) < new Date();

    const tier = isExpired ? 'FREE' : user.tier;

    return {
      tier,
      symbol: TIERS[tier].symbol,
      features: TIERS[tier].features,
      expiresAt: isExpired ? null : expiry,
      isExpired
    };
  } catch (err) {
    logger.warn('Failed to get subscription', err);
    return {
      tier: 'FREE',
      symbol: TIERS.FREE.symbol,
      features: TIERS.FREE.features,
      expiresAt: null
    };
  }
}

/**
 * Check if user can access a premium feature
 */
export async function canAccessFeature(redis, userId, feature) {
  try {
    const subscription = await getUserSubscription(redis, userId);
    
    // Premium features require at least PRO tier
    const premiumFeatures = [
      'unlimited_analysis',
      'advanced_predictions',
      'arbitrage_alerts',
      'custom_notifications'
    ];

    if (premiumFeatures.includes(feature)) {
      return subscription.tier !== 'FREE';
    }

    return true;
  } catch (err) {
    logger.warn('Feature access check failed', err);
    return false; // deny on error
  }
}

/**
 * Apply referral reward
 */
export async function applyReferralReward(redis, referrerId, referralCode) {
  try {
    if (!referralCode || !referralCode.includes(referrerId)) {
      return { success: false };
    }

    // Award 50 bonus points
    await redis.hincrby(`user:${referrerId}`, 'bonusPoints', 50);
    await redis.hincrby(`user:${referrerId}`, 'referralCount', 1);

    // Check for free upgrade (5 referrals = 30 days free Pro)
    const refs = await redis.hget(`user:${referrerId}`, 'referralCount');
    if (parseInt(refs) >= 5) {
      await redis.hset(`user:${referrerId}`, 'tier', 'PRO');
      await redis.hset(`user:${referrerId}`, 'subscriptionExpiry',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      );
      return { success: true, bonus: 'free_pro_30days' };
    }

    return { success: true, bonus: 50 };
  } catch (err) {
    logger.error('Referral reward failed', err);
    return { success: false };
  }
}

/**
 * Generate payment button markup
 */
export function getPaymentMarkup(userId, tier) {
  const tierData = TIERS[tier];
  
  return {
    inline_keyboard: [
      [
        {
          text: `💳 Pay ${tierData.price === 0 ? 'Free' : '$' + tierData.price.toFixed(2)}`,
          callback_data: `pay_${tier}_${userId}`
        }
      ],
      [
        {
          text: '❓ Learn More',
          callback_data: `learn_${tier}`
        },
        {
          text: '🔙 Back',
          callback_data: 'menu_vvip'
        }
      ]
    ]
  };
}

/**
 * Format subscription details
 */
export function formatSubscriptionDetails(subscription) {
  const tier = subscription.tier;
  const tierData = TIERS[tier];

  let text = `*${tierData.symbol} ${tierData.name} Subscription*\n\n`;
  
  text += '*Features:*\n';
  tierData.features.forEach(f => {
    text += `✓ ${f}\n`;
  });

  if (subscription.expiresAt) {
    text += `\n*Expires:* ${new Date(subscription.expiresAt).toLocaleDateString()}`;
  }

  return text;
}

export default {
  TIERS,
  createTelegramPayment,
  processPayment,
  getUserSubscription,
  canAccessFeature,
  applyReferralReward,
  getPaymentMarkup,
  formatSubscriptionDetails
};

// Compatibility wrapper used by handlers expecting a single entrypoint
export async function handlePaymentFlow(redis, userId, action, payload = {}) {
  try {
    if (action === 'create') {
      return await createTelegramPayment(redis, userId, payload.tier || 'SIGNUP', payload.totalPrice || 0);
    }
    if (action === 'process') {
      return await processPayment(redis, payload.paymentId, payload.transactionId);
    }
    // default: return current subscription
    if (action === 'getSubscription') {
      return await getUserSubscription(redis, userId);
    }
    throw new Error('Unknown payment action');
  } catch (err) {
    logger.error('handlePaymentFlow failed', err);
    throw err;
  }
}
