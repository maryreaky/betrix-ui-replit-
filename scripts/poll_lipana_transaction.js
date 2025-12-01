#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const API = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_API_KEY;
const reference = process.argv[2];
const interval = Number(process.argv[3] || 5);
const attempts = Number(process.argv[4] || 12);

if (!KEY) { console.error('Set LIPANA_API_KEY in env'); process.exit(2); }
if (!reference) { console.error('Usage: node poll_lipana_transaction.js <reference> [intervalSeconds] [attempts]'); process.exit(2); }

async function check() {
  const url = `${API}/v1/transactions?reference=${encodeURIComponent(reference)}`;
  const resp = await fetch(url, { headers: { 'x-api-key': KEY }, timeout: 10000 });
  const json = await resp.json().catch(()=>null);
  return json;
}

async function run() {
  for (let i=0;i<attempts;i++) {
    try {
      const res = await check();
      const status = res?.data && res.data[0] && res.data[0].status;
      console.log(new Date().toISOString(), 'attempt', i+1, 'status=', status || JSON.stringify(res));
      if (status && (status.toLowerCase() === 'success' || status.toLowerCase() === 'failed' || status.toLowerCase() === 'timeout')) {
        console.log('Terminal status reached:', status);
        process.exit(0);
      }
    } catch (err) {
      console.log('Check error', err.message || err);
    }
    await new Promise(r=>setTimeout(r, interval*1000));
  }
  console.log('No terminal status after attempts');
  process.exit(1);
}

run();
