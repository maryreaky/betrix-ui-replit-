// Clean canonical app module for webhook capture + fallback
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';

const app = express();

// Build pool config according to PGSSLMODE
const poolConfig = { connectionString: process.env.DATABASE_URL };
{
  const pgSslMode = String(process.env.PGSSLMODE || '').toLowerCase();
  if (process.env.DATABASE_URL && pgSslMode && pgSslMode !== 'disable') {
    if (pgSslMode === 'verify-ca' || pgSslMode === 'verify-full') {
      poolConfig.ssl = { rejectUnauthorized: true };
      if (process.env.PGSSLROOTCERT) {
        try { poolConfig.ssl.ca = fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8'); }
        catch (e) { console.warn('Could not read PGSSLROOTCERT:', e?.message || String(e)); }
      }
    } else {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  }
}

const pool = new Pool(poolConfig);

// capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) { void e; } }

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/admin/queue', (_req, res) => {
  return res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null });
});

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
      }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Return 200 so upstream won't retry while we debug
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

export function registerDataExposureAPI(sportsAggregator) {
  try {
    if (typeof globalThis.DataExposureHandler !== 'undefined') new globalThis.DataExposureHandler(app, sportsAggregator);
    safeLog('DATA_EXPOSURE: registered endpoints');
  } catch (err) { safeLog('DATA_EXPOSURE registration failed:', String(err)); }
}

export default app;

// Start server only when executed directly (node src/app.js)
const PORT = process.env.PORT || 5000;
try {
  const invokedScript = process.argv[1] ? path.resolve(process.argv[1]) : null;
  const appScript = path.resolve('src', 'app.js');
  if (invokedScript && invokedScript === appScript) {
    app.listen(PORT, () => safeLog(`Server running on port ${PORT}`));
  }
} catch (e) { void e; }

