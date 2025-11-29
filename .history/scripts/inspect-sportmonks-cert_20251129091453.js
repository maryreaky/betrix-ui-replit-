#!/usr/bin/env node
/**
 * Inspect the TLS certificate presented by api.sportsmonks.com
 * and perform a simple HTTPS GET to show headers and a short body snippet.
 * Run with: node scripts/inspect-sportmonks-cert.js
 */

import tls from 'tls';
import https from 'https';

const HOST = 'api.sportsmonks.com';
const PORT = 443;
const PATHS = [
  '/v3/football/livescores?api_token=' + (process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_TOKEN || process.env.SPORTSMONKS_KEY || ''),
  '/v3/football/fixtures?api_token=' + (process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_TOKEN || process.env.SPORTSMONKS_KEY || ''),
];

function inspectCert() {
  return new Promise((resolve) => {
    const socket = tls.connect(PORT, HOST, { servername: HOST, rejectUnauthorized: false }, () => {
      console.log('== TLS HANDSHAKE COMPLETE ==');
      console.log('authorized:', socket.authorized);
      console.log('authorizationError:', socket.authorizationError);
      const cert = socket.getPeerCertificate(true);
      console.log('\n== PEER CERTIFICATE ==');
      console.log(cert);
      socket.end();
      resolve(cert);
    });

    socket.on('error', (err) => {
      console.error('TLS socket error:', err.message);
      resolve(null);
    });
  });
}

function fetchPath(path) {
  return new Promise((resolve) => {
    const opts = {
      host: HOST,
      port: PORT,
      path,
      method: 'GET',
      headers: { 'User-Agent': 'inspect-sportmonks-cert/1.0' },
      rejectUnauthorized: false // allow reading response even if cert mismatches (dev only)
    };

    const req = https.request(opts, (res) => {
      console.log('\n== HTTPS RESPONSE for', path, '==');
      console.log('statusCode:', res.statusCode);
      console.log('headers:', res.headers);
      let body = '';
      res.on('data', (chunk) => {
        if (body.length < 2000) body += chunk.toString();
      });
      res.on('end', () => {
        console.log('\n== BODY SNIPPET (first 1000 chars) ==');
        console.log(body.substring(0, 1000));
        resolve({ statusCode: res.statusCode, headers: res.headers, bodySnippet: body.substring(0, 1000) });
      });
    });

    req.on('error', (err) => {
      console.error('HTTPS request error for', path, err.message);
      resolve(null);
    });

    req.end();
  });
}

async function main() {
  console.log('Inspecting', HOST);
  await inspectCert();

  for (const p of PATHS) {
    await fetchPath(p);
  }

  console.log('\nDone.');
}

main();
