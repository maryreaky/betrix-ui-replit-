#!/usr/bin/env node
import fetch from 'node-fetch';
import crypto from 'crypto';

// Usage: set env LIPANA_API_KEY and optionally LIPANA_API_BASE, ENDPOINT_PHONE
const API_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_API_KEY;
const CALLBACK = process.env.LIPANA_CALLBACK_URL || 'https://betrix-ui.onrender.com/webhook/mpesa';
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

async function createTransaction({ phone, amount, currency, reference, callback }){
  const url = `${API_BASE.replace(/\/$/, '')}/v1/transactions`;
  const body = {
    amount,
    currency,
    phone,
    type: 'stk_push',
    reference,
    callback_url: callback,
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
  console.log('Creating STK push', { phone: PHONE, amount: AMOUNT, currency: CURRENCY, reference, callback: CALLBACK });
  try{
    const created = await createTransaction({ phone: PHONE, amount: AMOUNT, currency: CURRENCY, reference, callback: CALLBACK });
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
#!/usr/bin/env node
import fetch from 'node-fetch';

const API_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.argv[2] || process.env.LIPANA_API_KEY;
const PHONE = process.argv[3] || process.env.TO_PHONE || '+254720798611';
const AMOUNT = Number(process.argv[4] || process.env.AMOUNT || 300);
const CALLBACK = process.argv[5] || process.env.CALLBACK_URL || 'https://betrix-ui.onrender.com/webhook/mpesa';

if (!KEY) {
  console.error('LIPANA_API_KEY required as argv[1] or LIPANA_API_KEY env');
  process.exit(2);
}

async function createStk() {
  const url = `${API_BASE}/v1/transactions`;
  const body = {
    amount: AMOUNT,
    currency: 'KES',
    phone: PHONE,
    reference: `betrix_test_${Date.now()}`,
    provider: 'lipana',
    callback_url: CALLBACK,
    description: 'BETRIX KES 300 STK test'
  };

  console.log('POST', url);
  console.log('BODY', body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY
      },
      body: JSON.stringify(body),
      timeout: 15000
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch(e) { json = null; }
    console.log('STATUS', res.status, res.statusText);
    console.log('HEADERS', res.headers.raw ? res.headers.raw() : {});
    console.log('BODY', json || text);
    if (res.ok) return json;
    throw new Error(`Non-OK response ${res.status}`);
  } catch (err) {
    console.error('Error creating STK', err && err.message);
    process.exit(1);
  }
}

createStk().then((j) => { console.log('Done', j); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
