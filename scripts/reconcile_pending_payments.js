#!/usr/bin/env node
/**
 * Simple reconciliation helper
 * Scans `payments` table for pending entries older than a threshold and logs them.
 * Run: node scripts/reconcile_pending_payments.js
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const thresholdMinutes = Number(process.env.RECONCILE_MINUTES || 5);
    const q = `SELECT id, tx_ref, status, amount, currency, method, created_at, metadata, tx_id FROM payments WHERE status = 'pending' AND created_at < (now() - ($1 || '5 minutes')::interval) ORDER BY created_at ASC LIMIT 200`;
    const { rows } = await pool.query(q, [`${thresholdMinutes} minutes`]);
    if (!rows || rows.length === 0) {
      console.log(`No pending payments older than ${thresholdMinutes} minutes`);
      process.exit(0);
    }
    console.log(`Found ${rows.length} pending payments older than ${thresholdMinutes} minutes:`);
    for (const r of rows) {
      console.log(`- tx_ref=${r.tx_ref} id=${r.id} status=${r.status} amount=${r.amount}${r.currency || ''} method=${r.method} created_at=${r.created_at} tx_id=${r.tx_id || ''}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Reconcile failed', err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
