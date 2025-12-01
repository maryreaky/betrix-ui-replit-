#!/usr/bin/env node
import 'dotenv/config';
import { betrixIngest } from '../src/lib/betrix-ingest.js';

async function run() {
  const payload = {
    event: 'test.event',
    data: { id: `test_${Date.now()}`, amount: 1, phone: '254700000000' }
  };
  try {
    console.log('Running betrixIngest test...');
    const res = await betrixIngest(payload);
    console.log('Ingest result:', res);
  } catch (err) {
    console.error('Ingest failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
