import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const USE_SUPABASE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);

let pool = null;
let supabase = null;
if (USE_SUPABASE) {
  // Lazy import to keep startup fast when not used
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false }
  });
  console.log('DB: using Supabase client for DB operations');
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

export async function upsertUser(user) {
  if (USE_SUPABASE) {
    const payload = {
      user_id: user.user_id,
      full_name: user.full_name || null,
      msisdn: user.msisdn || null,
      country: user.country || null,
      status: user.status || 'trial',
      metadata: user.metadata || {}
    };
    const { data, error } = await supabase.from('users').upsert(payload, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return data;
  }
  const q = `
    INSERT INTO users (user_id, full_name, msisdn, country, status, metadata, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,now(),now())
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      msisdn = EXCLUDED.msisdn,
      country = EXCLUDED.country,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING *;
  `;
  const values = [user.user_id, user.full_name, user.msisdn || null, user.country || null, user.status || 'trial', user.metadata || {}];
  const { rows } = await pool.query(q, values);
  return rows[0];
}

export async function createPayment(payment) {
  if (USE_SUPABASE) {
    const payload = {
      id: payment.id,
      user_id: payment.user_id,
      amount: payment.amount,
      currency: payment.currency || 'KES',
      method: payment.method || 'mpesa',
      phone_number: payment.phone_number || payment.msisdn || payment.metadata?.msisdn || null,
      tx_ref: payment.tx_ref || null,
      status: payment.status || 'pending',
      metadata: payment.metadata || {}
    };
    const { data, error } = await supabase.from('payments').insert(payload).select().single();
    if (error) throw error;
    return data;
  }
  const q = `
    INSERT INTO payments (id, user_id, amount, currency, method, tx_ref, status, metadata, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
    RETURNING *;
  `;
  const values = [payment.id, payment.user_id, payment.amount, payment.currency || 'KES', payment.method || 'mpesa', payment.tx_ref || null, payment.status || 'pending', payment.metadata || {}];
  const { rows } = await pool.query(q, values);
  return rows[0];
}

export async function getUserById(user_id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('users').select('*').eq('user_id', user_id).limit(1).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const q = `SELECT * FROM users WHERE user_id = $1 LIMIT 1`;
  const { rows } = await pool.query(q, [user_id]);
  return rows[0] || null;
}

export async function updatePaymentStatus(tx_ref, status, tx_id = null, metadata = {}) {
  if (USE_SUPABASE) {
    const updates = { status, metadata };
    if (tx_id) updates.tx_id = tx_id;
    const { data, error } = await supabase.from('payments').update(updates).eq('tx_ref', tx_ref).select().maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const q = `
    UPDATE payments SET status = $1, metadata = jsonb_strip_nulls(coalesce(metadata, '{}'::jsonb) || $4::jsonb), tx_id = COALESCE($3, tx_id), updated_at = now()
    WHERE tx_ref = $2
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [status, tx_ref, tx_id, metadata]);
  return rows[0] || null;
}

export async function getPaymentByProviderCheckout(checkoutId) {
  if (USE_SUPABASE) {
    // metadata->>'provider_checkout_id' equivalent in Supabase SQL is performed via filter on metadata
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .or(`metadata->>provider_checkout_id.eq.${checkoutId},tx_id.eq.${checkoutId}`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const q = `SELECT * FROM payments WHERE (metadata->>'provider_checkout_id') = $1 OR tx_id = $1 LIMIT 1`;
  const { rows } = await pool.query(q, [checkoutId]);
  return rows[0] || null;
}

export async function getPaymentByTxRef(tx_ref) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('payments').select('*').eq('tx_ref', tx_ref).limit(1).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const q = `SELECT * FROM payments WHERE tx_ref = $1 LIMIT 1`;
  const { rows } = await pool.query(q, [tx_ref]);
  return rows[0] || null;
}

export async function getRecentPayments(limit = 10) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  }
  const q = `SELECT * FROM payments ORDER BY created_at DESC LIMIT $1`;
  const { rows } = await pool.query(q, [limit]);
  return rows || [];
}

export default pool;
