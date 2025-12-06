#!/usr/bin/env node
// Lightweight dev runner that imports the Express `app` and starts it directly
import dotenv from 'dotenv';
dotenv.config();

import { app } from '../src/server.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger('dev-server');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Dev server listening on port ${PORT}`);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down dev server');
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err && err.stack ? err.stack : String(err));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason && reason.stack ? reason.stack : String(reason));
});

// Keep process alive
setInterval(() => {}, 1 << 30);
