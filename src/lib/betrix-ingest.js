import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_PATH = path.join(LOG_DIR, 'webhook_ingest.log');

function writeLocalLog(line) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch (e) { console.error('writeLocalLog failed', e); }
}

export async function betrixIngest(payload) {
  const record = {
    provider: 'lipana',
    provider_event: payload.event || null,
    provider_event_id: payload.data && (payload.data.id || payload.data.transaction_id) || null,
    provider_payload: payload,
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    writeLocalLog(`${new Date().toISOString()} NO_SUPABASE ${JSON.stringify(record)}`);
    return null;
  }

  // Try to persist into the existing `payments` table if present (preferred)
  try {
    const paymentsRecord = {
      tx_ref: record.provider_event_id || `tx_${Date.now()}`,
      amount: payload?.data?.amount || null,
      currency: payload?.data?.currency || 'KES',
      phone_number: payload?.data?.phone || null,
      provider: 'lipana',
      status: 'success',
      metadata: record.provider_payload,
      created_at: record.created_at,
    };

    const { data: payData, error: payErr } = await supabase
      .from('payments')
      .insert(paymentsRecord)
      .select();

    if (payErr) {
      // If payments table doesn't exist or insert fails, fallback to webhooks table
      writeLocalLog(`${new Date().toISOString()} PAYMENTS_INSERT_ERROR ${JSON.stringify(payErr)}`);
      throw payErr;
    }
    return payData;
  } catch (err) {
    // fallback: try to insert into webhooks table
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .insert(record)
        .select();
      if (error) {
        writeLocalLog(`${new Date().toISOString()} WEBHOOKS_INSERT_ERROR ${JSON.stringify(error)}`);
        throw error;
      }
      return data;
    } catch (err2) {
      writeLocalLog(`${new Date().toISOString()} INGEST_FAILED ${JSON.stringify(err2)}`);
      console.error('Supabase ingest error', err2);
      throw err2;
    }
  }
}
