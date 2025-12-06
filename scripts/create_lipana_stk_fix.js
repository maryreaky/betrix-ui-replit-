#!/usr/bin/env node
import fetch from 'node-fetch';

// Lightweight fixed STK creation script (safe fallback)
const API_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_API_KEY;
const PHONE = process.argv[2] || process.env.ENDPOINT_PHONE || '+254720798611';
const AMOUNT = Number(process.argv[3] || process.env.AMOUNT || 300);
const CALLBACK = process.env.LIPANA_CALLBACK_URL || process.env.CALLBACK_URL || 'https://betrix-ui.onrender.com/webhook/mpesa';

if (!KEY) {
  console.error('LIPANA_API_KEY required in env');
  process.exit(2);
}

function makeRef() {
  return `betrix_stk_fix_${Date.now()}`;
}

async function createTransaction(phone, amount, reference) {
  const url = `${API_BASE.replace(/\/$/, '')}/v1/transactions`;
  const body = { amount, currency: 'KES', phone, reference, callback_url: CALLBACK, type: 'stk_push', description: `BETRIX KES ${amount} STK` };
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY }, body: JSON.stringify(body), timeout: 15000 });
  const j = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: j };
}

(async function main() {
  const reference = makeRef();
  console.log('Creating STK (fix) ->', { phone: PHONE, amount: AMOUNT, reference });
  try {
    const created = await createTransaction(PHONE, AMOUNT, reference);
    console.log('Create response:', created.status, created.body || created);
    process.exit(created.ok ? 0 : 1);
  } catch (err) {
    console.error('Fatal error', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
