#!/usr/bin/env node
import fetch from 'node-fetch';
import crypto from 'crypto';

const tx = process.argv[2];
const url = process.argv[3] || process.env.LIPANA_TEST_URL || 'https://pseudoasymmetrical-fibrillose-racheal.ngrok-free.dev/webhook/mpesa';
const secret = process.env.LIPANA_SECRET;

if (!tx) {
  console.error('Usage: node scripts/post_signed_webhook.js <tx_ref> [webhook_url]');
  process.exit(2);
}
if (!secret) {
  console.error('LIPANA_SECRET must be set in env');
  process.exit(2);
}

const payload = { event: 'transaction.success', data: { id: tx, amount: 300, phone: '254741118999' } };
const body = JSON.stringify(payload);
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

async function run() {
  console.log('Posting signed webhook for', tx, 'to', url);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lipana-signature': sig }, body });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

run().catch(e => { console.error('Error posting webhook', e); process.exit(1); });
