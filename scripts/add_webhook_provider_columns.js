#!/usr/bin/env node
import { Client } from 'pg';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){
    console.error('Missing DATABASE_URL'); process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl});
  await client.connect();
  try{
    const sql = `
      ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS provider text;
      ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS provider_event text;
      ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS provider_event_id text;
      ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS provider_payload jsonb;
      ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS created_at timestamptz default now();
    `;
    await client.query(sql);
    console.log('Added missing provider columns (if any)');
  }catch(err){
    console.error('Error adding columns:', err.message);
    process.exitCode = 1;
  }finally{
    await client.end();
  }
}

main();
