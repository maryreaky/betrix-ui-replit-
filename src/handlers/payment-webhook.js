/**
 * Payment Webhook Handler - Process payment notifications from providers
 */

import { Logger } from '../utils/logger.js';
import { verifyAndActivatePayment } from './payment-router.js';
import crypto from 'crypto';
import fetch from 'node-fetch';

const logger = new Logger('PaymentWebhook');

// Send a concise admin alert when quick mapping lookup fails
async function alertAdmin(bot, subject, details = {}) {
  try {
    const adminId = process.env.ADMIN_TELEGRAM_ID || process.env.TELEGRAM_ADMIN_ID || null;
    if (!adminId) return;
    if (!bot || typeof bot.sendMessage !== 'function') return;
    const payload = JSON.stringify(details, Object.keys(details).slice(0, 20), 2);
    const text = `⚠️ Payment mapping miss - ${subject}\n\n${payload}`;
    // Best-effort notify admin
    await bot.sendMessage(adminId, text);
  } catch (e) {
    logger.warn('Failed to send admin alert', e?.message || String(e));
  }
}
/**
 * Handle M-Pesa STK Push callback
 */
export async function handleMpesaCallback(req, redis, bot) {
  try {
    // Optional signature validation
    const MPESA_SECRET = process.env.MPESA_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || null;
    if (MPESA_SECRET) {
      const sig = req.headers['x-signature'] || req.headers['x-mpesa-signature'];
      if (!verifySignature(req, MPESA_SECRET, sig)) {
        logger.warn('M-Pesa webhook signature mismatch');
        return { success: false, message: 'invalid signature' };
      }
    }

    const { Body } = req.body;
    const result = Body?.stkCallback?.CallbackMetadata;
    if (!result || !result.Item) {
      logger.warn('M-Pesa callback missing metadata');
      return { success: false, message: 'invalid payload' };
    }

    // Extract payment details
    const items = result.Item.reduce((acc, item) => {
      acc[item.Name] = item.Value;
      return acc;
    }, {});

    const amount = Number(items.Amount || items.amount);
    const mpesaReceiptNumber = items.MpesaReceiptNumber || items.mpesaReceiptNumber || '';
    const phoneNumber = items.PhoneNumber || items.phoneNumber || '';
    const transactionDate = items.TransactionDate || items.transactionDate || '';

    logger.info('M-Pesa payment received:', {
      amount,
      mpesaReceiptNumber,
      phoneNumber
    });

    // Find order by phone or transaction reference
    const orderResultCode = Body.stkCallback.ResultCode;

    if (orderResultCode === 0) {
      // Try quick lookup by phone
      try {
        const normalizedPhone = String(phoneNumber || '').replace(/\s|\+|-/g, '');
        let orderId = null;
        if (normalizedPhone) {
          orderId = await redis.get(`payment:by_phone:${normalizedPhone}`);
        }

        // Fallback: try provider ref mapping (MPESA receipt)
        if (!orderId && mpesaReceiptNumber) {
          orderId = await redis.get(`payment:by_provider_ref:MPESA:${mpesaReceiptNumber}`);
        }

        // Resolve order by quick mappings only (phone or provider reference)
        if (!orderId) {
          logger.warn('No quick mapping found for M-Pesa payment', { amount, phoneNumber });
          await alertAdmin(bot, 'M-Pesa mapping not found', { amount, phoneNumber, mpesaReceiptNumber, Body: Body?.stkCallback });
          return { success: false, message: 'Order mapping not found' };
        }

        const raw = await redis.get(`payment:order:${orderId}`);
        if (!raw) {
          logger.warn('Mapped order id not found in storage', { orderId });
          return { success: false, message: 'Order not found' };
        }

        const foundData = JSON.parse(raw);
        const subscription = await verifyAndActivatePayment(redis, orderId, mpesaReceiptNumber);

        if (subscription && foundData.userId) {
          await bot.sendMessage(foundData.userId, `✅ *M-Pesa Payment Confirmed*\n\nAmount: KES ${amount}\nReceipt: ${mpesaReceiptNumber}\n\nYour ${subscription.tier} subscription is now active!`, { parse_mode: 'Markdown' });
        }

        return { success: true, message: 'Payment processed' };
      } catch (err) {
        logger.error('Error processing M-Pesa callback', err);
        return { success: false, error: err.message };
      }
    } else {
      logger.warn('M-Pesa payment failed:', { result: orderResultCode });
      return { success: false, message: 'Payment failed' };
    }
  } catch (error) {
    logger.error('M-Pesa callback error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle Safaricom Till payment confirmation
 * This would typically come from Safaricom's API
 */
export async function handleSafaricomTillCallback(req, redis, bot) {
  try {
    const {
      till_number,
      amount,
      transaction_id,
      phone_number,
      timestamp,
      status
    } = req.body;

    // Optional HMAC validation
    const TILL_SECRET = process.env.SAFARICOM_TILL_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || null;
    if (TILL_SECRET) {
      const sig = req.headers['x-signature'] || req.headers['x-till-signature'];
      if (!verifySignature(req, TILL_SECRET, sig)) {
        logger.warn('Safaricom Till webhook signature mismatch');
        return { success: false, message: 'invalid signature' };
      }
    }

    const CONFIG_TILL = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';
    if (String(till_number) !== String(CONFIG_TILL)) {
      logger.warn('Invalid till number:', till_number);
      return { success: false, message: 'Invalid till' };
    }

    logger.info('Safaricom Till payment:', {
      amount,
      transaction_id,
      phone_number
    });

    if (status === 'completed') {
      try {
        // Try providerRef mapping (maybe provider sent our reference)
        let orderId = null;
        if (req.body.reference) {
          orderId = await redis.get(`payment:by_provider_ref:SAFARICOM_TILL:${req.body.reference}`);
        }

        // If transaction_id was used as reference mapping
        if (!orderId && transaction_id) {
          orderId = await redis.get(`payment:by_provider_ref:SAFARICOM_TILL:${transaction_id}`);
        }

        // Require quick mapping (reference or transaction id). Do not scan.
        if (!orderId) {
          logger.warn('No quick mapping found for Till payment', { amount, transaction_id });
          await alertAdmin(bot, 'Safaricom Till mapping not found', { amount, transaction_id, reference: req.body.reference, till_number });
          return { success: false, message: 'Order mapping not found' };
        }

        const raw = await redis.get(`payment:order:${orderId}`);
        if (!raw) {
          logger.warn('Mapped till order id not found in storage', { orderId });
          return { success: false, message: 'Order not found' };
        }

        const foundData = JSON.parse(raw);
        const subscription = await verifyAndActivatePayment(redis, orderId, transaction_id);

        if (subscription && foundData.userId) {
          await bot.sendMessage(foundData.userId, `✅ *Safaricom Till Payment Confirmed*\n\nAmount: KES ${amount}\nTransaction: ${transaction_id}\n\nYour ${subscription.tier} subscription is now active!`, { parse_mode: 'Markdown' });
        }

        return { success: true, message: 'Payment processed' };
      } catch (err) {
        logger.error('Till payment processing error', err);
        return { success: false, error: err.message };
      }
    }

    return { success: false, message: 'Payment not completed' };
  } catch (error) {
    logger.error('Safaricom Till callback error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle PayPal webhook
 */
export async function handlePayPalWebhook(req, redis, bot) {
  try {
    const event = req.body;
    // Prefer PayPal's official webhook verification when credentials are present
    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
    const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID; // configured webhook id

    if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_WEBHOOK_ID) {
      const verified = await verifyPayPalWebhook(req, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID);
      if (!verified) {
        logger.warn('PayPal webhook verification failed (provider verification)');
        return { success: false, message: 'invalid paypal signature' };
      }
    } else {
      // Fallback to simple HMAC if a shared secret is provided
      const PAYPAL_SECRET = process.env.PAYPAL_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || null;
      if (PAYPAL_SECRET) {
        const sig = req.headers['x-paypal-signature'] || req.headers['x-signature'];
        if (!verifySignature(req, PAYPAL_SECRET, sig)) {
          logger.warn('PayPal webhook signature mismatch (HMAC fallback)');
          return { success: false, message: 'invalid signature' };
        }
      }
    }

    if (event.event_type === 'BILLING.SUBSCRIPTION.CREATED') {
      const subscription = event.resource;
      logger.info('PayPal subscription created:', subscription.id);
      return { success: true };
    }

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const { supplementary_data, id, status } = event.resource;
      
      if (status === 'COMPLETED') {
        logger.info('PayPal payment completed:', id);
        
        // Try mapping by provider reference first
        let subscription = null;
        let foundOrderId = null;
        try {
          // Common places where PayPal order id may appear
          const possibleOrderIds = [
            event.resource.supplementary_data?.related_ids?.order_id,
            event.resource.order_id,
            event.resource.invoice_id,
            id
          ].filter(Boolean);

          for (const candidate of possibleOrderIds) {
            const mapped = await redis.get(`payment:by_provider_ref:PAYPAL:${candidate}`);
            if (mapped) { foundOrderId = mapped; break; }
          }
        } catch (ee) { foundOrderId = null; }

        if (foundOrderId) {
          try {
            subscription = await verifyAndActivatePayment(redis, foundOrderId, id);
          } catch (e) {
            logger.warn('verifyAndActivatePayment failed for mapped PayPal order', { foundOrderId, err: e.message });
            subscription = null;
          }
        }

        // If not found by mapping, do not scan — return not-found so we can rely
        // on initiators to create proper providerRef mappings. This prevents
        // expensive scans in production and avoids race conditions.
        if (!subscription) {
          logger.warn('PayPal webhook received but no mapped order found', { captureId: id });
          await alertAdmin(bot, 'PayPal mapping not found', { captureId: id, possibleOrderIds });
          return { success: false, message: 'Order mapping not found' };
        }

        if (subscription && subscription.telegramUserId) {
          await bot.sendMessage(
            subscription.telegramUserId,
            `✅ *PayPal Payment Confirmed*\n\nTransaction: ${id}\n\nYour ${subscription.tier} subscription is now active!`,
            { parse_mode: 'Markdown' }
          );
        }

        return { success: true, message: 'Payment processed' };
      }
    }

    return { success: true, message: 'Event received' };
  } catch (error) {
    logger.error('PayPal webhook error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle Binance webhook
 */
export async function handleBinanceWebhook(req, redis, bot) {
  try {
    const { data } = req.body;

    if (data.status === 'SUCCESS') {
      const { transactionId, totalFeeInUSD } = data;
      
      logger.info('Binance payment completed:', transactionId);

      // try mapped order by provider ref
      let subscription = null;
      try {
        const mapped = await redis.get(`payment:by_provider_ref:BINANCE:${transactionId}`);
        if (mapped) {
          try {
            subscription = await verifyAndActivatePayment(redis, mapped, transactionId);
          } catch (e) { logger.warn('verifyAndActivatePayment failed for mapped Binance order', e); subscription = null; }
        } else {
          logger.warn('No mapping found for Binance transaction', { transactionId });
          await alertAdmin(bot, 'Binance mapping not found', { transactionId, totalFeeInUSD });
          return { success: false, message: 'Order mapping not found' };
        }
      } catch (e) { /* ignore */ }
      

      if (subscription && subscription.telegramUserId) {
        await bot.sendMessage(
          subscription.telegramUserId,
          `✅ *Binance Payment Confirmed*\n\nTransaction: ${transactionId}\n\nYour ${subscription.tier} subscription is now active!`,
          { parse_mode: 'Markdown' }
        );
      }

      return { success: true, message: 'Payment processed' };
    }

    return { success: false, message: 'Payment not successful' };
  } catch (error) {
    logger.error('Binance webhook error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Manual payment verification endpoint
 * Called when user clicks "I have paid" button
 */
export async function verifyPaymentManual(req, redis, bot, orderId) {
  try {
    const raw = await redis.get(`payment:order:${orderId}`);
    if (!raw) return { success: false, error: 'Order not found' };
    const orderData = JSON.parse(raw);

    // For manual verification, ensure the order is at least a few seconds old
    const createdAt = new Date(orderData.createdAt).getTime();
    const timePassed = Date.now() - createdAt;

    if (timePassed < 10 * 1000) {
      return {
        success: false,
        error: 'Payment still processing. Please wait and try again.',
        retryAfter: 10 // seconds
      };
    }

    const subscription = await verifyAndActivatePayment(redis, orderId, `manual_${orderId}`);
    return { success: true, subscription };
  } catch (error) {
    logger.error('Manual payment verification error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify signature helper (HMAC-SHA256) — compares provided signature to HMAC of JSON body
 */
function verifySignature(req, secret, headerValue) {
  try {
    if (!secret) return true;
    const bodyStr = JSON.stringify(req.body || {});
    const hmac = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
    if (!headerValue) return false;
    return headerValue.toLowerCase().includes(hmac.toLowerCase()) || headerValue.toLowerCase() === hmac.toLowerCase();
  } catch (e) {
    logger.warn('Signature verification error', e);
    return false;
  }
}

/**
 * Verify PayPal webhook using PayPal's verify-webhook-signature API
 * Returns true if PayPal reports the signature as valid.
 */
async function verifyPayPalWebhook(req, clientId, clientSecret, webhookId) {
  try {
    const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
    const host = mode === 'live' || mode === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    // Obtain access token
    const tokenResp = await fetch(`${host}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResp.ok) {
      logger.warn('PayPal token request failed', { status: tokenResp.status });
      return false;
    }

    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      logger.warn('No PayPal access token received');
      return false;
    }

    const transmissionId = req.headers['paypal-transmission-id'] || req.headers['paypal-transmission-id'.toLowerCase()] || req.headers['paypal-transmission-id'.toUpperCase()];
    const transmissionTime = req.headers['paypal-transmission-time'];
    const certUrl = req.headers['paypal-cert-url'];
    const authAlgo = req.headers['paypal-auth-algo'];
    const transmissionSig = req.headers['paypal-transmission-sig'] || req.headers['paypal-transmission-sig'.toLowerCase()];

    const payload = {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: webhookId,
      webhook_event: req.body
    };

    const verifyResp = await fetch(`${host}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!verifyResp.ok) {
      logger.warn('PayPal verify-webhook-signature failed', { status: verifyResp.status });
      return false;
    }

    const verifyJson = await verifyResp.json();
    logger.info('PayPal verify result', { status: verifyJson.verification_status });
    return (verifyJson.verification_status && verifyJson.verification_status.toUpperCase() === 'SUCCESS');
  } catch (e) {
    logger.error('Error verifying PayPal webhook', e);
    return false;
  }
}

export default {
  handleMpesaCallback,
  handleSafaricomTillCallback,
  handlePayPalWebhook,
  handleBinanceWebhook,
  verifyPaymentManual
};
