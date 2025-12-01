#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const secret = process.env.LIPANA_SECRET || '';
const pub = process.env.LIPANA_API_KEY || '';
const phone = process.argv[2] || '254720798611';

const variants = [
  { name: 'Authorization: Bearer secret', headers: { 'Authorization': `Bearer ${secret}` } },
  { name: 'Authorization: Bearer publishable', headers: { 'Authorization': `Bearer ${pub}` } },
  { name: 'x-api-key publishable', headers: { 'x-api-key': pub } },
  { name: 'x-lipana-key publishable', headers: { 'x-lipana-key': pub } },
  { name: 'x-publishable-key', headers: { 'x-publishable-key': pub } },
  { name: 'x-secret-key', headers: { 'x-secret-key': secret } },
];

const url = BASE + '/v1/transactions';
const body = { type: 'mpesa_stk', amount: 300, phone, tx_ref: 'authprobe_' + Date.now(), callback_url: process.env.LIPANA_CALLBACK_URL || '' };

async function run() {
  for (const v of variants) {
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...v.headers }, body: JSON.stringify(body), timeout: 10000 });
      const txt = await resp.text().catch(()=>null);
      console.log(v.name, '=>', resp.status, txt && txt.slice(0,1000));
    } catch (err) {
      console.log(v.name, '=> ERROR', err.message || err);
    }
  }
}

run();
