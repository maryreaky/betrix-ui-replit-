/**
 * Payment Router - Unified payment handling
 * Supports M-Pesa, Safaricom Till, PayPal, Binance, and SWIFT
 */

import { Logger } from '../utils/logger.js';
import * as paypal from '@paypal/checkout-server-sdk';

const logger = new Logger('PaymentRouter');

// Payment providers configuration
export const PAYMENT_PROVIDERS = {
  MPESA: {
    name: 'M-Pesa',
    symbol: '📱',
    icon: 'mpesa',
    regions: ['KE', 'TZ', 'UG'],
    minAmount: 10,
    maxAmount: 150000,
    fee: 0.015, // 1.5%
    currencies: ['KES'],
    processor: 'safaricom'
  },
  SAFARICOM_TILL: {
    name: 'Safaricom Till',
    symbol: '🏪',
    icon: 'till',
    tillNumber: process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215',
    regions: ['KE'],
    minAmount: 50,
    maxAmount: 500000,
    fee: 0.01, // 1%
    currencies: ['KES'],
    processor: 'safaricom',
    description: 'Pay directly to BETRIX till for instant credit'
  },
  PAYPAL: {
    name: 'PayPal',
    symbol: '💳',
    icon: 'paypal',
    regions: ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES'],
    minAmount: 5,
    maxAmount: 10000,
    fee: 0.029, // 2.9% + $0.30
    currencies: ['USD', 'EUR', 'GBP', 'AUD'],
    processor: 'paypal'
  },
  BINANCE: {
    name: 'Binance Pay',
    symbol: '₿',
    icon: 'binance',
    regions: ['GLOBAL'],
    minAmount: 5,
    maxAmount: 50000,
    fee: 0.001, // 0.1%
    currencies: ['USDT', 'BTC', 'ETH', 'BNB'],
    processor: 'binance'
  },
  SWIFT: {
    name: 'Bank Transfer (SWIFT)',
    symbol: '🏦',
    icon: 'swift',
    regions: ['GLOBAL'],
    minAmount: 100,
    maxAmount: 1000000,
    fee: 0.005, // 0.5%
    currencies: ['USD', 'EUR', 'GBP'],
    processor: 'swift',
    description: 'International bank transfer'
  },
  BITCOIN: {
    name: 'Bitcoin',
    symbol: '₿',
    icon: 'bitcoin',
    regions: ['GLOBAL'],
    minAmount: 0.0001,
    maxAmount: 100,
    fee: 0.001,
    currencies: ['BTC'],
    processor: 'bitcoin'
  }
};

/**
 * Get available payment methods for user region
 */
export function getAvailablePaymentMethods(userRegion = 'KE') {
  return Object.entries(PAYMENT_PROVIDERS)
    .filter(([_, provider]) => 
      provider.regions.includes('GLOBAL') || 
      provider.regions.includes(userRegion)
    )
    .map(([key, provider]) => ({
      id: key,
      ...provider
    }));
}

/**
 * Calculate payment with fees
 */
export function calculatePaymentWithFees(baseAmount, paymentMethod) {
  const provider = PAYMENT_PROVIDERS[paymentMethod];
  if (!provider) throw new Error('Invalid payment method');

  const fee = baseAmount * provider.fee;
  const total = baseAmount + fee;

  return {
    baseAmount,
    fee: Math.ceil(fee * 100) / 100,
    total: Math.ceil(total * 100) / 100,
    currency: provider.currencies[0],
    provider: provider.name
  };
}

/**
 * Validate payment amount
 */
export function validatePaymentAmount(amount, paymentMethod) {
  const provider = PAYMENT_PROVIDERS[paymentMethod];
  if (!provider) {
    return { valid: false, error: 'Invalid payment method' };
  }

  if (amount < provider.minAmount) {
    return { 
      valid: false, 
      error: `Minimum amount is ${provider.minAmount} ${provider.currencies[0]}` 
    };
  }

  if (amount > provider.maxAmount) {
    return { 
      valid: false, 
      error: `Maximum amount is ${provider.maxAmount} ${provider.currencies[0]}` 
    };
  }

  return { valid: true };
}

/**
 * Generate Safaricom Till payment instruction
 */
