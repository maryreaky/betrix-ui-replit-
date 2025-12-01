#!/usr/bin/env node
// Sanitize logs and JSON dumps for sharing with Lipana support.
// Redacts phone numbers (msisdn) and user IDs and writes sanitized copies to `artifacts/sanitized`.
import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const sources = [
  path.join(repoRoot, 'logs', 'webhook_tail.txt'),
  path.join(repoRoot, 'webhooks_recent.json'),
  path.join(repoRoot, 'payments_recent.json')
];

function redactPhone(value){
  if(typeof value !== 'string') return value;
  // common msisdn patterns: +2547..., 2547..., 07..., 7XXXXXXXX
  const phoneRegex = /(?:\+?2547\d{8}|2547\d{8}|0?7\d{8}|\+?\d{8,15})/g;
  if(phoneRegex.test(value)) return value.replace(phoneRegex, '<REDACTED_MSISDN>');
  return value;
}

function redactUserId(key, value){
  if(!key) return value;
  const lower = String(key).toLowerCase();
  if(lower === 'user_id' || lower === 'userid' || lower === 'uid' || lower === 'user-id') return '<REDACTED_USER_ID>';
  return value;
}

function redactSecretsByKey(key, value){
  if(!key) return value;
  const lower = String(key).toLowerCase();
  const dsnKeys = ['database_url','connectionstring','dsn','db_uri','dburl','databaseurl','connection_uri','connection_url','postgresql','mongo_uri'];
  const secretKeys = ['password','pass','secret','api_key','apikey','x-api-key','authorization','auth','client_secret','access_token','refresh_token','connectionstring'];
  if(dsnKeys.includes(lower)) return '<REDACTED_DSN>';
  if(secretKeys.includes(lower)) return '<REDACTED_SECRET>';
  return value;
}

function deepRedact(obj){
  if(obj === null || obj === undefined) return obj;
  if(Array.isArray(obj)) return obj.map(deepRedact);
  if(typeof obj === 'object'){
    const out = {};
    for(const k of Object.keys(obj)){
      const v = obj[k];
      if(typeof v === 'string'){
        // redact by key first (DSNs, secrets), then redact phones and user ids inside strings
        const byKey = redactSecretsByKey(k, v);
        if(typeof byKey === 'string' && byKey.startsWith('<REDACTED')){
          out[k] = byKey;
        } else {
          out[k] = redactUserId(k, redactPhone(v));
        }
      }else if(typeof v === 'number'){
        out[k] = redactUserId(k, v) === '<REDACTED_USER_ID>' ? '<REDACTED_USER_ID>' : v;
      }else{
        out[k] = deepRedact(v);
      }
    }
    return out;
  }
  if(typeof obj === 'string') return redactPhone(obj);
  return obj;
}

function sanitizeText(content){
  // redact msisdn-like tokens and anything that looks like user_id: <number>
  let out = content.replace(/(\+?2547\d{8}|2547\d{8}|0?7\d{8}|\+?\d{8,15})/g, '<REDACTED_MSISDN>');
  // redact explicit user_id patterns like "user_id": 12345
  out = out.replace(/(["']?user[_-]?id["']?\s*[:=]\s*)(\d+)/ig, '$1"<REDACTED_USER_ID>"');
  // redact common DSN strings (postgres, postgresql, mysql, mongodb, redis, mssql)
  out = out.replace(/(postgres(?:ql)?:\/\/[^\s"']+|mysql:\/\/[^\s"']+|mongodb(?:\+srv)?:\/\/[^\s"']+|redis:\/\/[^\s"']+|mssql:\/\/[^\s"']+)/ig, '<REDACTED_DSN>');
  // redact API keys-like tokens (very coarse)
  out = out.replace(/([A-Za-z0-9_-]{20,})/g, (m)=>{ if(m.length>40) return '<REDACTED_SECRET>'; return m; });
  return out;
}

async function main(){
  const dest = path.join(repoRoot, 'artifacts', 'sanitized');
  fs.mkdirSync(dest, { recursive: true });
  const created = [];
  for(const src of sources){
    try{
      if(!fs.existsSync(src)) continue;
      const base = path.basename(src);
      const content = fs.readFileSync(src, 'utf8');
      if(base.endsWith('.json')){
        let parsed = null;
        try{ parsed = JSON.parse(content); }catch(e){ parsed = null; }
        let sanitized;
        if(parsed){
          sanitized = deepRedact(parsed);
          const outPath = path.join(dest, base.replace('.json', '.sanitized.json'));
          fs.writeFileSync(outPath, JSON.stringify(sanitized, null, 2), 'utf8');
          created.push(outPath);
        }else{
          // fallback: treat as text
          const out = sanitizeText(content);
          const outPath = path.join(dest, base + '.sanitized.txt');
          fs.writeFileSync(outPath, out, 'utf8');
          created.push(outPath);
        }
      }else{
        const out = sanitizeText(content);
        const outPath = path.join(dest, base + '.sanitized.txt');
        fs.writeFileSync(outPath, out, 'utf8');
        created.push(outPath);
      }
    }catch(err){
      console.error('Skipping', src, err && err.message);
    }
  }
  if(created.length===0){
    console.log('No artifacts found to sanitize. Looked for:', sources.join(', '));
    return;
  }
  console.log('Created sanitized artifacts:');
  for(const c of created) console.log(' -', c);
  console.log('\nNext step (PowerShell): create a zip for support:');
  console.log('Compress-Archive -Path .\\artifacts\\sanitized\\* -DestinationPath .\\artifacts\\lipana_artifacts_YYYYMMDD_HHMMSS.zip');
}

main().catch(e=>{ console.error(e); process.exit(1); });
