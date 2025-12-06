<<<<<<< HEAD
import express from "express";
import { getRedis, MockRedis } from "./lib/redis-factory.js";
import { handleCallbackQuery } from "./bot/handlers.js";
=======
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Keep PGSSLMODE defaulted to 'require' on platforms like Render
process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
>>>>>>> upstream/main

const app = express();
app.use(express.json({ limit: '1mb' }));

<<<<<<< HEAD
// initialize redis (factory gives MockRedis when REDIS_URL not set)
let redis;
try {
  redis = getRedis();
} catch (e) {
  console.warn('[app] Redis init failed, using MockRedis', e?.message || e);
  redis = new MockRedis();
}

// Health endpoint (general)
app.get('/admin/health', async (req, res) => {
  try {
    const r = { status: 'ok' };
    if (redis && typeof redis.ping === 'function') {
        try {
          r.redis = await redis.ping();
        } catch (e) {
          console.warn('[app] Redis ping failed in /admin/health', e && (e.message || e));
          r.redis = 'unavailable';
        }
    }
    return res.json(r);
  } catch (err) {
    return res.status(500).json({ status: 'error', err: String(err?.message || err) });
  }
});

// Redis ping endpoint (explicit)
app.get('/admin/redis-ping', async (req, res) => {
  try {
    if (!redis || typeof redis.ping !== 'function') return res.status(503).json({ ok: false, msg: 'redis unavailable' });
    const pong = await redis.ping();
    return res.json({ ok: true, pong });
  } catch (err) {
    return res.status(500).json({ ok: false, err: String(err?.message || err) });
  }
});

