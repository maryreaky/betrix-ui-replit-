import fetch from 'node-fetch';
import crypto from 'crypto';

async function run() {
  const payload = {
    event: 'transaction.success',
    data: {
      id: 'test-tx-' + new Date().toISOString().replace(/[:.]/g,'-'),
      amount: 300,
      phone: '254741118999'
    }
  };

  const body = JSON.stringify(payload);
  const secret = process.env.LIPANA_SECRET;
  if (!secret) {
    console.error('LIPANA_SECRET not set');
    process.exit(2);
  }

  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const url = process.env.LIPANA_TEST_URL || 'https://pseudoasymmetrical-fibrillose-racheal.ngrok-free.dev/webhook/mpesa';

  console.log('Posting to', url);
  console.log('Payload:', body);
  console.log('Signature:', sig);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lipana-signature': sig
      },
      body
    });
    const text = await resp.text();
    console.log('Status:', resp.status);
    console.log('Response:', text);
  } catch (err) {
    console.error('POST failed', err);
    process.exit(1);
  }
}

run();
