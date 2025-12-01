#!/usr/bin/env node
import 'dotenv/config';
import { initiateStkPush } from '../src/bot/payments.js';

async function run() {
  const phone = process.argv[2] || process.env.TEST_PHONE;
  const userId = process.argv[3] || process.env.TEST_USER_ID || '123456';
  if (!phone) {
    console.error('Usage: node scripts/run_stk_push.js <phone> [userId]');
    process.exit(2);
  }
  console.log('Starting STK push to', phone);
  try {
    const result = await initiateStkPush({ user_id: userId, msisdn: phone, amount: Number(process.env.TEST_AMOUNT || 300) });
    console.log('STK push result:', result);
  } catch (err) {
    console.error('Error initiating STK push:', err);
    process.exit(1);
  }
}

run();