export function generateSafaricomTillPayment(userId, amount, tier) {
  const provider = PAYMENT_PROVIDERS.SAFARICOM_TILL;
  const reference = `BETRIX${userId}${tier}${Date.now()}`.substring(0, 12).toUpperCase();
  
  return {
    method: 'safaricom_till',
    tillNumber: provider.tillNumber,
    amount,
    reference,
    narrative: `BETRIX ${tier} - Ref: ${reference}`,
    description: `Send ${amount} KES to Safaricom Till ${provider.tillNumber}`,
    qrCode: generateTillQRCode(provider.tillNumber, amount, reference),
    manualSteps: [
      `1. Go to M-Pesa menu → Lipa Na M-Pesa Online`,
      `2. Select "Till Number"`,
      `3. Enter Till: ${provider.tillNumber}`,
      `4. Amount: ${amount} KES`,
      `5. Reference: ${reference}`,
      `6. Enter M-Pesa PIN`
    ]
  };
}

/**
 * Generate QR code for till payment (simplified URL format)
 */
function generateTillQRCode(till, amount, ref) {
  const url = `https://betrix.app/pay/till?till=${till}&amount=${amount}&ref=${ref}`;
  return url;
}

/**
 * Create payment order
 */
/**
 * Create payment order
 * metadata: optional object { phone, providerRef, metadata }
 */
export async function createPaymentOrder(redis, userId, tier, paymentMethod, userRegion = 'KE', metadata = {}) {
  try {
    // Validate method is available for region
    const available = getAvailablePaymentMethods(userRegion);
    if (!available.find(m => m.id === paymentMethod)) {
      throw new Error(`${paymentMethod} not available in ${userRegion}`);
    }

    const tierPrice = getTierPrice(tier);
    const validation = validatePaymentAmount(tierPrice, paymentMethod);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const orderId = `ORD${userId}${Date.now()}`;
    const payment = calculatePaymentWithFees(tierPrice, paymentMethod);

    const orderData = {
      orderId,
      userId,
      tier,
      paymentMethod,
      baseAmount: payment.baseAmount,
      fee: payment.fee,
      totalAmount: payment.total,
      currency: payment.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
      region: userRegion
    };

    // If metadata provided, attach
    if (metadata && typeof metadata === 'object') {
      orderData.metadata = metadata;
    }

    // For SAFARICOM_TILL, generate a provider reference (so user can include it when paying)
    if (paymentMethod === 'SAFARICOM_TILL') {
      try {
        const tillInstr = generateSafaricomTillPayment(userId, payment.total, tier);
        orderData.providerRef = tillInstr.reference;
        orderData.instructions = tillInstr;
      } catch (e) {
        logger.warn('Failed to generate till instructions', e);
      }
    }

    // For PayPal, create a server-side order and capture approval URL
    if (paymentMethod === 'PAYPAL') {
      try {
        const paypalResult = await createPayPalOrder(orderData);
        if (paypalResult && paypalResult.id) {
          orderData.providerRef = paypalResult.id;
          orderData.metadata = orderData.metadata || {};
          orderData.metadata.checkoutUrl = paypalResult.approvalUrl;
          orderData.instructions = {
            method: 'paypal',
            checkoutUrl: paypalResult.approvalUrl,
            amount: orderData.totalAmount,
            description: 'Pay with PayPal'
          };
        }
      } catch (e) {
        logger.warn('Failed to create PayPal order', e);
      }
    }

    // Store order in Redis (15 min TTL)
    await redis.setex(`payment:order:${orderId}`, 900, JSON.stringify(orderData));

    // Create quick lookup mappings
    try {
      // Map by user pending order
      await redis.setex(`payment:by_user:${userId}:pending`, 900, orderId);

      // Map by providerRef if present
      if (orderData.providerRef) {
        await redis.setex(`payment:by_provider_ref:${paymentMethod}:${orderData.providerRef}`, 900, orderId);
      }

      // Map by phone if provided in metadata
      if (metadata && metadata.phone) {
        const phone = String(metadata.phone).replace(/\s|\+|-/g, '');
        await redis.setex(`payment:by_phone:${phone}`, 900, orderId);
      }
    } catch (e) {
      logger.warn('Failed to write quick lookup mappings for order', e);
    }

    logger.info('Payment order created', { orderId, userId, paymentMethod });

    return orderData;
  } catch (err) {
    logger.error('Payment order creation failed', err);
    throw err;
  }
}

