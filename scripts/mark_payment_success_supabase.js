#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY in env');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  let txRef = process.argv[2];
  if (!txRef) {
    // find most recent pending payment
    const { data: rows, error } = await supabase.from('payments').select('*').eq('status','pending').order('created_at',{ascending:false}).limit(1);
    if (error) { console.error('Query error', error); process.exit(1); }
    if (!rows || rows.length === 0) { console.log('No pending payments found'); process.exit(0); }
    txRef = rows[0].tx_ref;
    console.log('Found pending tx_ref', txRef);
  }

  const updates = { status: 'success' };
  const { data, error } = await supabase.from('payments').update(updates).eq('tx_ref', txRef).select().maybeSingle();
  if (error) { console.error('Update error', error); process.exit(1); }
  console.log('Payment updated:', data);
}

run().catch(e=>{ console.error(e); process.exit(1); });
