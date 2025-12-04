// Single minimal ESM Express app (overwrite)
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.post('/webhook/mpesa', async (req, res) => {
  const secret = process.env.LIPANA_WEBHOOK_SECRET || process.env.MPESA_WEBHOOK_SECRET || process.env.LIPANA_SECRET;
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    let computedHex = null;
    if (secret) computedHex = crypto.createHmac('sha256', String(secret)).update(raw).digest('hex');
    // best-effort write: try DB, else fallback file
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (id SERIAL PRIMARY KEY, created_at timestamptz DEFAULT now(), raw_payload jsonb)`);
      await pool.query('INSERT INTO webhooks(raw_payload) VALUES($1)', [req.body || {}]);
    } catch (e) {
      try { fs.appendFileSync(path.join(process.cwd(),'webhooks.log'), JSON.stringify({ ts: new Date().toISOString(), body: req.body || {}, computedHex }) + '\n'); } catch (fsErr) {}
    }
    return res.status(200).send('OK');
  } catch (err) { safeLog('webhook error', String(err)); return res.status(200).send('OK'); }
});

export default app;

// start server only when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => safeLog(`Server running on port ${PORT}`));
}
// Clean single-file Express app for Lipana / M-Pesa webhook handling
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import DataExposureHandler from './handlers/data-exposure-handler.js';

process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.get('/admin/queue', (_req, res) => res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null }));

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
        result[item.label] = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return l; } });
      } catch (e) { result[item.label] = { error: e?.message || String(e) }; }
    }
    return res.json({ ok: true, files: result });

  // Minimal clean Express app (single copy) for webhook HMAC capture & admin checks
  import express from 'express';
  import bodyParser from 'body-parser';
  import crypto from 'crypto';
  import fs from 'fs';
  import path from 'path';
  import os from 'os';
  import { fileURLToPath } from 'url';
  import { Pool } from 'pg';
  import DataExposureHandler from './handlers/data-exposure-handler.js';

  process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  function safeLog(...args) { try { console.log(...args); } catch (e) {} }

  app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/admin/queue', (_req, res) => res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null }));

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
          result[item.label] = lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return l; } });
        } catch (e) { result[item.label] = { error: e?.message || String(e) }; }
      }
      return res.json({ ok: true, files: result });
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }); }
  });

  app.post('/webhook/mpesa', async (req, res) => {
    const secret = process.env.LIPANA_WEBHOOK_SECRET || process.env.MPESA_WEBHOOK_SECRET || process.env.LIPANA_SECRET;
    const incoming = req.headers['x-lipana-signature'] || req.headers['x-signature'] || req.headers['signature'] || '';
    try {
      const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      let computedHex = null, computedB64 = null;
      if (secret) {
        const h = crypto.createHmac('sha256', String(secret)).update(raw).digest();
        computedHex = h.toString('hex'); computedB64 = h.toString('base64');
      }
      safeLog('[webhook/mpesa] incoming=', incoming, 'computedHexPrefix=', computedHex ? computedHex.slice(0,16) : null);

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
        } catch (fsErr) { safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr)); }
        safeLog('DB insert failed (webhook):', e?.message || String(e));
      }

      return res.status(200).send('OK');
    } catch (err) {
      safeLog('Webhook handler error:', String(err));
      return res.status(200).send('OK');
    }
  });

  export function registerDataExposureAPI(sportsAggregator) {
    try { new DataExposureHandler(app, sportsAggregator); safeLog('DATA_EXPOSURE: registered endpoints'); }
    catch (err) { safeLog('DATA_EXPOSURE registration failed:', String(err)); }
  }

  export default app;

  // Start server only when executed directly
  try {
    const current = fileURLToPath(import.meta.url);
    if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(current)) {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => safeLog(`Server running on port ${PORT}`));
    }
  } catch (e) {}
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/webhook/mpesa', async (req, res) => {
  const secret = process.env.LIPANA_WEBHOOK_SECRET || process.env.MPESA_WEBHOOK_SECRET || process.env.LIPANA_SECRET;
  const incoming = req.headers['x-lipana-signature'] || req.headers['x-signature'] || req.headers['signature'] || '';
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    let computedHex = null, computedB64 = null;
    if (secret) {
      const h = crypto.createHmac('sha256', String(secret)).update(raw).digest();
      computedHex = h.toString('hex'); computedB64 = h.toString('base64');
    }
    safeLog('[webhook/mpesa] incoming=', incoming, 'computedHexPrefix=', computedHex ? computedHex.slice(0,16) : null);

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
      } catch (fsErr) { safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr)); }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', String(err));
    return res.status(200).send('OK');
  }
});

export function registerDataExposureAPI(sportsAggregator) {
  try { new DataExposureHandler(app, sportsAggregator); safeLog('DATA_EXPOSURE: registered endpoints'); }
  catch (err) { safeLog('DATA_EXPOSURE registration failed:', String(err)); }
}

export default app;

// Start server only when executed directly (not when imported by worker)
try {
  if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => safeLog(`Server running on port ${PORT}`));
  }
} catch (e) {
  // non-fatal
}

// EOF

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

// Single PORT binding and listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - app.js:363`);
});

