try {
  if (typeof globalThis.app !== 'undefined' && globalThis.app && globalThis.app.use) {
    globalThis.app.use(require('./server/telegram-fixed'));
    console.log('MOUNTED: ./server/telegram-fixed');
  }
} catch (e) {
  console.error('MOUNT_FAILED_FIXED', e && e.stack ? e.stack : String(e));
}

try {
  // Ensure telegram router is mounted so POST /telegram is registered
  const _tg = require('./server/telegram');
  if (_tg && typeof _tg === 'function') {
    if (typeof globalThis.app !== 'undefined' && globalThis.app && globalThis.app.use) {
      globalThis.app.use(_tg);
      console.log('MOUNTED: ./server/telegram (function export)');
    }
  } else if (_tg && _tg.router) {
    if (typeof globalThis.app !== 'undefined' && globalThis.app && globalThis.app.use) {
      globalThis.app.use(_tg.router);
      console.log('MOUNTED: ./server/telegram (router export)');
    }
  } else {
    if (typeof globalThis.app !== 'undefined' && globalThis.app && globalThis.app.use) {
      globalThis.app.use(_tg);
      console.log('MOUNTED: ./server/telegram (assumed middleware)');
    }
  }
} catch(e){
  console.error('MOUNT_TELEGRAM_IN_SERVER_ORIG_FAILED', e && e.stack ? e.stack : String(e));
}


