import { createPending, listPayments } from '../src/lib/local-payments.js';
import fetch from 'node-fetch';
import crypto from 'crypto';

async function run() {
  // 1) create a pending payment locally
  const pending = createPending({ amount: 300, phone: '254741118999' });
  console.log('Created pending payment:', pending);

  // 2) simulate STK accepted (we just print a fake checkout id)
  const checkoutId = 'fake_co_' + Date.now();
  console.log('Simulated STK accepted, CheckoutRequestID=', checkoutId);

  // 3) simulate provider callback via webhook to our local server
  const payload = {
    event: 'transaction.success',
    data: {
      id: pending.tx_ref,
      amount: pending.amount,
      phone: pending.phone,
      transaction_id: 'MPESA_SIM_' + Date.now()
    }
  };

  const body = JSON.stringify(payload);
  const secret = process.env.LIPANA_SECRET;
  if (!secret) {
    console.error('LIPANA_SECRET not set in env for test');
    process.exit(2);
  }

  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const url = process.env.LIPANA_TEST_URL || 'http://localhost:5000/webhook/mpesa';

  console.log('Posting simulated webhook to', url);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lipana-signature': sig },
    body
  });
  console.log('Webhook POST status', resp.status);
  console.log('Response text:', await resp.text());

  // 4) show local payments
  const payments = listPayments();
  console.log('Local payments now:', payments.slice(0,5));
}

run().catch(e=>{ console.error(e); process.exit(1); });
