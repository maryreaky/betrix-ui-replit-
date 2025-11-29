#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import IORedis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) {
  console.error('REDIS_URL not set in environment (.env).');
  process.exit(2);
}

async function main() {
  const r = new IORedis(url, { connectTimeout: 5000 });
  try {
    await r.connect();
  } catch (e) {
    // ioredis v5 connects lazily; ignore
  }

  try {
    const pre = await r.get('betrix:prefetch:live:by-sport');
    console.log('betrix:prefetch:live:by-sport present?:', Boolean(pre));
    if (pre) {
      try { console.log(JSON.stringify(JSON.parse(pre), null, 2).slice(0, 4000)); } catch(e) { console.log(pre.substring(0,4000)); }
    }

    const sample = await r.get('live:39');
    console.log('\nSample key live:39 present?:', Boolean(sample));
    if (sample) {
      try { console.log(JSON.stringify(JSON.parse(sample), null, 2).slice(0,4000)); } catch(e) { console.log(sample.substring(0,4000)); }
    }
  } catch (e) {
    console.error('Redis read failed:', e?.message || e);
  } finally {
    try { await r.quit(); } catch(_) { r.disconnect(); }
  }
}

main();
