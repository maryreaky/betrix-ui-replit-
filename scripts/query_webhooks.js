#!/usr/bin/env node
import { Client } from 'pg';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){ console.error('Missing DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try{
    const res = await client.query('SELECT id, event, transaction_id, amount, phone, reference, message, timestamp, raw_payload, created_at FROM webhooks ORDER BY created_at DESC LIMIT 20');
    console.log('Recent webhooks:');
    console.table(res.rows);
  }catch(err){ console.error('Error querying webhooks:', err.message); }
  finally{ await client.end(); }
}

main();
