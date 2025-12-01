#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const BASE = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_SECRET || process.env.LIPANA_API_KEY;

const endpoints = [
  '/v1/stk/push',
  '/v1/payments/stk',
  '/v1/mpesa/stk',
  '/v1/transactions/stk/push',
  '/v1/transactions',
  '/v1/payments',
  '/v1/mpesa/transactions',
  '/v1',
  '/',
];

async function probe() {
  if (!KEY) { console.error('Set LIPANA_SECRET or LIPANA_API_KEY'); process.exit(2); }
  for (const ep of endpoints) {
    const url = BASE + ep;
    try {
      const resp = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${KEY}` }, timeout: 5000 });
      console.log(ep, '=>', resp.status);
      const txt = await resp.text().catch(() => '');
      if (txt && txt.length < 2000) console.log('  body:', txt.slice(0, 1000));
    } catch (err) {
      console.log(ep, '=> ERROR', err.message || err);
    }
  }
}

probe();