export default app;
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Ensure SSL for PostgreSQL (useful on Render)
process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const app = express();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/admin/queue', (req, res) => {
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
      // Fallback: append the webhook to a local file so nothing is lost while DB is flaky
      try {
        const rec = { ts: new Date().toISOString(), headers: req.headers || {}, body: req.body || {}, incoming_signature: incoming, computedHex, computedB64 };
        const logPath = path.join(process.cwd(), 'webhooks.log');
        const tmpPath = path.join(os.tmpdir(), 'webhooks.log');
        // Try write to repo cwd
        fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        // Also write to system tmp dir as a second fallback so we can find records
        fs.appendFileSync(tmpPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        safeLog('DB insert failed; appended webhook to', logPath, 'and', tmpPath);
      } catch (fsErr) {
        // As a last resort, log to console
        safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr));
      }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Always return 200 while debugging to avoid retries
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

// Final PORT binding (single listen)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - app.js:470`);
});

export default app;
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Ensure SSL for PostgreSQL (useful on Render)
process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const app = express();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// capture raw body for HMAC verification
app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) {} }

app.get('/admin/queue', (req, res) => {
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
      // Fallback: append the webhook to a local file so nothing is lost while DB is flaky
      try {
        const rec = { ts: new Date().toISOString(), headers: req.headers || {}, body: req.body || {}, incoming_signature: incoming, computedHex, computedB64 };
        const logPath = path.join(process.cwd(), 'webhooks.log');
        const tmpPath = path.join(os.tmpdir(), 'webhooks.log');
        // Try write to repo cwd
        fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        // Also write to system tmp dir as a second fallback so we can find records
        fs.appendFileSync(tmpPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        safeLog('DB insert failed; appended webhook to', logPath, 'and', tmpPath);
      } catch (fsErr) {
        // As a last resort, log to console
        safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr));
      }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Always return 200 while debugging to avoid retries
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

// removed intermediate listen to avoid duplicate PORT declarations

export default app;
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Ensure SSL for PostgreSQL (useful on Render)
process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

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
      // Fallback: append the webhook to a local file so nothing is lost while DB is flaky
      try {
        const rec = { ts: new Date().toISOString(), headers: req.headers || {}, body: req.body || {}, incoming_signature: incoming, computedHex, computedB64 };
        const logPath = path.join(process.cwd(), 'webhooks.log');
        fs.appendFileSync(logPath, JSON.stringify(rec) + '\n', { encoding: 'utf8' });
        safeLog('DB insert failed; appended webhook to', logPath);
      } catch (fsErr) {
        // As a last resort, log to console
        safeLog('DB insert failed and fallback file write failed:', fsErr?.message || String(fsErr));
      }
      safeLog('DB insert failed (webhook):', e?.message || String(e));
    }

    // Always return 200 while debugging to avoid retries
    return res.status(200).send('OK');
  } catch (err) {
    safeLog('Webhook handler error:', err?.message || String(err));
    return res.status(200).send('OK');
  }
});

app.listen(PORT, () => safeLog(`Minimal app listening on ${PORT}`));

export default app;



import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Pool } from 'pg';

// Ensure SSL is required for PostgreSQL on platforms like Render and
// avoid Node rejecting self-signed certs during debugging.
process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

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

app.listen(PORT, () => safeLog(`Minimal app listening on ${PORT}`));

export default app;
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

app.listen(PORT, () => safeLog(`Minimal app listening on ${PORT}`));

export default app;

    const health = {};
    for (const key of keys) {
      try {
        const val = await redis.get(key).catch(() => null);

    // Log a short fingerprint of the configured secret (does not reveal the secret)
    try {
      const _rawSecret = process.env.LIPANA_SECRET ? String(process.env.LIPANA_SECRET) : '';
      const trimmedSecret = _rawSecret.trim();
      const secretFingerprint = trimmedSecret ? crypto.createHash('sha256').update(trimmedSecret).digest('hex').slice(0,8) : '(no-secret)';
      console.log('[verifySignature] LIPANA_SECRET fingerprint(first8)= - app.js:775', secretFingerprint);
    } catch (e) {
      // ignore logging errors
    }
        if (val) {
          const parsed = JSON.parse(val);
          const provider = key.replace(prefix, '');
          health[provider] = { ...parsed, lastCheck: new Date(parsed.ts).toISOString() };
        }
      } catch (e) {
        // Skip malformed entries
      }
    }

    const summary = {
      totalProviders: keys.length,
      healthy: Object.values(health).filter(h => h.ok === true).length,
      unhealthy: Object.values(health).filter(h => h.ok === false).length,
      providers: health,
      scanTime: new Date().toISOString()
    };

    return res.json(formatResponse(true, summary, "Provider health dashboard"));
  } catch (err) {
    log("ERROR", "ADMIN", "provider-health failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Failed to fetch provider health"));
  }
});

// Admin: safe-scan and attempt to repair missing mappings (admin-run only)
app.post("/admin/safe-scan", authenticateAdmin, tierBasedRateLimiter, express.json(), async (req, res) => {
  try {
    const scanLimit = Number(req.body.scanLimit || 2000);
    const days = Number(req.body.days || 7);
    const summary = await safeScanAndRepair(redis, { scanLimit, days });
    return res.json(formatResponse(true, summary, "Safe-scan completed"));
  } catch (err) {
    log("ERROR", "ADMIN", "safe-scan failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Safe-scan failed"));
  }
});

