#!/usr/bin/env node
import 'dotenv/config';
import mpesa from '../src/bot/mpesa.js';

async function main() {
  const phone = process.argv[2] || process.env.TEST_PHONE;
  const amount = Number(process.argv[3] || process.env.TEST_AMOUNT || 1);
  if (!phone) {
    console.error('Usage: node scripts/run_stk_direct.js <phone> [amount]');
    process.exit(2);
  }
  console.log('Calling Daraja STK push (direct) to', phone, 'amount', amount);
  try {
    const resp = await mpesa.stkPush({ phone, amount });
    console.log('Daraja response:', JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error('Daraja STK push error:', err);
    process.exit(1);
  }
}

main();
