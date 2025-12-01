#!/usr/bin/env node
import { Client } from 'pg';
import fs from 'fs/promises';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){ console.error('Missing DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try{
    const res = await client.query('SELECT id, event, transaction_id, amount, phone, reference, message, timestamp, raw_payload, created_at FROM webhooks ORDER BY created_at DESC LIMIT 200');
    const out = res.rows.map(r => ({ id: r.id, event: r.event, transaction_id: r.transaction_id, amount: r.amount, phone: r.phone, reference: r.reference, message: r.message, timestamp: r.timestamp, created_at: r.created_at }));
    await fs.writeFile('webhooks_recent.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote webhooks_recent.json', out.length, 'rows');
  }catch(err){ console.error('Error dumping webhooks:', err.message); process.exitCode = 1; }
  finally{ await client.end(); }
}

main();