app.post("/admin/settings", authenticateAdmin, upload.single("logo"), async (req, res) => {
  try {
    const settings = req.body || {};
    await redis.set("admin:settings", JSON.stringify(settings));
    log("INFO", "ADMIN", "Settings updated", { admin: req.adminUser });
    res.json(formatResponse(true, settings, "Settings updated"));
  } catch (err) {
    log("ERROR", "ADMIN", "Settings update failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to update settings"));
  }
});

// Predictions / odds / analytics scaffolding
app.get("/predictions", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { predictions: [{ match: "Barcelona vs Real Madrid", pred: "Barcelona Win", conf: "87%", odds: 1.85 }], accuracy: 97.2 }));
});

app.get("/odds", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { odds: [{ league: "EPL", match: "Man United vs Liverpool", home: 2.45, draw: 3.20, away: 2.80 }], updated: new Date().toISOString() }));
});

app.get("/leaderboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { leaderboard: [{ rank: 1, name: "ProBetter", points: 15450 }], yourRank: 247 }));
});

app.get("/analytics", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { dailyActiveUsers: 12340, totalPredictions: 1234567 }));
});

// User routes
app.get("/user/:userId/stats", tierBasedRateLimiter, (req, res) => {
  const userId = req.params.userId;
  const bets = 156, wins = 95;
  res.json(formatResponse(true, { userId, totalBets: bets, wins, losses: bets - wins, winRate: `${((wins / bets) * 100).toFixed(1)}%` }));
});

app.get("/user/:userId/referrals", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { userId: req.params.userId, totalReferrals: 14, earnings: 8400 }));
});

// Audit & pricing
app.get("/audit", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  try {
    const raw = await redis.lrange(LOG_STREAM_KEY, 0, 50).catch(() => []);
    const parsed = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean).slice(0, 20);
    res.json(formatResponse(true, { auditLogs: parsed }));
  } catch (err) {
    log("ERROR", "AUDIT", "Fetch failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to fetch audit logs"));
  }
});

app.get("/pricing", (req, res) => res.json(formatResponse(true, { tiers: BETRIX.pricing })));

// ============================================================================
// MONITORING DASHBOARD (public, provides system health metrics)
// ============================================================================
app.get("/monitor", async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Gather metrics in parallel
    const [
      uptime,
      workerHeartbeat,
      aiActive,
      logCount,
      queueLength,
      activeConnections,
      prefetchFailures,
      prefetchLastUpdates
    ] = await Promise.all([
      Promise.resolve(process.uptime()),
      redis.get('worker:heartbeat').catch(() => null),
      redis.get('ai:active').catch(() => null),
      redis.llen(LOG_STREAM_KEY).catch(() => 0),
      redis.llen('telegram:updates').catch(() => 0),
      Promise.resolve(activeConnections.size),
      (async () => {
        const types = ['rss', 'openligadb', 'scorebat', 'footballdata'];
        const failures = {};
        for (const t of types) {
          const f = await redis.get(`prefetch:failures:${t}`).catch(() => null);
          failures[t] = f ? Number(f) : 0;
        }
        return failures;
      })(),
      (async () => {
        const types = ['rss', 'openligadb', 'scorebat', 'footballdata'];
        const updates = {};
        for (const t of types) {
          const u = await redis.get(`prefetch:last:${t}`).catch(() => null);
          updates[t] = u ? Number(u) : null;
        }
        return updates;
      })()
    ]);

    const workerHealthy = workerHeartbeat && (Date.now() - Number(workerHeartbeat)) < 45000; // 45s tolerance
    const responseTime = Date.now() - startTime;

    res.json(formatResponse(true, {
      status: 'operational',
      uptime_seconds: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      services: {
        worker: {
          healthy: workerHealthy,
          heartbeat_age_ms: workerHeartbeat ? Date.now() - Number(workerHeartbeat) : null,
          last_seen: workerHeartbeat ? new Date(Number(workerHeartbeat)).toISOString() : null
        },
        ai: {
          active_provider: aiActive || 'unknown',
          redis_key: 'ai:active'
        },
        websocket: {
          connected_clients: activeConnections,
          subscribed_types: ['prefetch:updates', 'prefetch:error']
        }
      },
      prefetch: {
        failures: prefetchFailures,
        last_updates: Object.entries(prefetchLastUpdates).reduce((acc, [k, v]) => {
          acc[k] = v ? {
            timestamp: new Date(v).toISOString(),
            age_seconds: Math.floor((Date.now() - v) / 1000)
          } : null;
          return acc;
        }, {})
      },
      queue: {
        pending_updates: queueLength,
        logs_stored: logCount
      },
      performance: {
        response_time_ms: responseTime,
        redis_latency_ms: responseTime  // Approximation
      },
      version: BETRIX.version,
      brand: BETRIX.name
    }, 'System monitoring metrics'));
  } catch (err) {
    log('ERROR', 'MONITOR', 'Dashboard failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Monitor dashboard error'));
  }
});

