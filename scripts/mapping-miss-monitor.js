#!/usr/bin/env node
const fetch = require('node-fetch');
const Redis = require('ioredis');

(async function main(){
  try {
    const REDIS_URL = process.env.REDIS_URL;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.TELEGRAM_ADMIN_ID;
    if (!REDIS_URL) throw new Error('REDIS_URL not set');
    if (!TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN not set');
    if (!ADMIN_ID) throw new Error('ADMIN_TELEGRAM_ID/TELEGRAM_ADMIN_ID not set');

    const redis = new Redis(REDIS_URL);
    const today = new Date().toISOString().slice(0,10);
    const key = `monitor:payment:mapping_misses:${today}`;
    const count = Number(await redis.get(key) || 0);

    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10);
    const ykey = `monitor:payment:mapping_misses:${yesterday}`;
    const ycount = Number(await redis.get(ykey) || 0);

    const message = `📊 Payment mapping misses summary\n\nDate: ${today}\nToday's misses: ${count}\nYesterday: ${ycount}`;

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_ID.toString(), text: message })
    });
    const json = await res.json();
    if (!json || !json.ok) {
      console.error('Failed sending Telegram message', json);
      process.exit(2);
    }
    console.log('Monitor sent:', message);
    await redis.quit();
  } catch (e) {
    console.error('Monitor failed', e.message || e);
    process.exit(1);
  }
})();
