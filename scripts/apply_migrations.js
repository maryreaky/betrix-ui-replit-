#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Pool } = pkg;

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Please set DATABASE_URL env var (postgres connection string)');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = ['001_create_users_payments.sql', '002_create_webhooks.sql'];
    console.log('Applying migrations:', files.join(', '));
    await client.query('BEGIN');
    for (const f of files) {
      const p = path.join(migrationsDir, f);
      if (!fs.existsSync(p)) {
        throw new Error('Missing migration file: ' + p);
      }
      const sql = fs.readFileSync(p, 'utf8');
      console.log('Running', f);
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log('Migrations applied successfully');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('Migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