// Telegram webhook endpoint with idempotent enqueue
app.post('/webhook/telegram', async (req, res) => {
  const body = req.body || {};
  // If this is a callback_query from an inline keyboard, handle immediately
  if (body.callback_query) {
      try {
        await handleCallbackQuery(body);
      } catch (err) {
        console.warn('[app] callback handler failed', err && (err.stack || err.message || err));
      }
    return res.sendStatus(200);
  }
  try {
    const updateId = (body && (body.update_id || (body.message && body.message.update_id))) || null;
    // If we have a Redis client, attempt idempotent enqueue using SET NX
    if (redis && typeof redis.lpush === 'function') {
      let accepted = true;
      if (updateId || updateId === 0) {
        const dedupKey = `telegram:update:${updateId}`;
        try {
          // try modern SET with NX + EX
          const setRes = await redis.set(dedupKey, '1', 'EX', 24 * 3600, 'NX');
          if (setRes === null) {
            // key already existed -> duplicate
            accepted = false;
          }
        } catch (e) {
          // fallback to setnx+expire or setex protection
          try {
            if (typeof redis.setnx === 'function') {
              const ok = await redis.setnx(dedupKey, '1');
              if (ok === 1 || ok === 'OK') {
                if (typeof redis.expire === 'function') await redis.expire(dedupKey, 24 * 3600);
                accepted = true;
              } else {
                accepted = false;
              }
            } else if (typeof redis.get === 'function' && typeof redis.setex === 'function') {
              const cur = await redis.get(dedupKey);
              if (!cur) {
                await redis.setex(dedupKey, 24 * 3600, '1');
                accepted = true;
              } else {
                accepted = false;
              }
            }
          } catch (e2) {
            // best-effort: if any error, fall back to enqueueing once
            console.warn('[app] Redis dedupe fallback failed', e2?.message || e2);
          }
        }
      }

      if (!accepted) {
        console.log('[TELEGRAM] Duplicate update ignored', updateId);
        return res.sendStatus(200);
      }

      try {
        await redis.lpush('telegram:updates', JSON.stringify(body));
        try { await redis.ltrim('telegram:updates', 0, 10000); } catch (e) { console.debug('[TELEGRAM] ltrim failed (non-fatal)', e && (e.message || e)); }
        console.log('[TELEGRAM] Update enqueued', { updateId });

        // Immediate fire-and-forget reply for /start commands to improve UX.
        try {
          const msg = body && body.message ? body.message : null;
          if (msg && typeof msg.text === 'string' && msg.text.trim().split(/\s+/)[0] === '/start') {
              const chatId = msg?.chat?.id;
            if (chatId && process.env.TELEGRAM_TOKEN) {
              // Use global fetch (Node 18+). Do not await — best-effort send.
              const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
              const payload = {
                chat_id: chatId,
                text: "Welcome to BETRIX! 🚀\nType /fixtures for today’s matches or /help to see all commands.",
                parse_mode: "HTML"
              };
              fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(() => console.log('[TELEGRAM] /start auto-reply sent', { chatId }))
                .catch(err => console.error('[TELEGRAM] sendMessage error:', err && (err.message || err)));
            }
          }
        } catch (e) {
          console.warn('[TELEGRAM] Immediate reply failed', e && (e.message || e));
        }

        return res.sendStatus(200);
      } catch (e) {
        console.error('[TELEGRAM] Enqueue failed', e?.message || e);
        return res.sendStatus(500);
=======
// DB pool: best-effort TLS settings for managed Postgres (fine-tune in prod)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Capture raw body bytes for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/admin/queue', (_req, res) => {
  return res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null });
});

// Admin: return last N fallback webhook entries from fallback files
app.get('/admin/webhook-fallback', (req, res) => {
  try {
    const n = Math.min(100, Number(req.query.n || 50));
    const repoPath = path.join(process.cwd(), 'webhooks.log');
    const tmpPath = path.join(os.tmpdir(), 'webhooks.log');
    const result = {};

    for (const item of [{ p: repoPath, label: 'repo' }, { p: tmpPath, label: 'tmp' }]) {
      try {
        if (!fs.existsSync(item.p)) { result[item.label] = null; continue; }
        const txt = fs.readFileSync(item.p, 'utf8');
        const lines = txt.split(/\r?\n/).filter(Boolean);
        const tail = lines.slice(-n).map(l => {
          try { return JSON.parse(l); } catch { return l; }
        });
        result[item.label] = tail;
      } catch (e) {
        result[item.label] = { error: e?.message || String(e) };
      }
    }

    return res.json({ ok: true, files: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Webhook endpoint for Lipana / M-Pesa
app.post('/webhook/mpesa', async (req, res) => {
  const secret = process.env.LIPANA_WEBHOOK_SECRET || process.env.MPESA_WEBHOOK_SECRET || process.env.LIPANA_SECRET;
  const incoming = req.headers['x-lipana-signature'] || req.headers['x-signature'] || req.headers['signature'] || '';
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    let computedHex = null;
    let computedB64 = null;
    if (secret) {
      const h = crypto.createHmac('sha256', String(secret)).update(raw).digest();
      computedHex = h.toString('hex');
      computedB64 = h.toString('base64');
    }

    safeLog('[webhook/mpesa] incoming=', incoming, 'computedHexPrefix=', computedHex ? computedHex.slice(0,16) : null);

    // Best-effort persistence: try DB, else write fallback files
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now(), raw_payload jsonb, headers jsonb, incoming_signature text, computed_hex text, computed_b64 text)`);
      await pool.query('INSERT INTO webhooks(raw_payload, headers, incoming_signature, computed_hex, computed_b64) VALUES($1,$2,$3,$4,$5)', [req.body || {}, req.headers || {}, incoming, computedHex, computedB64]);
    } catch (e) {
      try {
        const rec = { ts: new Date().toISOString(), headers: req.headers || {}, body: req.body || {}, incoming_signature: incoming, computedHex, computedB64 };
        const logPath = path.join(process.cwd(), 'webhooks.log');
        const tmpPath = path.join(os.tmpdir(), 'webhooks.log');
        fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        fs.appendFileSync(tmpPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        safeLog('DB insert failed; appended webhook to', logPath, 'and', tmpPath);
      } catch (fsErr) {
        safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr));
>>>>>>> upstream/main
      }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

<<<<<<< HEAD
    // No Redis: fall back to simple log
    console.log('[TELEGRAM] Update received (no-redis):', body);
    return res.sendStatus(200);
  } catch (err) {
    console.error('[TELEGRAM] Handler failed', err?.message || err);
    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`BETRIX web app running on ${PORT}`));

// Export the Express app so worker can import and/or start it when required
=======
    // Return 200 so upstream won't retry while we debug
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

// Single PORT binding and listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

>>>>>>> upstream/main
export default app;
