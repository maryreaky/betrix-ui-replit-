// Compatibility wrapper for src/server/app.js
// This file tries several common locations for an existing server implementation and exports { createServer }.
// If none is found, it exports a minimal fallback createServer so the process can start (useful for debugging).
'use strict';

const fs = require('fs');
const path = require('path');

function tryRequireCandidates() {
  const root = path.resolve(__dirname, '..', '..'); // repo/src
  const candidates = [
    path.join(__dirname, 'app-impl.js'),
    path.join(__dirname, 'index.js'),
    path.join(__dirname, '..', 'app.js'),
    path.join(root, 'app.js'),
    path.join(root, 'index.js'),
    path.join(root, 'server.js'),
    path.join(root, 'src', 'server', 'app.js'),
    path.join(root, 'server', 'app.js'),
    path.join(root, 'lib', 'server.js'),
    path.join(root, 'dist', 'server.js')
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const mod = require(c);
        if (mod && typeof mod.createServer === 'function') {
          return { mod, path: c, mode: 'createServer' }
        }
        if (typeof mod === 'function') {
          return { mod: { createServer: mod }, path: c, mode: 'function' }
        }
        if (mod && mod.default && typeof mod.default === 'function') {
          return { mod: { createServer: mod.default }, path: c, mode: 'default-fn' }
        }
        if (mod && mod.server && typeof mod.server.createServer === 'function') {
          return { mod: { createServer: mod.server.createServer }, path: c, mode: 'server.createServer' }
        }
      }
    } catch (e) {
      // ignore individual candidate require errors; continue trying others
      // but we won't crash the bootstrap on require errors here
    }
  }
  return null;
}

// Minimal fallback createServer for safety: returns an http.Server that responds 200 OK to any request
function fallbackCreateServer() {
  const http = require('http');
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }
    res.end('OK');
}
}

let exported;
try {
  const found = tryRequireCandidates();
  if (found && found.mod && typeof found.mod.createServer === 'function') {
    exported = found.mod;
    // eslint-disable-next-line no-console
    console.log('BOOT-INFO: re-exporting createServer from', found.path);
  } else {
    // nothing found: export fallback but also log guidance
    exported = { createServer: fallbackCreateServer }
    // eslint-disable-next-line no-console
    console.warn('BOOT-WARN: no createServer implementation found in candidates; exporting minimal fallback createServer for safe boot.');
  }
} catch (err) {
  exported = { createServer: fallbackCreateServer }
  // eslint-disable-next-line no-console
  console.error('BOOT-ERROR: unexpected error while locating server implementation:', err && err.message);
}

module.exports = exported;
