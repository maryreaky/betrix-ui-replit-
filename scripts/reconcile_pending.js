#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';
import { Client } from 'pg';

const LIPANA_API = process.env.LIPANA_API_BASE || 'https://api.lipana.dev';
const KEY = process.env.LIPANA_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if(!DATABASE_URL){ console.error('DATABASE_URL required'); process.exit(2); }

async function getPendingPayments(){
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try{
    const res = await client.query("SELECT id, tx_ref, metadata->>'provider_checkout_id' AS provider_checkout_id FROM payments WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50");
    return { client, rows: res.rows };
  }catch(err){ await client.end(); throw err; }
}

async function queryLipanaByReference(reference){
  const url = `${LIPANA_API}/v1/transactions?reference=${encodeURIComponent(reference)}`;
  const resp = await fetch(url, { headers: { 'x-api-key': KEY }, timeout: 10000 });
  try{ const j = await resp.json(); return j; } catch(e){ return null; }
}

async function updatePaymentStatusInDb(client, tx_ref, status, tx_id, metadata){
  const q = `UPDATE payments SET status = $1, tx_id = COALESCE($3, tx_id), metadata = jsonb_strip_nulls(coalesce(metadata, '{}'::jsonb) || $4::jsonb), updated_at = now() WHERE tx_ref = $2 RETURNING *;`;
  const vals = [status, tx_ref, tx_id, metadata || {}];
  const { rows } = await client.query(q, vals);
  return rows[0] || null;
}

async function main(){
  if(!KEY) { console.error('LIPANA_API_KEY required in env'); process.exit(2); }
  const { client, rows } = await getPendingPayments();
  console.log('Found', rows.length, 'pending payments to reconcile');
  for(const p of rows){
    const ref = p.tx_ref;
    try{
      const j = await queryLipanaByReference(ref);
      const status = j?.data && j.data[0] && j.data[0].status;
      console.log(ref, 'lipana status=', status);
      if(status && (status.toLowerCase()==='success' || status.toLowerCase()==='failed' || status.toLowerCase()==='timeout')){
        const tx_id = j.data[0].transactionId || j.data[0]._id || null;
        const updated = await updatePaymentStatusInDb(client, ref, status.toLowerCase(), tx_id, { lipana: j.data[0] });
        console.log('Updated payment', updated?.tx_ref || ref, '->', status);
      }
    }catch(err){
      console.error('Error reconciling', ref, err.message || err);
    }
  }
  await client.end();
}

main().catch(e=>{ console.error('Fatal', e); process.exit(1); });
