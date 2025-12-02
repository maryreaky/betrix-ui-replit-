#!/usr/bin/env node
// Send two signed POSTs to a webhook endpoint using the provided LIPANA secret.
// Usage:
//   node scripts/send_signed_webhook.js [endpoint] [secret]
// Or set env vars: ENDPOINT and LIPANA_SECRET

import http from 'http';
import https from 'https';
import { URL } from 'url';
import crypto from 'crypto';

const endpoint = process.argv[2] || process.env.ENDPOINT || 'https://betrix-ui.onrender.com/webhook/mpesa';
const secret = process.argv[3] || process.env.LIPANA_SECRET;

if (!secret) {
  console.error('Usage: Provide secret as arg or set LIPANA_SECRET env var');
  process.exit(1);
}

const payload = {
  id: `webhook_test_${Date.now()}`,
  type: 'transaction.update',
  data: {
    transactionId: `TEST_TXN_${Date.now()}`,
    tx_ref: `betrix_test_${Date.now()}`,
    amount: 300,
    currency: 'KES',
    status: 'success',
    phone: '+254720798611',
    provider: 'lipana',
    createdAt: new Date().toISOString(),
  },
};

const body = JSON.stringify(payload);
const bodyBuf = Buffer.from(body, 'utf8');

function computeSignatures(secretKey, buffer) {
  const h = crypto.createHmac('sha256', secretKey).update(buffer).digest('hex');
  const b = crypto.createHmac('sha256', secretKey).update(buffer).digest('base64');
  return { hex: h, base64: b };
}

const sigs = computeSignatures(secret, bodyBuf);

console.log('Endpoint:', endpoint);
console.log('Body length:', bodyBuf.length);
console.log('Computed signatures:');
console.log('  hex:   ', sigs.hex);
console.log('  base64:', sigs.base64);

function postWithSignature(signature, label, cb) {
  const url = new URL(endpoint);
  const options = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + (url.search || ''),
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-lipana-signature': signature,
    },
  };

  const client = url.protocol === 'https:' ? https : http;
  const req = client.request(options, (res) => {
    let data = '';
    res.on('data', (d) => data += d.toString());
    res.on('end', () => {
      console.log(`\nResponse for ${label}: ${res.statusCode} ${res.statusMessage}`);
      console.log('Headers:', res.headers);
      console.log('Body:', data);
      cb && cb(null, { status: res.statusCode, headers: res.headers, body: data });
    });
  });

  req.on('error', (err) => {
    console.error('Request error for', label, err && err.message);
    cb && cb(err);
  });

  req.write(body);
  req.end();
}

postWithSignature(sigs.hex, 'hex', () => {
  postWithSignature(sigs.base64, 'base64', () => {
    console.log('\nAll done.');
  });
});
