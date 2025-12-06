#!/usr/bin/env node
import fetch from 'node-fetch';

// Fixed STK creation + poll script for Lipana
// Usage: set env LIPANA_API_KEY and optionally LIPANA_API_BASE, LIPANA_callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
const API_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_API_KEY;
const callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
const PHONE = process.argv[2] || process.env.ENDPOINT_PHONE || '+254720798611';
const AMOUNT = Number(process.argv[3] || process.env.AMOUNT || 300);
const CURRENCY = process.env.CURRENCY || 'KES';

if (!KEY) {
  console.error('LIPANA_API_KEY required in env');
  process.exit(2);
}

function makeRef() {
  return `betrix_stk_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}

async function createTransaction({ phone, amount, currency, reference, callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
  const url = `${API_BASE.replace(/\/$/, '')}/v1/transactions`;
  const body = {
    amount,
    currency,
    phone,
    type: 'stk_push',
    reference,
    callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
    description: `BETRIX KES ${amount} STK push`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
    },
    body: JSON.stringify(body),
    timeout: 15000,
  });

  const j = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: j };
}

async function queryByReference(reference){
  const url = `${API_BASE.replace(/\/$/, '')}/v1/transactions?reference=${encodeURIComponent(reference)}`;
  const res = await fetch(url, { headers: { 'x-api-key': KEY }, timeout: 10000 });
  const j = await res.json().catch(() => null);
  return { status: res.status, body: j };
}

(async function main(){
  const reference = makeRef();
  console.log('Creating STK push', { phone: PHONE, amount: AMOUNT, currency: CURRENCY, reference, callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
  try{
    const created = await createTransaction({ phone: PHONE, amount: AMOUNT, currency: CURRENCY, reference, callback: "https://betrix-ui.onrender.com/webhook/mpesa",`n  payoutAccount: process.env.PAYOUT_ACCOUNT || "6062105"
    console.log('Create response:', created.status, JSON.stringify(created.body || created, null, 2));

    if (!created.ok) {
      console.error('Create failed; aborting poll.');
      process.exit(1);
    }

    console.log('Polling Lipana for transaction status... (timeout 120s)');
    const deadline = Date.now() + 120000;
    let last = null;
    while (Date.now() < deadline) {
      const q = await queryByReference(reference);
      const rows = q.body && q.body.data ? q.body.data : null;
      const item = rows && rows.length ? rows[0] : null;
      const status = item && (item.status || item.state) ? (item.status || item.state) : null;
      if (JSON.stringify(item) !== JSON.stringify(last)) {
        console.log('Polled:', new Date().toISOString(), 'status=', status, 'item=', JSON.stringify(item || q.body || {}, null, 2));
        last = item || q.body;
      }
      if (status && ['success','failed','timeout','cancelled'].includes(String(status).toLowerCase())){
        console.log('Terminal status reached:', status);
        process.exit(0);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    console.log('Polling timed out, last seen:', JSON.stringify(last || {}, null, 2));
    process.exit(0);
  }catch(err){
    console.error('Fatal error', err && err.message || err);
    process.exit(2);
  }
})();
