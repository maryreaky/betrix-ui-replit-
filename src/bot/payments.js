import { createPayment, updatePaymentStatus } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import mpesa from './mpesa.js';
import lipana from '../lib/lipana-client.js';

// Local M-Pesa STK push helper (stubbed). Creates a pending payment record
// and returns a tx_ref. Real provider integration should replace this.
export async function initiateStkPush({ user_id, msisdn, amount = 300 }) {
  const tx_ref = `betrix_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const payment = {
    id: uuidv4(),
    user_id,
    amount,
    currency: 'KES',
    method: 'mpesa_stk',
    tx_ref,
    status: 'pending',
    metadata: { msisdn }
  };
  await createPayment(payment);

  // If Lipana creds are configured, attempt Lipana STK push
  if (process.env.LIPANA_SECRET || process.env.LIPANA_API_KEY) {
    try {
      const callback = process.env.LIPANA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL;
      const resp = await lipana.stkPush({ amount, phone: msisdn, tx_ref, reference: tx_ref, callback_url: callback });
      // Lipana returns created transaction data under resp.raw.data.transactionId (or resp.raw.data._id)
      const checkout = resp?.raw?.data?.transactionId || resp?.raw?.data?._id || null;
      if (checkout && resp.status >= 200 && resp.status < 300) {
        await updatePaymentStatus(tx_ref, 'initiated', checkout, { provider_checkout_id: checkout, lipana_response: resp.raw });
      }
      return { tx_ref, provider_response: resp.raw, statusCode: resp.status };
    } catch (err) {
      console.error('Lipana STK push error', err);
      return { tx_ref, error: String(err.message || err) };
    }
  }

  // If MPESA env is configured, attempt a real STK push.
  if (process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET) {
    try {
      const resp = await mpesa.stkPush({ amount, phone: msisdn });
      // record provider checkout id if present
      const checkout = resp?.raw?.CheckoutRequestID || resp?.raw?.MerchantRequestID || null;
      if (checkout) {
        await updatePaymentStatus(tx_ref, 'initiated', checkout, { provider_checkout_id: checkout, mpesa_response: resp.raw });
      }
      return { tx_ref, provider_response: resp.raw };
    } catch (err) {
      console.error('MPESA STK push error', err);
      // leave payment as pending and return error message
      return { tx_ref, error: String(err.message || err) };
    }
  }

  // Fallback stub behavior
  return { tx_ref, provider_response: { message: 'stubbed STK push queued' } };
}

// Handle an incoming M-Pesa webhook / callback. This will update payment
// status by tx_ref and return the updated payment row.
export async function handleMpesaCallback({ tx_ref, status, provider_tx_id = null, metadata = {} }) {
  // Normalize status to expected values
  const normalized = (status === 'SUCCESS' || status === 'success' || status === 'OK') ? 'success' : (status === 'FAILED' || status === 'failed') ? 'failed' : 'pending';
  try {
    const updated = await updatePaymentStatus(tx_ref, normalized, provider_tx_id, metadata);
    return updated;
  } catch (err) {
    // If DB is not reachable or payment not found, return a best-effort simulated result
    console.warn('handleMpesaCallback fallback - DB update failed or payment not found', String(err.message || err));
    return {
      tx_ref,
      status: normalized,
      tx_id: provider_tx_id,
      metadata,
      note: 'simulated - DB update not performed'
    };
  }
}

export async function verifyPayment(tx_ref) {
  // For now simply return DB state; real implementation would call provider
  // or rely on webhook verification.
  // We'll keep this placeholder to avoid breaking callers.
  return { tx_ref };
}
