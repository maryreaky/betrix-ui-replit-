import { createPending, listPayments, updateStatusByProviderEventId } from '../src/lib/local-payments.js';
import { betrixIngest } from '../src/lib/betrix-ingest.js';

async function run() {
  console.log('Creating a local pending payment...');
  const pending = createPending({ amount: 300, phone: '254741118999' });
  console.log('Pending created:', pending);

  const payload = {
    event: 'transaction.success',
    data: {
      id: pending.tx_ref,
      amount: pending.amount,
      phone: pending.phone,
      transaction_id: 'MPESA_SIM_' + Date.now()
    }
  };

  console.log('Calling betrixIngest with payload (this will log locally if Supabase not configured)');
  try {
    const resp = await betrixIngest(payload);
    console.log('betrixIngest result:', resp ? JSON.stringify(resp).slice(0, 400) : 'null');
  } catch (e) {
    console.error('betrixIngest threw:', e && e.message ? e.message : e);
  }

  console.log('Updating local payment status by provider event id...');
  const updated = updateStatusByProviderEventId(pending.tx_ref, 'success', { provider: 'lipana' });
  console.log('Updated payment:', updated);

  console.log('Current payments (top 5):', listPayments().slice(0,5));
}

run().catch(e => { console.error(e); process.exit(1); });
