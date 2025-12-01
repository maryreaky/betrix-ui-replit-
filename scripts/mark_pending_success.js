#!/usr/bin/env node
import { listPayments, updateStatusByProviderEventId } from '../src/lib/local-payments.js';

async function run() {
  const payments = listPayments();
  const pending = payments.find(p => p.status === 'pending');
  if (!pending) {
    console.log('No pending payments found');
    process.exit(0);
  }
  const updated = updateStatusByProviderEventId(pending.tx_ref, 'success', { provider: pending.provider, note: 'manual simulation' });
  console.log('Updated payment:', updated);
}

run().catch(e => { console.error(e); process.exit(1); });
