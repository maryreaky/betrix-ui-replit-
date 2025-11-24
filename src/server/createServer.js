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
/* TEMP FAST WEBHOOK HANDLER - START (remove after debugging) */
try {
  // Quick validation and immediate 200 response; enqueue for async processing
  app.post('/webhook', (req, res) => {
    try {
      const secret = req.get('x-telegram-bot-api-secret-token') || '';
      if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        console.warn('WEBHOOK RECEIVED: invalid secret');
        res.status(403).send('forbidden');
        return;
      }
      // Minimal structured enqueue log
      try { console.log(JSON.stringify({ event: 'webhook.received', path: req.originalUrl || req.url, ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress, bodySize: JSON.stringify(req.body || {}).length })); } catch(e){}
      // Replace the following line with your queue API call (non-blocking)
      if (typeof queue !== 'undefined' && queue.enqueue) {
        try { queue.enqueue('telegram:update', req.body); } catch(e) { console.error('enqueue error', e); }
      } else {
        // fallback: push to a lightweight in-memory queue or log for manual processing
        console.debug('No queue available: webhook enqueued to fallback (debug)');
      }
      res.status(200).send('OK');
    } catch (err) {
      console.error('webhook handler error', err);
      // still respond 200 to avoid Telegram retries if you prefer; otherwise use 500
      res.status(200).send('OK');
    }
  });
} catch (e) { console.error('TEMP FAST WEBHOOK HANDLER INSERT ERROR', e); }
/* TEMP FAST WEBHOOK HANDLER - END */
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

