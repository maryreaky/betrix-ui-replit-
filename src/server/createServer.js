const path = require('path');

let appModule;
try {
  const candidates = [
    path.join(process.cwd(), 'src', 'server', 'app.js'),
    path.join(process.cwd(), 'src', 'index.js'),
    path.join(process.cwd(), 'src', 'server', 'index.js'),
    path.join(process.cwd(), 'server.js'),
    path.join(process.cwd(), 'index.js')
  ];
  for (const c of candidates) {
    try { appModule = require(c); break; } catch (e) { }
  }
} catch (e) {
  appModule = null;
}

if (appModule && typeof appModule.createServer === 'function') {
  module.exports.createServer = appModule.createServer;
} else if (appModule && typeof appModule === 'function') {
  module.exports.createServer = appModule;
} else if (appModule && appModule.default && typeof appModule.default.createServer === 'function') {
  module.exports.createServer = appModule.default.createServer;
} else {
  const express = require('express');
  module.exports.createServer = function createServer() {
    const app = express();
/* COPILOT-HEALTH-READINESS-GUARD - START
   Lightweight /health and /ready endpoints and graceful shutdown handling.
   - /health: liveness probe (very cheap)
   - /ready: readiness probe (set when app is ready to accept traffic)
   - graceful shutdown: stop accepting new requests, wait for in-flight requests and worker drain
   Remove this block when you implement your own production-ready lifecycle management.
*/
try {
  // readiness flag
  if (typeof app !== "undefined" && typeof globalThis.__isReady === "undefined") {
    globalThis.__isReady = true;

    // Liveness: extremely lightweight (no DB/Redis checks)
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    // Readiness: set to true only when app has finished startup tasks
    app.get('/ready', (req, res) => {
      res.status(globalThis.__isReady ? 200 : 503).send(globalThis.__isReady ? 'ready' : 'not ready');
    });

    // Graceful shutdown helper: stop accepting new requests and wait for in-flight
    (function setupGracefulShutdown() {
      if (typeof process === 'undefined' || !process.on) return;
      const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);

      let shuttingDown = false;
      // track in-flight requests
      let inflight = 0;
      app.use((req, res, next) => {
        if (shuttingDown) {
          // refuse new requests during shutdown
          res.setHeader('Connection', 'close');
          return res.status(503).send('shutting down');
        }
        inflight++;
        res.on('finish', () => { inflight = Math.max(0, inflight - 1); });
        next();
      });

      async function doShutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        globalThis.__isReady = false;
        console.info(JSON.stringify({ event: 'shutdown.initiated', signal, timestamp: new Date().toISOString(), inflight }));
        // stop accepting new connections: if you use http.Server, close it if available
        try {
          if (typeof server !== 'undefined' && server && server.close) {
            server.close(() => { console.info(JSON.stringify({ event: 'http.closed', timestamp: new Date().toISOString() })); });
          }
        } catch (e) { console.error('error closing server', e); }

        // wait for inflight to drain or timeout
        const start = Date.now();
        while (inflight > 0 && (Date.now() - start) < shutdownTimeoutMs) {
          await new Promise(r => setTimeout(r, 200));
        }

        // optionally allow worker to finish (if you have a worker drain API, call it here)
        try {
          if (typeof queue !== 'undefined' && queue && queue.drain) {
            await queue.drain(); // best-effort; implement drain in your queue
            console.info(JSON.stringify({ event: 'queue.drained', timestamp: new Date().toISOString() }));
          }
        } catch (e) { /* ignore */ }

        console.info(JSON.stringify({ event: 'shutdown.complete', timestamp: new Date().toISOString(), inflight }));
        // exit process (let platform restart)
        try { process.exit(0); } catch (e) { /* ignore */ }
      }

      process.on('SIGTERM', () => doShutdown('SIGTERM'));
      process.on('SIGINT', () => doShutdown('SIGINT'));
    })();
  }
} catch (e) { console.error('COPILOT-HEALTH-READINESS-GUARD ERROR', e); }
/* COPILOT-HEALTH-READINESS-GUARD - END */
    app.get('/health', (req, res) => res.status(200).send('ok'));
    return app;
  };
}

if (require.main === module) {
  const http = require('http');
  const server = module.exports.createServer();
  const port = process.env.PORT ? Number(process.env.PORT) : (process.env.PORT || process.env.PORT || 3000);
  http.createServer(server).listen(port, () => {
    console.log(`SERVER: listening on port ${port}`);
  });
}


/* COPILOT-WEBHOOK-MINIMAL-GUARD - START
   Minimal webhook handler: validate secret, enqueue, respond 200 immediately.
   Replace queue.enqueue with your queue API.
*/
try {
  if (typeof app !== "undefined" && !app.__hasCopilotWebhook) {
    app.__hasCopilotWebhook = true;
    app.post('/webhook', (req, res) => {
      try {
        const secret = req.get('x-telegram-bot-api-secret-token') || '';
        if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
          console.warn('webhook: invalid secret');
          return res.status(403).send('forbidden');
        }
        // structured enqueue log
        try { console.log(JSON.stringify({ event: 'webhook.received', ts: new Date().toISOString(), size: JSON.stringify(req.body || {}).length })); } catch(e){}
        // enqueue non-blocking
        if (typeof queue !== 'undefined' && queue.enqueue) {
          try { queue.enqueue('telegram:update', req.body); } catch(e) { console.error('enqueue failed', e); }
        } else {
          console.debug('No queue available: webhook received (debug)');
        }
        // respond immediately
        res.status(200).send('OK');
      } catch (err) {
        console.error('webhook handler error', err);
        res.status(200).send('OK');
      }
    });
  }
} catch (e) { console.error('COPILOT-WEBHOOK-MINIMAL-GUARD ERROR', e); }
/* COPILOT-WEBHOOK-MINIMAL-GUARD - END */


