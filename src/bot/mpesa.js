import crypto from 'crypto';

// Minimal Safaricom Daraja (M-Pesa) client for STK push using till/shortcode.
// Configuration is supplied via environment variables at runtime only.

const DEFAULTS = {
  env: process.env.MPESA_ENV || 'sandbox',
  consumerKey: process.env.MPESA_CONSUMER_KEY || null,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || null,
  shortcode: process.env.MPESA_SHORTCODE || null,
  passkey: process.env.MPESA_PASSKEY || null,
  callbackUrl: process.env.MPESA_CALLBACK_URL || null
};

function baseUrlFor(env) {
  if (env === 'production') return 'https://api.safaricom.co.ke';
  return 'https://sandbox.safaricom.co.ke';
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
}

async function getAccessToken({ consumerKey, consumerSecret, env = 'sandbox' } = {}) {
  const key = consumerKey || DEFAULTS.consumerKey;
  const secret = consumerSecret || DEFAULTS.consumerSecret;
  if (!key || !secret) throw new Error('Missing MPESA consumer key/secret in environment');
  const url = baseUrlFor(env) + '/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${txt}`);
  }
  const body = await res.json();
  return body.access_token;
}

function buildPassword(shortcode, passkey, ts) {
  const raw = `${shortcode}${passkey}${ts}`;
  return Buffer.from(raw).toString('base64');
}

export async function stkPush({ amount = 300, phone, accountReference = 'Betrix', transactionDesc = 'Betrix access', env = DEFAULTS.env, consumerKey, consumerSecret, shortcode = DEFAULTS.shortcode, passkey = DEFAULTS.passkey, callbackUrl = DEFAULTS.callbackUrl } = {}) {
  if (!phone) throw new Error('Phone number is required for STK push');
  if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE and MPESA_PASSKEY must be set in environment');
  const token = await getAccessToken({ consumerKey, consumerSecret, env });
  const ts = timestamp();
  const password = buildPassword(shortcode, passkey, ts);
  const url = baseUrlFor(env) + '/mpesa/stkpush/v1/processrequest';
  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc
  };
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`STK push failed: ${res.status} ${JSON.stringify(json)}`);
  }
  // Typical successful response: { MerchantRequestID, CheckoutRequestID, ResponseCode: '0', ResponseDescription }
  return { raw: json };
}

export default { stkPush };
