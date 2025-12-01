#!/usr/bin/env node
import { Client } from 'pg';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){
    console.error('Missing DATABASE_URL'); process.exit(1);
  }
  const userId = process.argv[2] || '123456';
  const msisdn = process.argv[3];
  if(!msisdn){
    console.error('Usage: node update_user_msisdn.js <userId> <msisdn>'); process.exit(2);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try{
    const q = `INSERT INTO users (user_id, full_name, msisdn)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id) DO UPDATE SET msisdn = EXCLUDED.msisdn, updated_at = now()`;
    await client.query(q, [Number(userId), 'Test User', msisdn]);
    console.log('User upserted:', userId, msisdn);
  }catch(err){
    console.error('Error upserting user:', err.message);
    process.exitCode = 1;
  }finally{
    await client.end();
  }
}

main();
