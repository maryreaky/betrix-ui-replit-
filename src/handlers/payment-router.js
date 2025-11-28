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

// Normalize incoming payment method identifiers (accept common aliases)
export function normalizePaymentMethod(method) {
  if (!method) return null;
  const m = String(method).trim().toLowerCase();
  const aliasMap = {
    'safaricom_till': 'SAFARICOM_TILL',
    'safaricom': 'SAFARICOM_TILL',
    'till': 'SAFARICOM_TILL',
    'mpesa': 'MPESA',
    'mpesa_stk': 'MPESA',
    'stk': 'MPESA',
    'paypal': 'PAYPAL',
    'binance': 'BINANCE',
    'binance_pay': 'BINANCE',
    'swift': 'SWIFT',
    'bank': 'SWIFT',
    'bank_transfer': 'SWIFT',
    'bitcoin': 'BITCOIN',
    'btc': 'BITCOIN',
    'eth': 'BITCOIN'
  };

  // Direct uppercase match to keys
  const up = m.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(PAYMENT_PROVIDERS, up)) return up;
  if (aliasMap[m]) return aliasMap[m];
  return null;
}

/**
 * Get available payment methods for user region
 */
export function getAvailablePaymentMethods(userRegion = 'KE') {
  // By default make all providers available (user requested global availability).
  // Keep env var for backward compatibility, but default to all providers.
  return Object.entries(PAYMENT_PROVIDERS).map(([key, provider]) => ({ id: key, ...provider }));
}

/**
 * Return a user-facing guide object for a payment method.
 * Guide includes title, short description, and step list suitable for the bot to display.
 */
