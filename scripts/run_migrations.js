#!/usr/bin/env node
// Simple migration runner: applies all .sql files in migrations/ in filename order
import fs from 'fs/promises';
import path from 'path';

async function main(){
  const databaseUrl = process.env.DATABASE_URL;
  if(!databaseUrl){
    console.error('Missing DATABASE_URL environment variable');
    process.exit(1);
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  try{
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f=>f.endsWith('.sql')).sort();
    if(sqlFiles.length===0){
      console.log('No .sql migration files found in', migrationsDir);
      await client.end();
      return;
    }
    for(const file of sqlFiles){
      const full = path.join(migrationsDir, file);
      console.log('Applying', file);
      const sql = await fs.readFile(full, 'utf8');
      try{
        await client.query(sql);
        console.log('Applied', file);
      }catch(err){
        console.error('Error applying', file, err.message);
        throw err;
      }
    }
    console.log('All migrations applied');
  }catch(err){
    console.error('Migration runner error:', err.message);
    process.exitCode = 1;
  }finally{
    await client.end();
  }
}

main();