/**
 * Get payment instructions based on method
 */
export async function getPaymentInstructions(redis, orderId, paymentMethod) {
  try {
    const order = await redis.get(`payment:order:${orderId}`);
    if (!order) throw new Error('Order not found');

    const orderData = JSON.parse(order);
    const { totalAmount, tier, userId } = orderData;

    // Use stored instructions if present (e.g., Safaricom Till reference)
    if (orderData.instructions && orderData.instructions.method) {
      return orderData.instructions;
    }

    const instructions = {
      MPESA: generateMPesaInstructions(orderId, totalAmount),
      SAFARICOM_TILL: generateSafaricomTillPayment(userId, totalAmount, tier),
      PAYPAL: (orderData.metadata && orderData.metadata.checkoutUrl) ? { method: 'paypal', amount: totalAmount, orderId, checkoutUrl: orderData.metadata.checkoutUrl, description: 'Click to open PayPal', steps: ['Click the PayPal link to complete payment'] } : generatePayPalInstructions(orderId, totalAmount, orderData.providerRef),
      BINANCE: generateBinanceInstructions(orderId, totalAmount),
      SWIFT: generateSwiftInstructions(orderId, totalAmount),
      BITCOIN: generateBitcoinInstructions(orderId, totalAmount)
    };

    return instructions[paymentMethod] || null;
  } catch (err) {
    logger.error('Failed to get payment instructions', err);
    throw err;
  }
}

// -------------------------
// PayPal helpers
// -------------------------
function paypalClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  const env = mode === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);

  return new paypal.core.PayPalHttpClient(env);
}

async function createPayPalOrder(orderData) {
  try {
    let client;
    try {
      client = paypalClient();
    } catch (credErr) {
      // If PayPal credentials are missing and we're in demo mode, return a mock approval URL
      if (process.env.ENABLE_DEMO === '1' || process.env.MOCK_PAYMENTS === '1') {
        const mockId = `MOCKPAY-${Date.now()}`;
        return { id: mockId, approvalUrl: `${process.env.PUBLIC_URL || 'https://betrix.app'}/mock-pay/${mockId}` };
      }
      throw credErr;
    }
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');

    // Use currency from orderData or default to USD
    const currency = orderData.currency || 'USD';
    const value = String(Number(orderData.totalAmount).toFixed(2));

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderData.orderId,
          amount: {
            currency_code: currency,
            value: value
          },
          description: `BETRIX ${orderData.tier} subscription`
        }
      ],
      application_context: {
        brand_name: 'BETRIX',
        return_url: process.env.PAYPAL_RETURN_URL || `${process.env.PUBLIC_URL || 'https://betrix.app'}/pay/complete`,
        cancel_url: process.env.PAYPAL_CANCEL_URL || `${process.env.PUBLIC_URL || 'https://betrix.app'}/pay/cancel`
      }
    });

    const response = await client.execute(request);
    const result = response.result || {};
    const approveLink = (result.links || []).find(l => l.rel === 'approve');
    return { id: result.id, approvalUrl: approveLink ? approveLink.href : null };
  } catch (err) {
    logger.error('createPayPalOrder failed', err);
    throw err;
  }
}

/**
 * M-Pesa STK Push instruction
 */
function generateMPesaInstructions(orderId, amount) {
  return {
    method: 'mpesa_stk',
    amount,
    currency: 'KES',
    orderId,
    description: 'M-Pesa will prompt you to enter your PIN',
    steps: [
      'Check your phone for M-Pesa PIN prompt',
      'Enter your PIN to confirm payment',
      'You will receive a confirmation message'
    ]
  };
}

/**
 * PayPal instructions
 */
function generatePayPalInstructions(orderId, amount, providerRef) {
  const token = providerRef || orderId;
  const paypalUrl = `https://www.paypal.com/checkoutnow?token=${token}`;
  
  return {
    method: 'paypal',
    amount,
    orderId,
    checkoutUrl: paypalUrl,
    description: 'Click button below to open PayPal',
    steps: [
      'Click "Pay with PayPal" button',
      'Log in to your PayPal account',
      'Review payment and confirm',
      'Return to BETRIX to activate subscription'
    ]
  };
}