// ============================================================================
// TELEGRAM WEBHOOK (secure header validation)
// ============================================================================
const validateTelegramRequest = (req, pathToken) => {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (!header || header !== TELEGRAM_WEBHOOK_SECRET) return { ok: false, reason: 'invalid_secret_header' };
  }
  if (pathToken && TELEGRAM_TOKEN && pathToken !== TELEGRAM_TOKEN) return { ok: false, reason: 'invalid_path_token' };
  return { ok: true };
};

// Telegram-specific webhook endpoint. Keep this distinct so other /webhook/* routes (mpesa, paypal)
// are not accidentally matched by the generic token route.
app.post("/webhook/telegram/:token?", tierBasedRateLimiter, express.json({ limit: "1mb" }), async (req, res) => {
  const pathToken = req.params.token;
  const check = validateTelegramRequest(req, pathToken);
  if (!check.ok) {
    log("WARN", "WEBHOOK", "Invalid webhook request", { reason: check.reason, forwarded: req.headers["x-forwarded-for"] || req.ip });
    return res.status(403).send("Forbidden");
  }

  try {
    const payload = req.body;
    await queueJob("telegram:update", payload, "normal");
    log("DEBUG", "WEBHOOK", "Webhook queued", { size: JSON.stringify(payload).length });
    return res.status(200).send("OK");
  } catch (err) {
    log("ERROR", "WEBHOOK", "Queue failed", { err: err.message });
    return res.status(500).send("Internal Server Error");
  }
});

// ============================================================================
// PAYMENTS (scaffold)
// ============================================================================
app.get("/paypal/checkout", tierBasedRateLimiter, (req, res) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${BETRIX.name} Payments</title><style>body{font-family:Segoe UI,Arial;background:#f6f8fb;padding:40px} .container{max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.08)}</style></head><body><div class="container"><h1>${BETRIX.name} Payments</h1><p>Redirecting to payment provider...</p></div></body></html>`;
  res.send(html);
});

// ============================================================================
// PAYMENT WEBHOOKS
// ============================================================================
// M-Pesa STK Push callback
app.post(
  "/webhook/payment/mpesa",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleMpesaCallback(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "M-Pesa webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "M-Pesa webhook error"));
    }
  }
);

// Safaricom Till confirmation
app.post(
  "/webhook/payment/till",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleSafaricomTillCallback(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Till webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Till webhook error"));
    }
  }
);

// PayPal webhook
app.post(
  "/webhook/payment/paypal",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handlePayPalWebhook(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "PayPal webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "PayPal webhook error"));
    }
  }
);

// Binance webhook
app.post(
  "/webhook/payment/binance",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleBinanceWebhook(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Binance webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Binance webhook error"));
    }
  }
);

// Simple health check for Render / uptime probes
app.get('/health', (_req, res) => res.status(200).send('OK'));
// Lipana / M-Pesa generic webhook receiver (HMAC-SHA256 signature in x-lipana-signature)
function verifySignature(req) {
  // Accept multiple possible header names
  const headerKeys = ['x-lipana-signature', 'x-signature', 'x-lipana-hmac', 'signature', 'x-hook-signature'];
  let signature = null;
  for (const k of headerKeys) {
    if (req.headers[k]) { signature = String(req.headers[k]); break; }
  }
  // Normalize header value if present (but continue so we can log even when missing)
  signature = signature ? signature.trim() : '';
  if (signature.toLowerCase().startsWith('sha256=')) signature = signature.slice(7).trim();

  // Raw bytes from the global JSON parser verify hook
  const raw = req.rawBody || (req.body ? Buffer.from(JSON.stringify(req.body), 'utf8') : Buffer.from(''));

  // Use a trimmed secret to avoid accidental whitespace/newline mismatches
  const _rawSecret = process.env.LIPANA_SECRET ? String(process.env.LIPANA_SECRET) : '';
  const lipanaSecret = _rawSecret.trim();

  // Unconditional fingerprint + incoming signature logging to help debug Render env
  try {
    const fingerprint = crypto.createHash('sha256').update(lipanaSecret).digest('hex').substring(0,8);
    const incomingPreview = signature ? `${String(signature).slice(0,64)}...len:${String(signature).length}` : '(empty)';
    console.log('[verifySignature] LIPANA_SECRET fingerprint(first8)= - app.js:1101', fingerprint);
    console.log('[verifySignature] Incoming signature(header)= - app.js:1102', incomingPreview);
  } catch (e) {
    // ignore logging errors
  }

  // Log raw body preview and headers to help identify byte-level differences
  try {
    const ct = req.headers['content-type'] || '(none)';
    const cl = req.headers['content-length'] || (raw && raw.length) || '(unknown)';
    const rawPreview = raw && raw.slice(0, 1024) ? raw.slice(0, 1024).toString('utf8') : '(empty)';
    const rawHex = raw && raw.slice(0, 64) ? raw.slice(0, 64).toString('hex') : '';
    const parsedPreview = req.body ? JSON.stringify(req.body).slice(0,1024) : '(no parsed body)';
    console.log('[verifySignature] contenttype= - app.js:1114', ct, 'content-length=', cl);
    console.log('[verifySignature] rawPreview(utf8,first1k)= - app.js:1115', rawPreview);
    console.log('[verifySignature] rawPreview(hex,first64bytes)= - app.js:1116', rawHex);
    console.log('[verifySignature] parsed(JSON.stringify) preview= - app.js:1117', parsedPreview);
  } catch (e) {
    // ignore logging errors
  }

  if (!lipanaSecret) {
    try { console.log('[verifySignature] LIPANA_SECRET is missing or empty - app.js:1123'); } catch (e) {}
    return false;
  }

  const expectedHex = crypto.createHmac('sha256', lipanaSecret).update(raw).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', lipanaSecret).update(raw).digest('base64');

  // Log computed signatures (masked) for easier comparison
  try {
    // attach for downstream debugging/storage
    if (req) {
      req._incomingSignature = signature || '';
      req._computedHmacHex = expectedHex;
      req._computedHmacB64 = expectedBase64;
      req._rawPreviewHex = raw && raw.slice(0,64) ? raw.slice(0,64).toString('hex') : '';
    }
    console.log('[verifySignature] Computed expectedHex(first16)= - app.js:1139', expectedHex.slice(0,16), '...');
    console.log('[verifySignature] Computed expectedBase64(first16)= - app.js:1140', expectedBase64.slice(0,16), '...');
  } catch (e) {}

  const safeCompare = (aBuf, bBuf) => {
    try { if (!Buffer.isBuffer(aBuf) || !Buffer.isBuffer(bBuf)) return false; if (aBuf.length !== bBuf.length) return false; return crypto.timingSafeEqual(aBuf, bBuf); } catch (e) { return false; }
  };

  // Try hex comparison
  try {
    const sigHexBuf = Buffer.from(signature, 'hex');
    const expectedHexBuf = Buffer.from(expectedHex, 'hex');
    if (safeCompare(sigHexBuf, expectedHexBuf)) return true;
  } catch (e) {
    // not hex
  }

  // Try base64 comparison
  try {
    const sigB64Buf = Buffer.from(signature, 'base64');
    const expectedB64Buf = Buffer.from(expectedBase64, 'base64');
    if (safeCompare(sigB64Buf, expectedB64Buf)) return true;
  } catch (e) {
    // not base64
  }

  return false;
}

