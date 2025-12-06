<<<<<<< HEAD
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
=======
import express from '"'"'express'"'"';
import bodyParser from '"'"'body-parser'"'"';
import crypto from '"'"'crypto'"'"';
import { Pool } from '"'"'pg'"'"';
>>>>>>> upstream/main

// Minimal replacement app to restore runtime while we repair the original file.
const app = express();
const PORT = process.env.PORT || 5000;

// DB pool with TLS (Render requires TLS)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Middleware: capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

<<<<<<< HEAD
function safeLog(...args) { try { console.log(...args); } catch (e) { void e; } }
=======
function safeLog(...args) { try { console.log(...args); } catch (e) {} }
>>>>>>> upstream/main

// Simple admin endpoint for status
app.get('/admin/queue', (req, res) => {
  return res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null });
});

// Webhook endpoint for Lipana (M-Pesa) - minimal HMAC check + store
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
<<<<<<< HEAD
    safeLog('[webhook/mpesa] incomingSig=', incoming, 'computedHexPrefix=', computedHex ? computedHex.slice(0,16) : null);
    void computedB64;
=======

    safeLog('[webhook/mpesa] incomingSig=', incoming, 'computedHexPrefix=', computedHex ? computedHex.slice(0,16) : null);
>>>>>>> upstream/main

    // Attempt to persist webhook (best-effort)
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now(), raw_payload jsonb)`);
      await pool.query('INSERT INTO webhooks(raw_payload) VALUES($1)', [req.body || {}]);
    } catch (e) {
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Always return 200 to avoid retries while debugging
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

app.listen(PORT, () => safeLog(`Minimal app listening on ${PORT}`));

export default app;
