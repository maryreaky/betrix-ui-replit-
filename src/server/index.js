// Auto-generated wrapper to export createServer correctly for bootstrap
try {
  const mod = require('./app');
  if (mod && typeof mod.createServer === 'function') {
    module.exports = { createServer: mod.createServer };
  } else if (typeof mod === 'function') {
    module.exports = { createServer: mod };
  } else if (mod && (mod.default && typeof mod.default === 'function')) {
    module.exports = { createServer: mod.default };
  } else {
    // fallback: no createServer found; export the module as-is for debugging
    module.exports = mod || {};
    console.error('WRAPPER-WARN: no createServer found in ./app; exported module as-is');
  }
} catch (e) {
  console.error('WRAPPER-ERR', e && (e.stack || e.message || String(e)));
  module.exports = {};
}

const telegramRouter = require('./telegram-webhook');
app.use(telegramRouter);
