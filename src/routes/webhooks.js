import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default function createWebhooksRouter() {
  const router = express.Router();

  router.post('/mpesa', express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), async (req, res) => {
    const pool = req.app && req.app.locals && req.app.locals.pool;
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

      try {
        if (pool) {
          await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now(), raw_payload jsonb, headers jsonb, incoming_signature text, computed_hex text, computed_b64 text)`);
          const insertRes = await pool.query('INSERT INTO webhooks(raw_payload, headers, incoming_signature, computed_hex, computed_b64) VALUES($1,$2,$3,$4,$5) RETURNING id', [req.body || {}, req.headers || {}, incoming, computedHex, computedB64]);
          // Log successful DB insert
          try { const insertedId = insertRes && insertRes.rows && insertRes.rows[0] && insertRes.rows[0].id; if (insertedId) console.log('[webhook/mpesa] DB insert OK id=', insertedId); } catch (e) { /* ignore logging error */ }
        } else {
          throw new Error('no-pool');
        }
      } catch (dbErr) {
        try {
          const rec = { ts: new Date().toISOString(), headers: req.headers || {}, body: req.body || {}, incoming_signature: incoming, computedHex, computedB64 };
          const logPath = path.join(process.cwd(), 'webhooks.log');
          const tmpPath = path.join(os.tmpdir(), 'webhooks.log');
          fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
          fs.appendFileSync(tmpPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        } catch (fsErr) {
          // best-effort fallback failed
        }
      }

      return res.status(200).send('OK');
    } catch (err) {
      return res.status(200).send('OK');
    }
  });

  // Telegram webhook endpoint — accept any method and always return 200 OK to stop Telegram retries
  // Also accept optional secret in path: /telegram or /telegram/:secret
  const telegramHandler = async (req, res) => {
    try {
      // Lightweight stdout log so incoming Telegram updates appear immediately in platform logs
      try {
        const uid = req.body && (req.body.update_id || (req.body.message && req.body.message.message_id)) ? `update_id=${req.body.update_id || (req.body.message && req.body.message.message_id)}` : '';
        console.log('[TELEGRAM] Update received', req.method, req.originalUrl, uid);
      } catch (e) { /* don't let logging break the handler */ }

      // Ensure body parsed for POST/PUT; don't throw on parse errors
      // Log method, path, headers and body to webhooks.log for debugging on Render
      try {
        const rec = {
          ts: new Date().toISOString(),
          source: 'telegram',
          method: req.method,
          url: req.originalUrl,
          params: req.params || {},
          query: req.query || {},
          body: req.body || {},
          headers: req.headers || {}
        };
        const logPath = path.join(process.cwd(), 'webhooks.log');
        fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        // Also write to tmp for additional visibility on some platforms
        try { fs.appendFileSync(path.join(os.tmpdir(), 'webhooks.log'), JSON.stringify(rec) + '\n', { encoding: 'utf8' }); } catch (_) { /* ignore */ }
      } catch (e) { /* ignore logging errors */ }

      // Always acknowledge with 200 OK. Telegram requires 200 to stop retries.
      return res.status(200).send('OK');
    } catch (err) {
      return res.status(200).send('OK');
    }
  };

  // Use express.json for routes that expect a JSON body, but accept any method for resiliency
  router.all('/telegram', express.json({ limit: '1mb' }), telegramHandler);
  router.all('/telegram/:secret', express.json({ limit: '1mb' }), telegramHandler);

  return router;
}
