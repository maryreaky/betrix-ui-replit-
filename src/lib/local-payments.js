import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const PAYMENTS_PATH = path.join(DATA_DIR, 'payments.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PAYMENTS_PATH)) fs.writeFileSync(PAYMENTS_PATH, JSON.stringify([]));
}

export function listPayments() {
  ensure();
  return JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf8'));
}

export function createPending({ amount = 300, phone = '254741118999', provider = 'lipana' } = {}) {
  ensure();
  const p = {
    id: randomUUID(),
    tx_ref: `tx_${Date.now()}`,
    amount,
    phone,
    provider,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const arr = listPayments();
  arr.unshift(p);
  fs.writeFileSync(PAYMENTS_PATH, JSON.stringify(arr, null, 2));
  return p;
}

export function updateStatusByProviderEventId(providerEventId, status, meta = {}) {
  ensure();
  const arr = listPayments();
  const idx = arr.findIndex(p => p.tx_ref === providerEventId || p.id === providerEventId || p.provider_event_id === providerEventId);
  if (idx === -1) return null;
  arr[idx].status = status;
  arr[idx].updated_at = new Date().toISOString();
  if (meta) arr[idx].meta = meta;
  fs.writeFileSync(PAYMENTS_PATH, JSON.stringify(arr, null, 2));
  return arr[idx];
}

export function findByProviderEventId(providerEventId) {
  ensure();
  const arr = listPayments();
  return arr.find(p => p.tx_ref === providerEventId || p.id === providerEventId || p.provider_event_id === providerEventId) || null;
}
