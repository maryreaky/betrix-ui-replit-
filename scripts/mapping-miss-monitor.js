#!/usr/bin/env node
import Redis from 'ioredis';
import fetch from 'node-fetch';

async function sendTelegram(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch (e) {
    console.error('Telegram send error', e.message || e);
    return false;
  }
}

(async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl);
  try {
    const keys = await redis.keys('monitor:payment:mapping_misses:*');
    if (!keys || keys.length === 0) {
      console.log('No mapping-miss keys found.');
      process.exit(0);
    }

    const rows = [];
    for (const k of keys) {
      const val = await redis.get(k);
      rows.push({ key: k, count: Number(val || 0) });
    }

    rows.sort((a, b) => b.count - a.count);
    const summary = rows.map(r => `${r.key.split(':').pop()}: ${r.count}`).join('\n');
    const message = `Mapping-miss summary:\n${summary}`;

    console.log(message);

    const tg = process.env.TELEGRAM_TOKEN;
    const admin = process.env.ADMIN_TELEGRAM_ID;
    if (tg && admin) {
      const ok = await sendTelegram(tg, admin, message);
      console.log('Telegram send:', ok ? 'ok' : 'failed');
    } else {
      console.log('TELEGRAM_TOKEN or ADMIN_TELEGRAM_ID not set; skipping Telegram notification.');
    }
  } catch (e) {
    console.error('Monitor failed:', e);
    process.exit(2);
  } finally {
    try { redis.disconnect(); } catch (ex) {}
  }
})();
