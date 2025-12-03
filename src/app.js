import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';

// Minimal, self-contained server to restore runtime quickly.
const app = express();
const PORT = process.env.PORT || 5000;

// DB pool with TLS (Render requires TLS in many cases)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }

app.get('/admin/queue', (req, res) => {
  return res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null });
});

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

    // Best-effort persistence for debugging
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now(), raw_payload jsonb, headers jsonb, incoming_signature text, computed_hex text, computed_b64 text)`);
      await pool.query('INSERT INTO webhooks(raw_payload, headers, incoming_signature, computed_hex, computed_b64) VALUES($1,$2,$3,$4,$5)', [req.body || {}, req.headers || {}, incoming, computedHex, computedB64]);
    } catch (e) {
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Always return 200 while debugging to avoid retries
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

app.get("/admin/webhook-fallback", (req, res) => {
  if (req.get("X-ADMIN-TOKEN") !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const fs = require("fs"), os = require("os");
    const repoPath = process.cwd() + "/webhooks.log";
    const tmpPath = os.tmpdir() + "/webhooks.log";
    const readFile = p => {
      try {
        return fs.readFileSync(p, "utf8").split("\n").slice(-50).map(l => {
          try { return JSON.parse(l); } catch { return l; }
        });
      } catch (e) { return { error: e.message }; }
    };
    res.json({ files: { repo: readFile(repoPath), tmp: readFile(tmpPath) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

export default app;


