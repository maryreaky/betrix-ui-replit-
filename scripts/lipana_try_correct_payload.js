#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const pub = process.env.LIPANA_API_KEY || '';
const phone = process.argv[2] || '254720798611';
const reference = process.argv[3] || 'betrix_' + Date.now();

async function run() {
  if (!pub) { console.error('Set LIPANA_API_KEY (publishable) in env'); process.exit(2); }
  const url = BASE + '/v1/transactions';
  const body = { amount: 300, phone, reference };
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': pub }, body: JSON.stringify(body), timeout: 15000 });
    const txt = await resp.text().catch(()=>null);
    console.log('status', resp.status, 'body', txt);
  } catch (err) {
    console.error('error', err.message || err);
  }
}

run();
