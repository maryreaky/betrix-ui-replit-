// Canonical app module for local testing: Express with Redis ping and webhook handler
import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import { Pool } from 'pg';
import { createClient } from 'redis';

const app = express();
const PORT = Number(process.env.PORT || 5000);

function safeLog(...args) { try { console.log(...args); } catch (e) { /* ignore */ } }

app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function buildPgPoolConfig() {
  const cfg = { connectionString: process.env.DATABASE_URL };
  const mode = String(process.env.PGSSLMODE || '').toLowerCase();
  if (process.env.DATABASE_URL && mode && mode !== 'disable') {
    if (mode === 'verify-ca' || mode === 'verify-full') {
      cfg.ssl = { rejectUnauthorized: true };
      if (process.env.PGSSLROOTCERT) {
        try { cfg.ssl.ca = fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8'); } catch (e) { safeLog('Could not read PGSSLROOTCERT:', e?.message || String(e)); }
      }
    } else {
      cfg.ssl = { rejectUnauthorized: false };
    }
  }
  return cfg;
}

// pool intentionally created for local testing if needed
const pool = new Pool(buildPgPoolConfig());
void pool;

let redisClient = null;
const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI || '';
const redisUsername = process.env.REDIS_USERNAME || process.env.REDIS_USER || undefined;
const redisPassword = process.env.REDIS_PASSWORD || process.env.REDIS_PWD || undefined;
if (redisUrl) {
  try {
    redisClient = createClient({ url: redisUrl, username: redisUsername || undefined, password: redisPassword || undefined, socket: { tls: String(redisUrl).startsWith('rediss://') } });
    redisClient.on('error', (err) => safeLog('Redis error:', err?.message || String(err)));
    (async () => {
      try {
        await redisClient.connect();
        const p = await redisClient.ping();
        safeLog('Redis connected (PING):', p);
      } catch (e) {
        safeLog('Redis connect failed:', e?.message || String(e));
        try {
          await redisClient.disconnect();
        } catch (err2) {
          safeLog('Redis disconnect failed:', err2?.message || String(err2));
        }
        redisClient = null;
      }
    })();
  } catch (e) { safeLog('Failed to create Redis client:', e?.message || String(e)); redisClient = null; }
} else { safeLog('REDIS_URL not set; skipping Redis client initialization'); }
app.locals.redis = redisClient;

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/admin/redis-ping', async (_req, res) => {
  try { const client = app.locals && app.locals.redis; if (!client) return res.status(500).json({ status: 'no redis client' }); const pong = await client.ping(); return res.json({ status: 'ok', pong }); } catch (err) { return res.status(500).json({ status: 'error', message: err?.message || String(err) }); }
});

app.listen(PORT, () => safeLog(`Canonical app listening on ${PORT}`));

export default app;
