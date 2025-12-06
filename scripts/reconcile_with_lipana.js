#!/usr/bin/env node
/**
 * Reconcile pending payments with Lipana (CLI wrapper)
 * Run: node scripts/reconcile_with_lipana.js
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { reconcileWithLipana } from '../src/tasks/reconcile-lipana.js';
import TelegramService from '../src/services/telegram.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const telegram = new (await import('../src/services/telegram.js')).TelegramService(process.env.TELEGRAM_TOKEN || '', 3000);

async function main() {
  try {
    const thresholdMinutes = Number(process.env.RECONCILE_MINUTES || 5);
    const adminId = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;
    const result = await reconcileWithLipana({ pool, telegram, thresholdMinutes, adminId });
    console.log('Reconcile result:', result.summary || result);
    process.exit(0);
  } catch (err) {
    console.error('Reconcile with Lipana failed', err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
