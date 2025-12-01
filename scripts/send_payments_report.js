#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';
const { createClient } = await import('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(2);
}
if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or ADMIN_TELEGRAM_ID');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function getRecent() {
  const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(12);
  if (error) throw error;
  return data || [];
}

function formatPayments(items) {
  if (!items || items.length === 0) return 'No payments found.';
  return items.map(p => {
    const when = p.created_at ? new Date(p.created_at).toISOString().replace('T',' ').replace('Z','') : '';
    const phone = p.phone_number || (p.metadata && p.metadata.msisdn) || '';
    return `• ${p.tx_ref || p.id} — ${p.status} — ${p.amount} ${p.currency || ''} — ${phone} — ${when}`;
  }).join('\n');
}

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = { chat_id: Number(ADMIN_TELEGRAM_ID), text, disable_web_page_preview: true };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!json.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function main() {
  try {
    const items = await getRecent();
    const msg = formatPayments(items);
    console.log('Sending report to admin...');
    const r = await sendMessage(msg);
    console.log('Sent. Telegram response id:', r.result?.message_id);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

main();
