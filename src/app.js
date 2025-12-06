import express from "express";
import { getRedis, MockRedis } from "./lib/redis-factory.js";
import { handleCallbackQuery } from "./bot/handlers.js";

const app = express();
app.use(express.json({ limit: '1mb' }));

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
      try { r.redis = await redis.ping(); } catch (e) { r.redis = String(e?.message || e); }
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
      console.warn('[app] callback handler failed', err && (err.message || err));
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
            const chatId = msg.chat && (msg.chat.id || (msg.chat && msg.chat.id));
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
      }
    }

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
