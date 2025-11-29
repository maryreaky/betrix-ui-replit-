#!/usr/bin/env node
/**
 * Local SportMonks relay
 * Because Node's direct TLS path is being intercepted in this environment,
 * this relay invokes PowerShell's Invoke-RestMethod (which succeeds) and
 * exposes the JSON on a localhost HTTP endpoint. Use only for local/dev.
 *
 * Usage: SPORTSMONKS_API=<token> node scripts/sportmonks-relay.js
 */

import http from 'http';
import { exec } from 'child_process';

const PORT = process.env.SPORTSMONKS_RELAY_PORT || 3001;
const API = process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_KEY || process.env.SPORTSMONKS_TOKEN;

if (!API) {
  console.error('SPORTSMONKS API token not set in env (SPORTSMONKS_API)');
  process.exit(1);
}

function fetchLivescoresViaPowershell() {
  return new Promise((resolve, reject) => {
    const uri = `https://api.sportmonks.com/v3/football/livescores?api_token=${API}`;
    // Construct a PowerShell command that returns pure JSON
    const cmd = `powershell -NoProfile -Command "try { (Invoke-RestMethod -Uri '${uri}' -Method Get) | ConvertTo-Json -Depth 5 } catch { Write-Error \"PSERR:$($_.Exception.Message)\"; exit 2 }"`;

    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      // stdout should contain JSON
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        return reject(new Error('Failed to parse JSON from PowerShell output: ' + e.message + '\n' + stdout.substring(0, 2000)));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/v3/football/livescores')) {
    try {
      const data = await fetchLivescoresViaPowershell();
      const body = JSON.stringify(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SportMonks relay listening on http://127.0.0.1:${PORT}`);
  console.log('Proxying:', `http://127.0.0.1:${PORT}/v3/football/livescores?api_token=<TOKEN>`);
});