export function getPaymentGuide(paymentMethod) {
  const pmKey = normalizePaymentMethod(paymentMethod) || String(paymentMethod).toUpperCase();
  const provider = PAYMENT_PROVIDERS[pmKey];
  if (!provider) return null;

  const title = `${provider.symbol || ''} ${provider.name}`.trim();
  const description = provider.description || `${provider.name} payment instructions`;

  // Use existing instruction generators where available
  let steps = [];
  switch (pmKey) {
    case 'MPESA':
      steps = generateMPesaInstructions('ORDER_ID', provider.minAmount).manualSteps || [];
      break;
    case 'SAFARICOM_TILL':
      steps = generateSafaricomTillPayment('USER', provider.minAmount, 'member').manualSteps || [];
      break;
    case 'PAYPAL':
      steps = generatePayPalInstructions('ORDER_ID', provider.minAmount).steps || [];
      break;
    case 'BINANCE':
      steps = generateBinanceInstructions('ORDER_ID', provider.minAmount).steps || [];
      break;
    case 'SWIFT':
      steps = generateSwiftInstructions('ORDER_ID', provider.minAmount).steps || [];
      break;
    case 'BITCOIN':
      steps = generateBitcoinInstructions('ORDER_ID', provider.minAmount).steps || [];
      break;
    default:
      steps = [`Use ${provider.name} to send ${provider.currencies && provider.currencies[0] ? provider.currencies[0] : 'the required currency'}.`];
  }

  return { id: pmKey, title, description, steps };
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
  const pmKey = normalizePaymentMethod(paymentMethod) || paymentMethod;
  const provider = PAYMENT_PROVIDERS[pmKey];
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
      `💳 *TILL NUMBER: ${provider.tillNumber}*`,
      `💰 *AMOUNT: ${amount} KES*`,
      `📝 *REFERENCE: ${reference}*`,
      ``,
      `📱 *HOW TO PAY (Using M-Pesa):*`,
      `1️⃣ Open M-Pesa on your phone`,
      `2️⃣ Tap *"Lipa Na M-Pesa Online"*`,
      `3️⃣ Select *"Till Number"*`,
      `4️⃣ Enter Till Number: *${provider.tillNumber}*`,
      `5️⃣ Enter Amount: *${amount}*`,
      `6️⃣ Enter Reference (optional): *${reference}*`,
      `7️⃣ Enter Your M-Pesa PIN`,
      `8️⃣ You'll get a confirmation message`,
      ``,
      `✅ *After Paying:*`,
      `• You'll receive an M-Pesa confirmation SMS`,
      `• Copy the full message you receive`,
      `• Paste it in this chat for instant verification`,
      `• Or click "Verify Payment" button below`
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
    // Normalize and validate inputs
    if (!paymentMethod || String(paymentMethod).trim() === '') {
      throw new Error('Payment method is required');
    }
    const pmKey = normalizePaymentMethod(paymentMethod);
    if (!pmKey || !PAYMENT_PROVIDERS[pmKey]) {
      throw new Error(`Unknown payment method: ${paymentMethod}`);
    }
    
    // Validate method is available for region (do not block - allow global availability)
    // User requested: make all payment systems available everywhere. Log if provider missing.
    try {
      const available = getAvailablePaymentMethods(userRegion);
      const isAvailable = available.find(m => m.id === pmKey);
      if (!isAvailable) {
        const availableMethods = available.map(m => m.name).join(', ');
        logger.warn(`Requested payment method ${pmKey} not listed for region ${userRegion}; proceeding anyway. Available: ${availableMethods}`);
      }
    } catch (e) {
      logger.warn('Failed to determine available payment methods, proceeding', e?.message || e);
    }

    // Use normalized key for subsequent logic
    paymentMethod = pmKey; 

    // Determine price in the currency appropriate for the selected payment method
    const tierPrice = getTierPrice(tier, pmKey);
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
 * Create a custom payment order for arbitrary amounts (used for signup fees)
 */
export async function createCustomPaymentOrder(redis, userId, amount, paymentMethod, userRegion = 'KE', metadata = {}) {
  try {
    if (!paymentMethod || String(paymentMethod).trim() === '') throw new Error('Payment method is required');
    const pmKey = normalizePaymentMethod(paymentMethod);
    if (!pmKey || !PAYMENT_PROVIDERS[pmKey]) throw new Error(`Unknown payment method: ${paymentMethod}`);

    // Validate method availability
    const available = getAvailablePaymentMethods(userRegion);
    if (!available.find(m => m.id === pmKey)) {
      const availableNames = available.map(m => m.name).join(', ');
      throw new Error(`${paymentMethod} is not available in ${userRegion}. Available: ${availableNames}`);
    }

    // Use normalized key
    paymentMethod = pmKey;

    const validation = validatePaymentAmount(amount, paymentMethod);
    if (!validation.valid) throw new Error(validation.error);

    const orderId = `ORD${userId}${Date.now()}`;
    const payment = calculatePaymentWithFees(amount, paymentMethod);

    const orderData = {
      orderId,
      userId,
      tier: 'SIGNUP',
      paymentMethod,
      baseAmount: amount,
      fee: payment.fee,
      totalAmount: payment.total,
      currency: payment.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      region: userRegion,
      metadata: metadata || {}
    };

    // Provider-specific instructions
    if (paymentMethod === 'SAFARICOM_TILL') {
      try {
        const tillInstr = generateSafaricomTillPayment(userId, orderData.totalAmount, 'SIGNUP');
        orderData.providerRef = tillInstr.reference;
        orderData.instructions = tillInstr;
      } catch (e) {
        logger.warn('Failed to generate till instructions', e);
      }
    }

    if (paymentMethod === 'PAYPAL') {
      try {
        const paypalResult = await createPayPalOrder(orderData);
        if (paypalResult && paypalResult.id) {
          orderData.providerRef = paypalResult.id;
          orderData.metadata = orderData.metadata || {};
          orderData.metadata.checkoutUrl = paypalResult.approvalUrl;
          orderData.instructions = { method: 'paypal', checkoutUrl: paypalResult.approvalUrl, amount: orderData.totalAmount };
        }
      } catch (e) {
        logger.warn('Failed to create PayPal order', e.message);
      }
    }

    // Store order
    await redis.setex(`payment:order:${orderId}`, 900, JSON.stringify(orderData));
    try {
      await redis.setex(`payment:by_user:${userId}:pending`, 900, orderId);
      if (orderData.providerRef) await redis.setex(`payment:by_provider_ref:${paymentMethod}:${orderData.providerRef}`, 900, orderId);
    } catch (e) { logger.warn('Failed to write quick lookup for custom order', e); }

    logger.info('Custom payment order created', { orderId, userId, paymentMethod, amount });
    return orderData;
  } catch (err) {
    logger.error('createCustomPaymentOrder failed', err);
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

    const pmKey = normalizePaymentMethod(paymentMethod) || paymentMethod;
    return instructions[pmKey] || null;
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
    description: '📱 M-Pesa Payment - STK Push',
    manualSteps: [
      `📱 *M-PESA PAYMENT INSTRUCTIONS*`,
      ``,
      `💰 *AMOUNT: ${amount} KES*`,
      `📝 *ORDER ID: ${orderId}*`,
      ``,
      `✨ *AUTOMATIC METHOD (Recommended):*`,
      `• You should receive an STK prompt on your phone automatically`,
      `• Enter your M-Pesa PIN to confirm`,
      `• You'll get an M-Pesa confirmation message`,
      ``,
      `📋 *MANUAL METHOD (If no prompt):*`,
      `1. Open M-Pesa on your phone`,
      `2. Go to *"Send Money"* or *"Lipa na M-Pesa"*`,
      `3. Look for our Business Number (till/paybill)`,
      `4. Enter Amount: *${amount} KES*`,
      `5. Enter Your M-Pesa PIN`,
      ``,
      `✅ *AFTER PAYMENT:*`,
      `• Wait for the confirmation SMS from M-Pesa`,
      `• Copy the entire confirmation message`,
      `• Paste it back in this chat for instant activation`,
      `• OR click "Verify Payment" button below`,
      ``,
      `⏰ *Payment expires in 15 minutes*`
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
    if (tier === 'SIGNUP') {
      // One-time signup fee: grant analysis access without changing main tier
      await redis.hset(`user:${userId}`, 'signupPaid', '1');
      await redis.hset(`user:${userId}`, 'analysisAccessUntil', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
      // Do not overwrite existing tier; keep user's tier (default FREE)
    } else {
      await redis.hset(`user:${userId}`, 'tier', tier);
      await redis.hset(
        `user:${userId}`,
        'subscriptionExpiry',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      );
    }

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
function getTierPrice(tier, paymentMethod = 'PAYPAL') {
  // Prices defined with KES and USD values
  const prices = {
    SIGNUP: { KES: 150, USD: 1 },
    PRO: { KES: 899, USD: 8.99 },
    VVIP: { KES: 2699, USD: 29.99 },
    PLUS: { KES: 8999, USD: 99.99 },
    FIXED_BRONZE: { KES: 499, USD: 4.99 },
    FIXED_SILVER: { KES: 1299, USD: 12.99 },
    FIXED_GOLD: { KES: 4499, USD: 44.99 }
  };

  const tierObj = prices[tier];
  if (!tierObj) return 0;

  const provider = PAYMENT_PROVIDERS[paymentMethod];
  const currency = provider ? provider.currencies[0] : 'USD';

  if (currency === 'KES' || currency === 'KSH') return tierObj.KES;
  return tierObj.USD;
}

export { getTierPrice };

/**
 * Return available VVIP/fixed packages metadata
 */
export function getAvailablePackages() {
  return {
    SIGNUP: { id: 'SIGNUP', name: 'Signup Fee (One-time)', description: 'Activate analyze & core features', price: { KES: 150, USD: 1 }, currency: 'KES' },
    PRO: { id: 'PRO', name: 'Pro Monthly', description: 'Enhanced analytics', price: { KES: 899, USD: 8.99 }, currency: 'KES' },
    VVIP: { id: 'VVIP', name: 'VVIP Monthly', description: 'Unlimited AI analysis & alerts', price: { KES: 2699, USD: 29.99 }, currency: 'KES' },
    PLUS: { id: 'PLUS', name: 'BETRIX Plus', description: 'Enterprise bundle', price: { KES: 8999, USD: 99.99 }, currency: 'KES' },
    FIXED_BRONZE: { id: 'FIXED_BRONZE', name: 'Fixed Bronze', description: '5 fixed-odds tips / month', price: { KES: 499, USD: 4.99 }, currency: 'KES' },
    FIXED_SILVER: { id: 'FIXED_SILVER', name: 'Fixed Silver', description: '15 fixed-odds tips / month', price: { KES: 1299, USD: 12.99 }, currency: 'KES' },
    FIXED_GOLD: { id: 'FIXED_GOLD', name: 'Fixed Gold', description: '50 fixed-odds tips / month', price: { KES: 4499, USD: 44.99 }, currency: 'KES' }
  };
}

/**
 * Parse a pasted transaction message and extract common fields
 * Supports common M-Pesa / Till / PayPal plaintext confirmations
 */
export function parseTransactionMessage(text) {
  if (!text || typeof text !== 'string') return {};

  const normalized = text.replace(/[\n\r]/g, ' ').trim();

  // Try to extract amount
  const amountMatch = normalized.match(/(?:Ksh|KES|KES\.|KES|USD|\$|\b)(\s?\d{1,3}(?:[.,]\d{1,2})?)/i);
  let amount = null;
  if (amountMatch) {
    const num = amountMatch[1].replace(/[,]/g, '.').replace(/\s/g, '');
    amount = parseFloat(num);
  }

  // Try to find reference tokens e.g., Ref, Reference, Till
  const refMatch = normalized.match(/(?:Ref(?:erence)?|Reference|Till|Trx|Transaction|Receipt)[:\s]*([A-Z0-9-]{3,32})/i);
  const reference = refMatch ? refMatch[1] : null;

  // Try to find phone number
  const phoneMatch = normalized.match(/(\+?2547\d{8}|07\d{8}|\+?\d{9,15})/);
  const phone = phoneMatch ? phoneMatch[1] : null;

  // Transaction id (alphanumeric token)
  const txIdMatch = normalized.match(/\b([A-Z0-9]{6,20})\b/);
  const transactionId = txIdMatch ? txIdMatch[1] : null;

  return { raw: text, normalized, amount, reference, phone, transactionId };
}

/**
 * Attempt to verify payment by inspecting a pasted transaction message.
 * Strategy:
 *  - If reference present, lookup mapping payment:by_provider_ref across providers
 *  - If phone present, lookup payment:by_phone
 *  - Otherwise check user's pending order and compare amounts
 */
export async function verifyPaymentFromMessage(redis, userId, text) {
  try {
    const parsed = parseTransactionMessage(text);
    const { reference, phone, amount, transactionId } = parsed;

    // 1) Reference lookup across providers
    if (reference) {
      for (const key of Object.keys(PAYMENT_PROVIDERS)) {
        try {
          const oid = await redis.get(`payment:by_provider_ref:${key}:${reference}`);
          if (oid) {
            // Use reference as transactionId if none
            const tx = transactionId || reference;
            return await verifyAndActivatePayment(redis, oid, tx);
          }
        } catch (e) {
          // ignore individual provider lookup failures
        }
      }
    }

    // 2) Phone lookup
    if (phone) {
      const phoneNorm = String(phone).replace(/\+|\s|-/g, '');
      const oid = await redis.get(`payment:by_phone:${phoneNorm}`);
      if (oid) {
        const tx = transactionId || (`PHONE-${Date.now()}`);
        return await verifyAndActivatePayment(redis, oid, tx);
      }
    }

    // 3) Check user's pending order and match by amount tolerance
    const pending = await redis.get(`payment:by_user:${userId}:pending`);
    if (pending) {
      const orderRaw = await redis.get(`payment:order:${pending}`);
      if (orderRaw) {
        const order = JSON.parse(orderRaw);
        // Compare amounts (allow small rounding differences)
        if (amount && Math.abs(Number(order.totalAmount) - Number(amount)) <= 1) {
          const tx = transactionId || (`MSG-${Date.now()}`);
          return await verifyAndActivatePayment(redis, pending, tx);
        }
      }
    }

    throw new Error('Could not match the pasted transaction to any pending order. Please ensure your payment included the reference or pay the exact amount shown in the payment instructions.');
  } catch (err) {
    throw err;
  }
}

export default {
  PAYMENT_PROVIDERS,
  getAvailablePaymentMethods,
  calculatePaymentWithFees,
  validatePaymentAmount,
  generateSafaricomTillPayment,
  createPaymentOrder,
  createCustomPaymentOrder,
  getPaymentInstructions,
  verifyAndActivatePayment,
  getTierPrice,
  parseTransactionMessage,
  verifyPaymentFromMessage
};
