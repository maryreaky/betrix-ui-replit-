// SportMonks debug script
// Attempts a normal fetch; if TLS trust fails, optionally retries with an insecure agent
// WARNING: disabling TLS verification is INSECURE and should only be used for one-off debugging

import 'dotenv/config';
import fetch from 'node-fetch';
import https from 'https';

const base = process.env.SPORTSMONKS_HOST || 'https://api.sportsmonks.com/v3';
const token = process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_API_KEY || process.env.SPORTSMONKS_TOKEN;
if (!token) {
  console.error('SPORTSMONKS_API not set in environment. Set it and rerun.');
  process.exit(2);
}

async function tryFetch(insecure = false) {
  try {
    const url = `${base.replace(/\/+$/, '')}/football/livescores?api_token=${encodeURIComponent(token)}`;
    const opts = { method: 'GET' };
    if (insecure) {
      opts.agent = new https.Agent({ rejectUnauthorized: false });
      console.warn('Attempting insecure TLS fetch (rejectUnauthorized=false) - for debugging only');
    }
    const res = await fetch(url, opts);
    console.log(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log('Response (first 1000 chars):', text.substring(0, 1000));
    return true;
  } catch (e) {
    console.error('Fetch failed:', e && e.message ? e.message : e);
    return false;
  }
}

(async function(){
  console.log('SportMonks debug - base:', base);
  console.log('Trying normal fetch...');
  const ok = await tryFetch(false);
  if (!ok) {
    console.warn('Normal fetch failed. You can retry insecurely for debugging by setting DEBUG_SPORTSMONKS_INSECURE=true in env (not recommended in production).');
    if (process.env.DEBUG_SPORTSMONKS_INSECURE === 'true') {
      console.warn('DEBUG_SPORTSMONKS_INSECURE is true — attempting insecure fetch (this will accept self-signed certs).');
      await tryFetch(true);
    }
  }
})();