// Capture raw body buffer for HMAC verification (use Buffer, not string)
app.post('/webhook/mpesa', express.json({ limit: '1mb', verify: (req, res, buf, encoding) => { req.rawBody = buf; } }), async (req, res) => {
  // Verify signature if possible. Don't return 401 here — persist the payload
  // and audit the signature so we can debug mismatches without returning 5xx/4xx
  // to Lipana which would trigger retries.
  const sigOk = verifySignature(req);
  if (!sigOk) {
    log('WARN', 'WEBHOOK', 'Invalid Lipana signature (will still persist payload for debugging)', { ip: req.ip });
    // continue — we will store the incoming signature and computed hmacs below
  }
  try {
    log('INFO', 'WEBHOOK', 'Webhook received', { body: req.body });
    // insert into webhooks table (raw_payload stored as jsonb)
    // Use a dedicated pg Client with SSL enabled to satisfy Render Postgres
    const q = `INSERT INTO webhooks(event, transaction_id, amount, phone, reference, message, timestamp, raw_payload, created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now()) RETURNING id`;
    const vals = [
      req.body.event || null,
      req.body.transaction_id || req.body.transactionId || null,
      req.body.amount || null,
      req.body.phone || req.body.msisdn || null,
      req.body.reference || req.body.tx_ref || null,
      req.body.message || null,
      req.body.timestamp || new Date().toISOString(),
      JSON.stringify(req.body)
    ];
    let webhookId = null;
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const insertRes = await client.query(q, vals);
      webhookId = insertRes && insertRes.rows && insertRes.rows[0] ? insertRes.rows[0].id : null;
      try { await client.end(); } catch (e) {}
    } catch (clientErr) {
      // If client-based insert fails, attempt to fallback to the shared pool (if available)
      try {
        const insertRes = await pool.query(q, vals);
        webhookId = insertRes && insertRes.rows && insertRes.rows[0] ? insertRes.rows[0].id : null;
      } catch (poolErr) {
        throw clientErr; // surface original client error
      }
    }

    // persist incoming signature and computed hmacs into a companion table for offline diffs
    try {
      if (webhookId) {
        // create companion table if missing
        const createTableSql = `CREATE TABLE IF NOT EXISTS webhook_signatures (
          id bigserial primary key,
          webhook_id bigint references webhooks(id) on delete cascade,
          incoming_signature text,
          computed_hmac_hex text,
          computed_hmac_b64 text,
          created_at timestamptz default now()
        )`;
        await pool.query(createTableSql);

        const incoming = req._incomingSignature || (req.headers['x-lipana-signature'] || '');
        const hex = req._computedHmacHex || '';
        const b64 = req._computedHmacB64 || '';
        // mask values for storage preview (first/last 8 chars)
        const mask = (s) => { try { if (!s || s.length < 24) return s; return `${s.slice(0,8)}...${s.slice(-8)}` } catch(e){ return s; } };

        const insSql = `INSERT INTO webhook_signatures(webhook_id, incoming_signature, computed_hmac_hex, computed_hmac_b64)
          VALUES($1,$2,$3,$4)`;
        const insVals = [webhookId, mask(String(incoming)), mask(String(hex)), mask(String(b64))];
        await pool.query(insSql, insVals);
      }
    } catch (ee) {
      log('WARN', 'WEBHOOK', 'Failed to persist webhook signature audit', { err: ee?.message || String(ee) });
    }

    // Attempt to route M-Pesa / STK style callbacks into the existing payment handler
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const handlerResult = await handleMpesaCallback(req, redis, tg).catch(err => {
        log('WARN', 'WEBHOOK', 'handleMpesaCallback threw error', { err: err && err.message ? err.message : String(err) });
        return null;
      });

      if (handlerResult && handlerResult.success) {
        log('INFO', 'WEBHOOK', 'M-Pesa callback processed by payment handler', { result: handlerResult });
      } else if (handlerResult && handlerResult.success === false) {
        log('INFO', 'WEBHOOK', 'M-Pesa callback received but not processed (mapping/missing)', { result: handlerResult });
      } else {
        log('DEBUG', 'WEBHOOK', 'M-Pesa callback did not match payment handler criteria');
      }
    } catch (e) {
      log('ERROR', 'WEBHOOK', 'Error while dispatching to payment handler', { err: e && e.message ? e.message : String(e) });
    }

    return res.status(200).send('OK');
  } catch (err) {
    // Don't return 500 to the provider. Log in detail and return 200 so
    // Lipana doesn't keep retrying while we investigate.
    log('ERROR', 'WEBHOOK', 'DB insert error (persist failed) — payload will be logged for offline debugging', { err: err?.message || String(err), bodyPreview: (req.rawBody && req.rawBody.toString('utf8',0,500)) || JSON.stringify(req.body || {}) });
    try {
      // best-effort: write raw payload to disk for later inspection (only in debugging runs)
      const preview = (req.rawBody && req.rawBody.toString('utf8',0,1000)) || JSON.stringify(req.body || {});
      // Try to avoid exceptions while writing files
      try { require('fs').writeFileSync('./failed_webhook_preview.txt', preview); } catch(e) {}
    } catch(e) {}
    return res.status(200).send('OK');
  }
});