/**
 * Binance Pay instructions
 */
function generateBinanceInstructions(orderId, amount) {
  return {
    method: 'binance_pay',
    amount,
    orderId,
    description: 'Send payment to Binance Pay',
    steps: [
      'Open Binance Pay app',
      `Search for merchant: ${orderId}`,
      `Send ${amount} USDT or equivalent`,
      'Wait for payment confirmation (instant)'
    ]
  };
}

/**
 * SWIFT bank transfer instructions
 */
function generateSwiftInstructions(orderId, amount) {
  return {
    method: 'swift',
    amount,
    orderId,
    bankDetails: {
      accountName: 'BETRIX Limited',
      bankName: 'Bank of East Africa',
      accountNumber: 'BETRIX2025',
      swiftCode: 'BEAKEZKX',
      iban: 'KE93BEAK0000123456789'
    },
    description: 'Make a bank transfer with reference below',
    reference: orderId,
    steps: [
      'Log in to your bank',
      'Select "International Transfer"',
      'Use details above',
      'Reference: ' + orderId,
      'Send and wait for 2-3 business days'
    ]
  };
}

/**
 * Bitcoin instructions
 */
function generateBitcoinInstructions(orderId, amount) {
  // In production, this would generate a unique Bitcoin address
  const btcAmount = (amount / 60000).toFixed(6); // Mock conversion
  
  return {
    method: 'bitcoin',
    amount: btcAmount,
    orderId,
    network: 'Bitcoin',
    description: 'Send Bitcoin to address below',
    steps: [
      `Send exactly ${btcAmount} BTC to address:`,
      '1A7g6UTh2x3KxxxFffX7LxxxXxxxxxXxxx',
      'Wait for 1-3 confirmations (10-30 minutes)',
      'Your subscription will activate automatically'
    ]
  };
}

/**
 * Verify payment and activate subscription
 */
export async function verifyAndActivatePayment(redis, orderId, transactionId) {
  try {
    const order = await redis.get(`payment:order:${orderId}`);
    if (!order) throw new Error('Order not found');

    const orderData = JSON.parse(order);
    const { userId, tier, status } = orderData;

    if (status !== 'pending') {
      throw new Error('Order already processed');
    }

    // Update order status
    orderData.status = 'completed';
    orderData.transactionId = transactionId;
    orderData.completedAt = new Date().toISOString();

    // Activate user subscription
    await redis.hset(`user:${userId}`, 'tier', tier);
    await redis.hset(
      `user:${userId}`,
      'subscriptionExpiry',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Store transaction
    await redis.setex(
      `transaction:${transactionId}`,
      30 * 24 * 60 * 60,
      JSON.stringify(orderData)
    );

    // Store order completion
    await redis.setex(`payment:order:${orderId}`, 86400, JSON.stringify(orderData));

    logger.info('Payment verified and activated', { orderId, userId, tier });

    return {
      success: true,
      tier,
      message: `🎉 Welcome to BETRIX ${tier}! Your subscription is now active.`
    };
  } catch (err) {
    logger.error('Payment verification failed', err);
    throw err;
  }
}

/**
 * Simulate a payment completion for testing/demo runs
 * This will mark the order as completed and activate the subscription
 */
export async function simulatePaymentComplete(redis, orderId) {
  const txId = `SIMTX-${Date.now()}`;
  return await verifyAndActivatePayment(redis, orderId, txId);
}

/**
 * Get tier pricing
 */
function getTierPrice(tier) {
  const prices = {
    PRO: 9.99,
    VVIP: 29.99,
    PLUS: 99.99
  };
  return prices[tier] || 0;
}

export default {
  PAYMENT_PROVIDERS,
  getAvailablePaymentMethods,
  calculatePaymentWithFees,
  validatePaymentAmount,
  generateSafaricomTillPayment,
  createPaymentOrder,
  getPaymentInstructions,
  verifyAndActivatePayment,
  getTierPrice
};
