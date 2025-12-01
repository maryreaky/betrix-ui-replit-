#!/usr/bin/env node
import 'dotenv/config';
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await supabase.from('payments').select('tx_ref, metadata, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error('Supabase query error', error);
    process.exit(2);
  }
  if (!data) {
    console.error('No payments found');
    process.exit(1);
  }
  console.log(data.tx_ref || data.metadata?.provider_checkout_id || data.tx_id || data.id);
}

main();
