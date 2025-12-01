#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_SECRET || process.env.LIPANA_API_KEY;

const candidates = [
  '/api/v1/transactions',
  '/v1/transactions',
  '/api/v1/payments',
  '/v1/payments',
];

const body = {
  type: 'mpesa_stk',
  amount: 300,
  phone: process.argv[2] || '254720798611',
  tx_ref: 'probe_' + Date.now(),
  callback_url: process.env.LIPANA_CALLBACK_URL || ''
};

async function run() {
  if (!KEY) { console.error('Set LIPANA_SECRET or LIPANA_API_KEY'); process.exit(2); }
  for (const ep of candidates) {
    const url = BASE + ep;
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout: 10000 });
      const txt = await resp.text().catch(()=>null);
      console.log('POST', ep, '=>', resp.status, txt && txt.slice(0,1000));
    } catch (err) {
      console.log('POST', ep, '=> ERROR', err.message || err);
    }
  }
}

run();
