import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default function createAdminRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null }));

  router.get('/queue', (_req, res) => res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null }));

  router.get('/redis-ping', async (req, res) => {
    try {
      const client = req.app && req.app.locals && req.app.locals.redis;
      if (!client) return res.status(500).json({ status: 'no redis client' });
      const pong = await client.ping();
      return res.json({ status: 'ok', pong });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err?.message || String(err) });
    }
  });

  router.get('/webhook-fallback', (_req, res) => {
    try {
      const logPath = path.join(process.cwd(), 'webhooks.log');
      if (!fs.existsSync(logPath)) return res.json({ ok: true, entries: [] });
      const txt = fs.readFileSync(logPath, 'utf8');
      const lines = txt.split(/\r?\n/).filter(Boolean).slice(-200);
      const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
      return res.json({ ok: true, entries: parsed });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Expose recent unmatched requests captured by app's final 404 logger
  router.get('/debug-404', (_req, res) => {
    try {
      const logPath = path.join(process.cwd(), 'debug_404.log');
      if (!fs.existsSync(logPath)) return res.json({ ok: true, entries: [] });
      const txt = fs.readFileSync(logPath, 'utf8');
      const lines = txt.split(/\r?\n/).filter(Boolean).slice(-200);
      return res.json({ ok: true, entries: lines });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Diagnostic: list registered routes on the app
  router.get('/routes', (_req, res) => {
    try {
      const app = _req.app || _req.router && _req.router.app;
      const routes = [];
      const stack = (app && app._router && app._router.stack) || [];
      stack.forEach((layer) => {
        try {
          if (layer.route) {
            routes.push({ path: layer.route.path, methods: Object.keys(layer.route.methods) });
          } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            // find mount path if present
            const mountPath = layer.regexp && layer.regexp.fast_slash ? '' : (layer.regexp && layer.regexp.source) || '';
            layer.handle.stack.forEach((l) => {
              if (l.route) routes.push({ path: (mountPath || '') + l.route.path, methods: Object.keys(l.route.methods) });
            });
          }
        } catch (e) { /* ignore per-layer errors */ }
      });
      return res.json({ ok: true, routes });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return router;
}
