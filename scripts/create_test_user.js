#!/usr/bin/env node
import { Client } from 'pg';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){
    console.error('Missing DATABASE_URL'); process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try{
    const q = `INSERT INTO users (user_id, full_name, msisdn, country) VALUES ($1,$2,$3,$4)
               ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, msisdn = EXCLUDED.msisdn, country = EXCLUDED.country, updated_at = now()`;
    const vals = [123456, 'Test User', '254720798611', 'KE'];
    await client.query(q, vals);
    console.log('Test user upserted (user_id=123456)');
  }catch(err){
    console.error('Error creating test user:', err.message);
    process.exitCode = 1;
  }finally{
    await client.end();
  }
}

main();
