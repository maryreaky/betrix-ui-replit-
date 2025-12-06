#!/usr/bin/env node
// Starts the dev server, waits for port 5000 to accept TCP, then runs the STK simulator.
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';

const serverCmd = process.execPath; // node
const serverArgs = [path.join('scripts', 'run_server_dev.js')];

function waitForPort(host, port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const s = net.createConnection({ host, port }, () => {
        s.end();
        resolve(true);
      });
      s.on('error', (err) => { void err; if (Date.now() - start > timeoutMs) return reject(new Error('timeout')); setTimeout(attempt, 200); });
    })();
  });
}

async function run() {
  console.log('Starting dev server...');
  const child = spawn(serverCmd, serverArgs, { stdio: 'inherit', shell: false, env: process.env });

  try {
    await waitForPort('127.0.0.1', 5000, 15000);
    console.log('Port 5000 is accepting connections — running simulator');
    // Run simulator in same process
    const sim = spawn(serverCmd, [path.join('scripts', 'simulate_stk_e2e.js')], { stdio: 'inherit', shell: false, env: process.env });
    sim.on('exit', (code) => {
      console.log('Simulator exited with code', code);
      // Kill server child and exit with simulator code
      try { child.kill('SIGINT'); } catch (e) { console.error('error killing server child', e); }
      process.exit(code || 0);
    });
    sim.on('error', (err) => {
      console.error('Simulator failed', err);
      try { child.kill('SIGINT'); } catch (e) { console.error('error killing server child', e); }
      process.exit(1);
    });
  } catch (e) {
    console.error('Port wait failed', e && e.message ? e.message : e);
    try { child.kill('SIGINT'); } catch (er) { console.error('error killing server child', er); }
    process.exit(2);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
