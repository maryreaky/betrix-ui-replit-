#!/usr/bin/env node
/*
  Lightweight provider checks for staging readiness.
  - Verifies REDIS (ping)
  - Verifies Telegram bot token (getMe)
  - Verifies PayPal credentials (oauth token)
  - Attempts simple requests to API-Football, AllSports (RapidAPI), SportsData

  This script intentionally does not log secrets. It only reports OK/FAIL and short error messages.
*/
import Redis from 'ioredis';
import { setTimeout as wait } from 'timers/promises';

const fetchWithTimeout = (url, opts = {}, ms = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
};

async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return { ok: false, reason: 'REDIS_URL missing' };
  try {
    const r = new Redis(url);
    const res = await r.ping();
    await r.quit();
    return { ok: res === 'PONG' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function checkTelegram() {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return { ok: false, reason: 'TELEGRAM_TOKEN missing' };
  try {
    const url = `https://api.telegram.org/bot${token}/getMe`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res) return { ok: false, reason: 'no response' };
    const json = await res.json();
    return { ok: json && json.ok === true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function checkPayPal() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = (process.env.PAYPAL_MODE || process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  if (!id || !secret) return { ok: false, reason: 'PAYPAL_CLIENT_ID/SECRET missing' };
  const base = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  try {
    const tokenUrl = `${base}/v1/oauth2/token`;
    const creds = Buffer.from(`${id}:${secret}`).toString('base64');
    const res = await fetchWithTimeout(tokenUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    }, 7000);
    if (!res) return { ok: false, reason: 'no response' };
    const json = await res.json();
    return { ok: !!json.access_token, info: json.access_token ? 'token_acquired' : JSON.stringify(json) };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function checkApiFootball() {
  const key = process.env.API_FOOTBALL_KEY;
  const base = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';
  if (!key) return { ok: false, reason: 'API_FOOTBALL_KEY missing' };
  try {
    const url = `${base}/v3/timezone`;
    const res = await fetchWithTimeout(url, { headers: { 'x-apisports-key': key } }, 7000);
    if (!res) return { ok: false, reason: 'no response' };
    const ok = res.status === 200 || res.status === 204;
    return { ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function checkAllSports() {
  const key = process.env.ALLSPORTS_API || process.env.ALLSPORTS_API_KEY;
  const host = process.env.ALLSPORTS_HOST || 'allsportsapi.p.rapidapi.com';
  if (!key) return { ok: false, reason: 'ALLSPORTS_API missing' };
  try {
    const url = `https://${host}/`;
    const res = await fetchWithTimeout(url, { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host } }, 7000);
    return { ok: res && (res.status === 200 || res.status === 404 || res.status === 403), status: res ? res.status : 'no_resp' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function checkSportsData() {
  const key = process.env.SPORTSDATA_API_KEY || process.env.SPORTSDATA_KEY || process.env.SPORTS_DATA_KEY;
  const base = process.env.SPORTSDATA_BASE || 'https://api.sportsdata.io';
  if (!key) return { ok: false, reason: 'SPORTSDATA_API_KEY missing' };
  try {
    // try a generic endpoint for soccer areas (may vary by plan)
    const url = `${base}/v3/soccer/scores/json/Areas`;
    const res = await fetchWithTimeout(url, { headers: { 'Ocp-Apim-Subscription-Key': key } }, 7000);
    return { ok: res && (res.status === 200 || res.status === 401 || res.status === 403), status: res ? res.status : 'no_resp' };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function runChecks() {
  console.log('Running provider checks (secrets are not printed)');
  const results = {};
  results.redis = await checkRedis();
  console.log('REDIS:', results.redis.ok ? 'OK' : `FAIL - ${results.redis.reason || results.redis.status}`);
  await wait(200);
  results.telegram = await checkTelegram();
  console.log('TELEGRAM:', results.telegram.ok ? 'OK' : `FAIL - ${results.telegram.reason || 'unknown'}`);
  await wait(200);
  results.paypal = await checkPayPal();
  console.log('PAYPAL:', results.paypal.ok ? `OK (${results.paypal.info || 'token'})` : `FAIL - ${results.paypal.reason}`);
  await wait(200);
  results.apiFootball = await checkApiFootball();
  console.log('API_FOOTBALL:', results.apiFootball.ok ? `OK (status ${results.apiFootball.status})` : `FAIL - ${results.apiFootball.reason}`);
  await wait(200);
  results.allSports = await checkAllSports();
  console.log('ALLSPORTS (RapidAPI):', results.allSports.ok ? `OK (status ${results.allSports.status})` : `FAIL - ${results.allSports.reason}`);
  await wait(200);
  results.sportsData = await checkSportsData();
  console.log('SPORTSDATA:', results.sportsData.ok ? `OK (status ${results.sportsData.status})` : `FAIL - ${results.sportsData.reason}`);

  console.log('\nSummary:');
  for (const [k, v] of Object.entries(results)) {
    console.log(` - ${k}: ${v.ok ? 'OK' : 'FAIL'}`);
  }
  const allOk = Object.values(results).every(r => r.ok === true);
  process.exit(allOk ? 0 : 2);
}

runChecks();
