// src/server/routes/admin-webhook.js
const express = require('express');
const https = require('https');
const router = express.Router();

router.post('/webhook/set', async (req, res) => {
  const adminKey = String(req.get('x-admin-key') || '');
  if (!adminKey || adminKey !== String(process.env.ADMIN_KEY || '')) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const adminModule = require('./admin');
    if (adminModule && typeof adminModule.setWebhook === 'function') {
      return adminModule.setWebhook(req, res);
    }
  } catch (e) {
    // ignore and continue with fallback
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.PROTOCOL || 'https'}://${process.env.HOST || 'localhost'}${process.env.PORT ? `:${process.env.PORT}` : ''}/webhook/telegram`;

  if (!botToken || !webhookUrl) {
    return res.status(400).json({
      ok: false,
      error: 'missing TELEGRAM_BOT_TOKEN or WEBHOOK_URL',
      botTokenPresent: !!botToken,
      webhookUrlPresent: !!webhookUrl
    });
  }

  const payload = JSON.stringify({ url: webhookUrl });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${botToken}/setWebhook`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 15000
  };

  const reqp = https.request(options, (resp) => {
    let data = '';
    resp.on('data', (chunk) => (data += chunk));
    resp.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        return res.status(200).json(parsed);
      } catch (e) {
        return res.status(200).send(data);
      }
    });
  });

  reqp.on('error', (err) => res.status(500).json({ ok: false, error: String(err) }));
  reqp.write(payload);
  reqp.end();
});

module.exports = router;