// Temporary debug endpoint: echo masked headers + small raw-body preview
app.post('/webhook/debug-echo', express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), (req, res) => {
  try {
    const headers = {};
    Object.keys(req.headers || {}).forEach(k => {
      if (k.startsWith('x-') || k.includes('signature') || k.includes('lipana')) {
        const v = String(req.headers[k] || '');
        headers[k] = v ? `${v.slice(0,12)}...len:${v.length}` : '(empty)';
      }
    });
    const rawPreview = (req.rawBody && req.rawBody.slice(0, 200).toString('utf8')) || JSON.stringify(req.body || {});
    return res.status(200).json({ ok: true, path: req.path, headerPreview: headers, rawPreview });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e) });
  }
});

// Manual verify (user clicked "I have paid") - orderId in URL
app.post(
  "/webhook/payment/manual/:orderId",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await verifyPaymentManual(req, redis, tg, orderId);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Manual verify failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Manual verify error"));
    }
  }
);

// Basic auth helper for admin endpoints
function checkBasicAuth(req) {
  const auth = req.headers['authorization'] || '';
  // Diagnostic logging: show what the process expects and what was received (masked)
  try {
    const expectedUser = process.env.ADMIN_USERNAME || ADMIN_USERNAME;
    const expectedPass = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;
    const mask = s => (typeof s === 'string' && s.length > 2) ? `${s[0]}***${s[s.length-1]}` : (s ? '***' : '');
    // Use existing log helper so messages go to the same place as other app logs
    log('DEBUG', 'AUTH', 'Admin auth check - expected (masked)', { expectedUser, expectedPass: mask(expectedPass) });

    if (!auth.startsWith('Basic ')) {
      log('WARN', 'AUTH', 'Missing or non-Basic Authorization header', { headerPreview: auth ? auth.slice(0,20) + '...' : null });
      return false;
    }

    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    log('DEBUG', 'AUTH', 'Admin auth check - received (masked)', { userReceived: user, passReceived: mask(pass) });

    return user === expectedUser && pass === expectedPass;
  } catch (e) {
    log('ERROR', 'AUTH', 'Error in checkBasicAuth', { err: e?.message || String(e) });
    return false;
  }
}

// Admin HMAC compute endpoint — returns hex + base64 HMACs for a supplied payload using current LIPANA_SECRET
app.post('/admin/hmac', authenticateAdmin, express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  try {
    const secret = process.env.LIPANA_SECRET || '';
    if (!secret) return res.status(400).json({ ok: false, error: 'LIPANA_SECRET not set' });
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const hex = crypto.createHmac('sha256', String(secret).trim()).update(raw).digest('hex');
    const b64 = crypto.createHmac('sha256', String(secret).trim()).update(raw).digest('base64');
    return res.status(200).json({ ok: true, computed: { hex, base64: b64 } });
  } catch (e) { return res.status(500).json({ ok: false, error: String(e) }); }
});

