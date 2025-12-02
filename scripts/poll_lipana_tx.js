#!/usr/bin/env node
import fetch from 'node-fetch';

const API_BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.argv[2] || process.env.LIPANA_API_KEY;
const REF = process.argv[3] || process.env.REFERENCE;
const INTERVAL = Number(process.argv[4] || process.env.POLL_INTERVAL || 5000);
const TIMEOUT = Number(process.argv[5] || process.env.POLL_TIMEOUT || 3 * 60 * 1000);

if (!KEY) { console.error('LIPANA_API_KEY required'); process.exit(2); }
if (!REF) { console.error('REFERENCE required'); process.exit(2); }

async function query() {
  const url = `${API_BASE}/v1/transactions?reference=${encodeURIComponent(REF)}`;
  try {
    const res = await fetch(url, { headers: { 'x-api-key': KEY }, timeout: 10000 });
    const j = await res.json();
    return j;
  } catch (e) { throw e; }
}

async function poll() {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    try {
      const j = await query();
      console.log(new Date().toISOString(), JSON.stringify(j));
      const status = j?.data && j.data[0] && j.data[0].status;
      if (status && ['success','failed','timeout','cancelled'].includes(status.toLowerCase())) {
        console.log('Terminal status:', status);
        return j;
      }
    } catch (e) {
      console.error('Query error', e.message || e);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  console.error('Polling timed out');
  process.exit(1);
}

poll().then(j => { console.log('Done', j); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
