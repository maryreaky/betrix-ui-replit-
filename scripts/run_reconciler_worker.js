#!/usr/bin/env node
// Runs `reconcile_pending.js` periodically and logs output to logs/reconciler.log
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';

const intervalMs = Number(process.env.RECONCILE_INTERVAL_MS) || 5 * 60 * 1000; // 5 minutes
const script = path.resolve(process.cwd(), 'scripts', 'reconcile_pending.js');
const logPath = path.resolve(process.cwd(), 'logs', 'reconciler.log');

function appendLog(data){
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, data + '\n');
}

function notifyAdmin(text){
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
  if(!botToken || !chatId){
    appendLog(new Date().toISOString() + ' - Admin notify skipped (no TELEGRAM_BOT_TOKEN or ADMIN_TELEGRAM_CHAT_ID)');
    return Promise.resolve();
  }
  return new Promise((resolve)=>{
    const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload, 'utf8')
      }
    };
    const req = https.request(`https://api.telegram.org/bot${botToken}/sendMessage`, opts, (res)=>{
      let body = '';
      res.on('data', c=> body += c.toString());
      res.on('end', ()=>{
        appendLog(new Date().toISOString() + ' - Admin notify response code=' + res.statusCode + ' body=' + body.slice(0,200));
        resolve();
      });
    });
    req.on('error', (err)=>{
      appendLog(new Date().toISOString() + ' - Admin notify error: ' + String(err));
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

async function sendEmailAdmin(subject, bodyText){
  const adminEmail = process.env.ADMIN_EMAIL;
  if(!adminEmail){
    appendLog(new Date().toISOString() + ' - Email notify skipped (no ADMIN_EMAIL)');
    return;
  }
  try{
    // try dynamic import of nodemailer
    const nm = await import('nodemailer');
    const transporter = nm.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || `no-reply@${require('os').hostname()}`;
    const info = await transporter.sendMail({ from, to: adminEmail, subject, text: bodyText });
    appendLog(new Date().toISOString() + ' - Email notify sent: ' + (info && info.messageId ? info.messageId : JSON.stringify(info).slice(0,200)));
  }catch(err){
    appendLog(new Date().toISOString() + ' - Email notify failed (nodemailer missing or error): ' + String(err));
    appendLog('To enable email alerts run: npm install nodemailer and set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ADMIN_EMAIL');
  }
}

async function runOnce(){
  appendLog(new Date().toISOString() + ' - Starting reconcile run');
  const child = spawn(process.execPath, [script], { env: process.env });
  child.stdout.on('data', async d => {
    const text = d.toString().trim();
    appendLog(new Date().toISOString() + ' STDOUT: ' + text);
    // detect updated payment lines like: "Updated payment <tx_ref> -> success"
    try{
      const m = text.match(/Updated payment\s+(\S+)\s+->\s+(success|failed|timeout)/i);
      if(m){
        const tx = m[1];
        const status = m[2];
        const msg = `Reconciler: payment ${tx} transitioned to ${status}`;
        appendLog(new Date().toISOString() + ' - Detected transition: ' + msg);
        await notifyAdmin(msg);
        // also attempt email fallback
        try{ await sendEmailAdmin(`Reconciler: payment ${tx} ${status}`, msg); }catch(e){ appendLog(new Date().toISOString() + ' - sendEmailAdmin error: ' + String(e)); }
      }
    }catch(e){ appendLog(new Date().toISOString() + ' - Error parsing child output: ' + String(e)); }
  });
  child.stderr.on('data', d => appendLog(new Date().toISOString() + ' STDERR: ' + d.toString().trim()));
  return new Promise((resolve) => child.on('close', code => {
    appendLog(new Date().toISOString() + ` - Reconcile exited with code ${code}`);
    resolve(code);
  }));
}

(async function main(){
  appendLog(new Date().toISOString() + ' - Reconciler worker starting (interval ' + intervalMs + 'ms)');
  // run immediately then every interval
  while(true){
    try{
      await runOnce();
    }catch(err){
      appendLog(new Date().toISOString() + ' - Reconciler run error: ' + String(err));
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
})();
