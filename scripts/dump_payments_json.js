#!/usr/bin/env node
import { Client } from 'pg';
import fs from 'fs/promises';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){ console.error('Missing DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try{
    const res = await client.query("SELECT id, user_id, tx_ref, tx_id, status, amount, currency, metadata, created_at, updated_at FROM payments ORDER BY created_at DESC LIMIT 200");
    const out = res.rows.map(r => ({ id: r.id, user_id: r.user_id, tx_ref: r.tx_ref, tx_id: r.tx_id, status: r.status, amount: r.amount, currency: r.currency, metadata: r.metadata, created_at: r.created_at }));
    await fs.writeFile('payments_recent.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote payments_recent.json', out.length, 'rows');
  }catch(err){ console.error('Error dumping payments:', err.message); process.exitCode = 1; }
  finally{ await client.end(); }
}

main();
