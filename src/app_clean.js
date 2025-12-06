// Minimal clean Express app used by worker during deploy recovery
import express from 'express';
import bodyParser from 'body-parser';
import { DataExposureHandler } from './handlers/data-exposure-handler.js';

process.env.PGSSLMODE = process.env.PGSSLMODE || 'require';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';

const app = express();

app.use(bodyParser.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function safeLog(...args) { try { console.log(...args); } catch (e) { console.error('safeLog error', e); } }

// Minimal endpoints (worker only needs registerDataExposureAPI export)
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.post('/webhook/mpesa', (_req, res) => {
  // worker doesn't handle web traffic; keep a stub to avoid undefined routes
  return res.status(200).send('OK');
});

export function registerDataExposureAPI(sportsAggregator) {
  try { new DataExposureHandler(app, sportsAggregator); safeLog('DATA_EXPOSURE: registered'); }
  catch (err) { safeLog('DATA_EXPOSURE registration failed:', String(err)); }
}

export default app;
