import fetch from 'node-fetch';

const LIPANA_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
// For server-side transaction creation Lipana expects the publishable key in 'x-api-key'
const LIPANA_PUBLISHABLE = process.env.LIPANA_API_KEY || '';

async function stkPush({ amount, phone, reference, tx_ref, callback_url }) {
  if (!LIPANA_PUBLISHABLE) throw new Error('LIPANA_API_KEY (publishable) not set');
  const url = `${LIPANA_BASE}/v1/transactions`;
  const body = {
    amount,
    phone,
    reference: reference || tx_ref || `betrix_${Date.now()}`,
    callback_url: callback_url || undefined
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': LIPANA_PUBLISHABLE
    },
    body: JSON.stringify(body),
    timeout: 20000
  });

  let parsed = null;
  try { parsed = await resp.json(); } catch (e) { /* ignore */ }
  return { status: resp.status, raw: parsed || null };
}

async function getTransaction(transactionId) {
  if (!LIPANA_PUBLISHABLE) throw new Error('LIPANA_API_KEY (publishable) not set');
  const url = `${LIPANA_BASE}/v1/transactions/${encodeURIComponent(String(transactionId))}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': LIPANA_PUBLISHABLE
    },
    timeout: 15000
  });
  let parsed = null;
  try { parsed = await resp.json(); } catch (e) { /* ignore */ }
  return { status: resp.status, raw: parsed || null };
}

export default { stkPush, getTransaction };