// Admin: replay saved webhook into payment handler for end-to-end testing
app.post('/admin/replay-webhook/:id', authenticateAdmin, express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await pool.query('SELECT raw_payload FROM webhooks WHERE id = $1', [id]);
    if (!row || !row.rows || !row.rows[0]) return res.status(404).json({ ok: false, error: 'Webhook not found' });
    const payload = row.rows[0].raw_payload;
    // construct a fake req-like object for payment handler
    const fakeReq = { body: payload, headers: {} };
    const tg = new TelegramService(TELEGRAM_TOKEN);
    const result = await handleMpesaCallback(fakeReq, redis, tg).catch(e => ({ success: false, error: String(e) }));
    return res.status(200).json({ ok: true, result });
  } catch (e) { return res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

// Admin: initiate a Lipana STK push (basic auth protected)
app.post('/admin/stk', authenticateAdmin, express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  try {
    const { phone, amount, userId } = req.body || {};
    if (!phone || !amount) return res.status(400).json({ ok: false, error: 'phone and amount required' });

    // Create a short-lived order via existing helper
    let order;
    try {
      order = await createCustomPaymentOrder(redis, userId || 0, Number(amount), 'MPESA', 'KE', { phone });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to create order', detail: e?.message || String(e) });
    }

    let providerCheckout = null;
    try {
      const callback = process.env.LIPANA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || null;
      const resp = await lipana.stkPush({ amount: order.totalAmount || amount, phone: String(phone), tx_ref: order.orderId, reference: order.orderId, callback_url: callback });
      providerCheckout = resp?.raw?.data?.transactionId || resp?.raw?.data?._id || null;

      // persist payments row
      try {
        const connStr = process.env.DATABASE_URL || null;
        if (connStr) {
          const { Pool } = await import('pg');
          const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
          const metadata = { provider: 'LIPANA', provider_checkout_id: providerCheckout, orderId: order.orderId };
          const insertSql = `INSERT INTO payments(tx_ref, user_id, amount, status, metadata, created_at) VALUES($1,$2,$3,$4,$5, now())`;
          await pool.query(insertSql, [order.orderId, userId || 0, order.totalAmount || amount, 'pending', JSON.stringify(metadata)]);
          try { await pool.end(); } catch(e){}
        }
      } catch (ee) {
        // log but continue
        log('WARN', 'ADMIN', 'Failed to persist payments row for admin STK', { err: ee?.message || String(ee) });
      }

      if (providerCheckout) {
        try { await redis.setex(`payment:by_provider_ref:MPESA:${providerCheckout}`, 900, order.orderId); } catch(e){}
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Lipana STK push failed', detail: e?.message || String(e) });
    }

    return res.status(200).json({ ok: true, order, providerCheckout });
  } catch (e) { return res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

// Temporary debug endpoint to initiate a Lipana STK push without admin UI,
// guarded by the `ADMIN_DEBUG_TOKEN` env var. Intended for short-lived
// debugging during deployment — remove after verification.
app.post('/admin/debug/stk', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  try {
    const token = (process.env.ADMIN_DEBUG_TOKEN || '').trim();
    const provided = req.headers['x-admin-debug-token'] || req.query?.token || req.body?.token;
    if (!token) return res.status(500).json({ ok: false, error: 'ADMIN_DEBUG_TOKEN not configured' });
    if (!provided || String(provided) !== String(token)) return res.status(403).json({ ok: false, error: 'Invalid debug token' });

    const { phone, amount, userId } = req.body || {};
    if (!phone || !amount) return res.status(400).json({ ok: false, error: 'phone and amount required' });

    // Create a short-lived order via existing helper
    let order;
    try {
      order = await createCustomPaymentOrder(redis, userId || 0, Number(amount), 'MPESA', 'KE', { phone });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to create order', detail: e?.message || String(e) });
    }

    let providerCheckout = null;
    try {
      const callback = process.env.LIPANA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || null;
      const resp = await lipana.stkPush({ amount: order.totalAmount || amount, phone: String(phone), tx_ref: order.orderId, reference: order.orderId, callback_url: callback });
      providerCheckout = resp?.raw?.data?.transactionId || resp?.raw?.data?._id || null;

      // persist payments row (best-effort)
      try {
        const connStr = process.env.DATABASE_URL || null;
        if (connStr) {
          const { Pool } = await import('pg');
          const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
          const metadata = { provider: 'LIPANA', provider_checkout_id: providerCheckout, orderId: order.orderId };
          const insertSql = `INSERT INTO payments(tx_ref, user_id, amount, status, metadata, created_at) VALUES($1,$2,$3,$4,$5, now())`;
          await pool.query(insertSql, [order.orderId, userId || 0, order.totalAmount || amount, 'pending', JSON.stringify(metadata)]);
          try { await pool.end(); } catch (e) {}
        }
      } catch (ee) {
        log('WARN', 'ADMIN_DEBUG', 'Failed to persist payments row for admin debug STK', { err: ee?.message || String(ee) });
      }

      if (providerCheckout) {
        try { await redis.setex(`payment:by_provider_ref:MPESA:${providerCheckout}`, 900, order.orderId); } catch (e) {}
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Lipana STK push failed', detail: e?.message || String(e) });
    }

    return res.status(200).json({ ok: true, order, providerCheckout });
  } catch (e) { return res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

// Temporary debug endpoint to dump recent webhook rows from Postgres.
// Protected by admin Basic auth + ADMIN_DEBUG_TOKEN. Remove after use.
app.get('/admin/debug/dbdump', authenticateAdmin, async (req, res) => {
  try {
    const token = (process.env.ADMIN_DEBUG_TOKEN || '').trim();
    const provided = req.headers['x-admin-debug-token'] || req.query?.token;
    if (!token) return res.status(500).json({ ok: false, error: 'ADMIN_DEBUG_TOKEN not configured' });
    if (!provided || String(provided) !== String(token)) return res.status(403).json({ ok: false, error: 'Invalid debug token' });

    const limit = Number(req.query.limit) || 50;
    const sigRes = await pool.query('SELECT * FROM webhook_signatures ORDER BY created_at DESC LIMIT $1', [limit]);
    const whRes = await pool.query('SELECT * FROM webhooks ORDER BY created_at DESC LIMIT $1', [limit]);

    return res.status(200).json({ ok: true, signatures: sigRes.rows, webhooks: whRes.rows });
  } catch (err) {
    log('ERROR', 'ADMIN_DEBUG', 'DB dump failed', { err: err?.message || String(err) });
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ============================================================================
// ERROR HANDLING & 404
// ============================================================================
app.use((req, res) => res.status(404).json(formatResponse(false, null, "Not found")));

app.use((err, req, res, next) => {
  log("ERROR", "EXPRESS", "Unhandled error", { message: err?.message, stack: err?.stack });
  if (res.headersSent) return next(err);
  res.status(500).json(formatResponse(false, null, "Internal server error"));
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("INFO", "SHUTDOWN", "Initiating graceful shutdown");
  try {
    server.close(() => log("INFO", "SHUTDOWN", "HTTP server closed"));
    wss.clients.forEach(ws => { try { ws.close(1001, "Server shutting down"); } catch {} });
    await redis.quit().catch(() => {});
    log("INFO", "SHUTDOWN", "Redis connection closed");
  } catch (err) {
    log("ERROR", "SHUTDOWN", "Shutdown error", { err: err.message });
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// START SERVER
// ============================================================================
const start = async () => {
  try {
    const adminHash = await redis.get("admin:password");
    if (!adminHash) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await redis.set("admin:password", hash);
      log("INFO", "INIT", "Admin password initialized");
    }

    // Initialize startup data feed (prefetch initializer)
    try {
      const { default: StartupInitializer } = await import('./services/startup-initializer.js');
      const startupInit = new StartupInitializer(redis);
      
      // Non-blocking startup initialization - fetch data in background
      startupInit.initialize()
        .then(() => {
          const status = startupInit.getStatus();
          log("INFO", "STARTUP", "Startup initialization complete", { 
            ready: status.ready,
            sports: status.sports,
            items: status.totalItems
          });
        })
        .catch(err => {
          log("WARN", "STARTUP", "Startup initialization failed, using fallback providers", { 
            error: err?.message || String(err) 
          });
        });
      
      // Store initializer in app locals for access in handlers
      app.locals.startupInit = startupInit;
    } catch (err) {
      log("WARN", "STARTUP", "Could not load startup initializer", { error: err?.message || String(err) });
    }

    server.listen(port, "0.0.0.0", () => {
      log("INFO", "SERVER", "BETRIX Server started", { port, environment: NODE_ENV, version: BETRIX.version });
    });
    // Register webhook if configured
    try {
      if (TELEGRAM_TOKEN && process.env.TELEGRAM_WEBHOOK_URL) {
        const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
        const secret = TELEGRAM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || null;
        const tg = new TelegramService(TELEGRAM_TOKEN);
        const resp = await tg.setWebhook(webhookUrl, ["message", "callback_query"], secret);
        log("INFO", "TELEGRAM", "setWebhook response", { resp });
      } else {
        log("INFO", "TELEGRAM", "Webhook not configured - missing TELEGRAM_TOKEN or TELEGRAM_WEBHOOK_URL");
      }
    } catch (err) {
      log("ERROR", "TELEGRAM", "Failed to set webhook", { err: err?.message || String(err) });
    }
  } catch (err) {
    log("ERROR", "INIT", "Startup failed", { err: err.message });
    process.exit(1);
  }
};

start();

/**
 * Register data exposure API endpoints
 * Called from worker-final.js after sportsAggregator is initialized
 */
export function registerDataExposureAPI(sportsAggregator) {
  try {
    new DataExposureHandler(app, sportsAggregator);
    log("INFO", "DATA_EXPOSURE", "Data exposure API registered successfully", { endpoints: ['/api/data/summary', '/api/data/live', '/api/data/fixtures', '/api/data/match', '/api/data/standings', '/api/data/leagues', '/api/data/cache-info', '/api/data/cache-cleanup', '/api/data/export', '/api/data/schema'] });
  } catch (err) {
    log("ERROR", "DATA_EXPOSURE", "Failed to register data exposure API", { error: err?.message || String(err) });
  }
}

// Export core app pieces and initialized data services for other modules
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - app.js:1599`);
});


