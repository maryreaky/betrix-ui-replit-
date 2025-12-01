#!/usr/bin/env node
import 'dotenv/config';
import lipana from '../src/lib/lipana-client.js';

async function run() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('Usage: node scripts/debug_lipana_raw.js <phone>');
    process.exit(2);
  }
  console.log('Debug Lipana STK push to', phone);
  try {
    const resp = await lipana.stkPush({ amount: 300, phone, tx_ref: 'debug_' + Date.now(), callback_url: process.env.LIPANA_CALLBACK_URL });
    console.log('Lipana raw response:', JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error('Lipana call failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
