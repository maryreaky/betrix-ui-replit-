
// Entrypoint: start the web server. Prefer importing the canonical `app` from
// `src/app.js` (which exports an Express `app`). Fall back to the legacy
// `startServer` exported by `src/server.js` if present.
import app from './app.js';

const PORT = process.env.PORT || process.env.RENDER_PORT || 3000;

if (app && typeof app.listen === 'function') {
  app.listen(PORT, '0.0.0.0', () => console.log(`SERVER: listening on port ${PORT}`));
} else {
  try {
    // dynamic import as a fallback for older server bootstrap implementations
    // `startServer` will itself call `listen` and handle shutdown hooks.
    // Use top-level await (ESM) to load only when needed.
    const mod = await import('./server.js');
    if (mod && typeof mod.startServer === 'function') {
      mod.startServer();
    } else if (mod && mod.default && typeof mod.default.listen === 'function') {
      mod.default.listen(PORT, '0.0.0.0', () => console.log(`SERVER: listening on port ${PORT}`));
    } else {
      console.error('No valid server entrypoint found (app or startServer)');
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to start server:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}
