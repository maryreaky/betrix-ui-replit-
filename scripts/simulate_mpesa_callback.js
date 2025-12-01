#!/usr/bin/env node
import { handleMpesaCallback } from '../src/bot/payments.js';

async function main() {
  const checkout = process.argv[2] || 'ws_CO_30112025170112192708374149';
  const receipt = process.argv[3] || 'ABC123XYZ';
  console.log('Simulating Daraja STK callback for', checkout);
  const payload = {
    tx_ref: checkout,
    status: 'SUCCESS',
    provider_tx_id: receipt,
    metadata: { simulated: true, CheckoutRequestID: checkout, MpesaReceiptNumber: receipt }
  };
  try {
    const res = await handleMpesaCallback(payload);
    console.log('Callback handler result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Simulation error:', err);
    process.exit(1);
  }
}

main();
