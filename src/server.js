/**
 * BETRIX Express Server
 * HTTP API + Telegram Webhook + Admin Dashboard
 */

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Logger } from "./utils/logger.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { betrixIngest } from "./lib/betrix-ingest.js";
import { MpesaCallbackHandler } from "./middleware/mpesa-callback.js";
import { updateStatusByProviderEventId } from './lib/local-payments.js';

const logger = new Logger("Server");
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
// capture raw body for signature verification while still parsing JSON
app.use(express.json({ limit: "10mb", verify: (req, res, buf) => { req.rawBody = buf; } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date(), service: "BETRIX" });
});

// Telegram webhook
app.post("/webhook/telegram", async (req, res) => {
  try {
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("Webhook error", err);
    res.status(500).json({ ok: false });
  }
});

// M-Pesa callback
app.post("/webhook/mpesa", async (req, res) => {
  try {
    // Prefer Lipana signature header (case-insensitive)
    const signatureHeader = req.headers['x-lipana-signature'] || req.headers['x-signature'] || req.headers['x-lipana-hmac'] || '';
    const secret = process.env.LIPANA_SECRET;

    if (!secret) {
      logger.error('LIPANA_SECRET not configured');
      return res.status(500).json({ ok: false, error: 'server misconfigured' });
    }

    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const computed = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    // Use timingSafeEqual to avoid timing attacks
    const valid = signatureHeader && (() => {
      try {
        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
      } catch (e) { return false; }
    })();

    if (!valid) {
      const logDir = path.join(process.cwd(), 'logs');
      const logPath = path.join(logDir, 'webhook.log');
      const logEntry = `${new Date().toISOString()} INVALID signature=${signatureHeader} computed=${computed}\n`;
      try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); fs.appendFileSync(logPath, logEntry); } catch (e){ logger.error('log write failed', e); }
      logger.warn('Invalid Lipana signature');
      return res.status(401).send('Invalid signature');
    }

    // Verified
    const payloadText = raw.toString('utf8');
    let payload = {};
    try { payload = JSON.parse(payloadText); } catch (e) { payload = req.body || {}; }

    const logDir = path.join(process.cwd(), 'logs');
    const logPath = path.join(logDir, 'webhook.log');
    const logEntry = `${new Date().toISOString()} VERIFIED event=${payload.event || 'unknown'} payload=${payloadText}\n`;
    try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); fs.appendFileSync(logPath, logEntry); } catch (e){ logger.error('log write failed', e); }

    // Hand off to ingestion adapter (persist or queue)
    try {
      await betrixIngest(payload);
    } catch (err) {
      logger.error('Ingest failed', err);
      // continue; we still return 200 to the provider to avoid retries
    }

    // If this webhook refers to a local pending payment, update it (simulation-friendly)
    try {
      const providerEventId = payload && payload.data && (payload.data.id || payload.data.transaction_id) ;
      if (providerEventId) {
        const updated = updateStatusByProviderEventId(providerEventId, 'success', { provider: 'lipana' });
        if (updated) logger.info('Local payment updated from webhook', updated.id || updated.tx_ref);
      }
    } catch (e) { logger.error('Local payment update failed', e); }

    // Also call the existing Mpesa handler if this looks like a Daraja/Daraja STK body
    try {
      if (req.body && req.body.Body && req.body.Body.stkCallback) {
        const handler = new MpesaCallbackHandler();
        await handler.handleCallback(req, res);
        return; // handler will have responded
      }
    } catch (err) {
      // If the Mpesa handler throws, we've already ingested; log and respond OK
      logger.info('MpesaCallbackHandler did not complete, but webhook verified and ingested', err);
      return res.status(200).json({ ok: true });
    }

    // Default OK response for non-Daraja webhooks
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Received' });

  } catch (err) {
    logger.error("M-Pesa webhook error", err);
    res.status(500).json({ ok: false });
  }
});

// Start server
export function startServer() {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🚀 Server on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    server.close(() => process.exit(0));
  });

  return server;
}

export { app };
