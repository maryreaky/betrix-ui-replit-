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
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='webhooks';");
    console.log('Columns for public.webhooks:');
    console.table(res.rows);
  }catch(err){
    console.error('Error querying columns:', err.message);
  }finally{
    await client.end();
  }
}

main();
