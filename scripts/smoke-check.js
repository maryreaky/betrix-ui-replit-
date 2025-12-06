// scripts/smoke-check.js
const http = require('http');
const { Queue } = require('bullmq');

(async function(){
  try {
    const healthUrl = process.env.SERVICE_HEALTH_URL || 'http://localhost:3000/health';
    const res = await new Promise((resv, rej) => {
      const req = http.get(healthUrl, r => { resv({ statusCode: r.statusCode }); }).on('error', e => rej(e));
      void req;
    });
    if(res.statusCode && res.statusCode >= 200 && res.statusCode < 300){ console.log('health ok', res.statusCode); } else { throw new Error('health failed ' + JSON.stringify(res)); }
    if(!process.env.REDIS_URL){ console.log('no REDIS_URL in env � skipping enqueue in CI'); process.exit(0); }
    const q = new Queue('betrix-jobs',{connection: (new URL(process.env.REDIS_URL))});
    await q.add('ci-smoke',{msg:'ci-smoke'});
    console.log('enqueued ci-smoke');
    await q.close();
    process.exit(0);
  } catch(e){ console.error('smoke check failed', e.message || e); process.exit(2); }
})();
