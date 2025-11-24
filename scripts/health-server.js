const http = require("http");
const url = require("url");
const { createQueue } = require("../src/server/queue");
const PORT = process.env.PORT || 10000;
let metricsQueue;

function getMetricsQueue() {
  if (!metricsQueue) metricsQueue = createQueue("betrix-jobs");
  return metricsQueue;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);
  if (pathname === "/healthz") return res.end(JSON.stringify({ ok: true, ts: Date.now() }));
  if (pathname === "/metrics") {
    try {
      const counts = await getMetricsQueue().getJobCounts();
      res.setHeader("Content-Type","application/json");
      return res.end(JSON.stringify({ ok: true, counts }));
    } catch (e) {
      res.statusCode = 500; return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }
  res.end("ok");
});
server.listen(PORT, () => console.log("[health] server listening on port", PORT));

/* COPILOT-READY-ENDPOINT - START
   Idempotent readiness and liveness endpoints.
   - /health: liveness (very cheap)
   - /ready: readiness (returns 200 only when globalThis.__isReady is true)
   This block is safe to insert multiple times; it checks for existing app and markers.
*/
try {
  if (typeof app !== "undefined" && typeof globalThis.__copilotReadyInserted === "undefined") {
    globalThis.__copilotReadyInserted = true;
    if (!app._router || !app._router.stack) {
      // If app exists but router not ready, still attach endpoints
    }
    // Liveness
    if (!app._copilotHasHealth) {
      app.get('/health', (req, res) => {
        try {
          res.status(200).json({ status: 'healthy', uptime: process.uptime(), redis: !!globalThis.redisClient, version: process.env.npm_package_version || process.env.VERSION || 'unknown' });
        } catch (e) { res.status(200).send('ok'); }
      });
      app._copilotHasHealth = true;
    }

    // Readiness
    if (!app._copilotHasReady) {
      app.get('/ready', (req, res) => {
        try {
          res.status(globalThis.__isReady ? 200 : 503).send(globalThis.__isReady ? 'ready' : 'not ready');
        } catch (e) { res.status(503).send('not ready'); }
      });
      app._copilotHasReady = true;
    }
  }
} catch (e) { console.error('COPILOT-READY-ENDPOINT ERROR', e); }
/* COPILOT-READY-ENDPOINT - END */

/* COPILOT-OPS-LIFECYCLE - START
   Idempotent: adds /health and /ready, queue wrapper (Bull/BullMQ/ioredis fallback), and graceful shutdown.
*/
try {
  if (typeof app !== "undefined" && typeof globalThis.__copilotOpsInserted === "undefined") {
    globalThis.__copilotOpsInserted = true;
    // Liveness
    if (!app._copilotHasHealth) {
      app.get('/health', (req, res) => {
        try {
          res.status(200).json({ status: 'healthy', uptime: process.uptime(), redis: !!globalThis.redisClient, version: process.env.npm_package_version || process.env.VERSION || 'unknown' });
        } catch (e) { res.status(200).send('ok'); }
      });
      app._copilotHasHealth = true;
    }
    // Readiness
    if (!app._copilotHasReady) {
      globalThis.__isReady = (typeof globalThis.__isReady === 'undefined') ? true : globalThis.__isReady;
      app.get('/ready', (req, res) => {
        try { res.status(globalThis.__isReady ? 200 : 503).send(globalThis.__isReady ? 'ready' : 'not ready'); } catch (e) { res.status(503).send('not ready'); }
      });
      app._copilotHasReady = true;
    }

    // Queue wrapper
    (function(){
      if (globalThis.queue && globalThis.queue.__copilotWrapped) return;
      const wrapper = { __copilotWrapped: true };
      function safeLog(o){ try{ console.log(JSON.stringify(o)); }catch(e){ console.log(o); } }

      try {
        let QueueClient = null;
        try { QueueClient = require('bullmq').Queue; safeLog({event:'queue.impl','impl':'bullmq'}); } catch(e){}
        if (!QueueClient) { try { QueueClient = require('bull').Queue; safeLog({event:'queue.impl','impl':'bull'}); } catch(e){} }

        if (QueueClient) {
          if (globalThis.myQueue) {
            wrapper.enqueue = async (name,payload)=>{ try{ await globalThis.myQueue.add(name,payload); safeLog({event:'webhook.enqueued',name}); }catch(e){ safeLog({event:'enqueue.error',error:e.message}); } };
            wrapper.drain = async ()=>{ try{ if(globalThis.myQueue.close) await globalThis.myQueue.close(); safeLog({event:'queue.closed'}); }catch(e){ safeLog({event:'drain.error',error:e.message}); } };
          } else {
            try {
              const q = new QueueClient('telegram-updates');
              globalThis.myQueue = q;
              wrapper.enqueue = async (name,payload)=>{ try{ await q.add(name,payload); safeLog({event:'webhook.enqueued',name}); }catch(e){ safeLog({event:'enqueue.error',error:e.message}); } };
              wrapper.drain = async ()=>{ try{ if(q.close) await q.close(); safeLog({event:'queue.closed'}); }catch(e){ safeLog({event:'drain.error',error:e.message}); } };
            } catch(e){ safeLog({event:'queue.create.failed',error:e.message}); }
          }
        }
      } catch(e){ safeLog({event:'queue.require.failed',error:e.message}); }

      if (!wrapper.enqueue || !wrapper.drain) {
        try {
          const IORedis = require('ioredis');
          const redisUrl = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
          const redisClient = new IORedis(redisUrl);
          globalThis.redisClient = redisClient;
          wrapper.enqueue = async (name,payload)=>{ try{ await redisClient.rpush('queue:telegram:updates', JSON.stringify(payload)); safeLog({event:'webhook.enqueued.redis'}); }catch(e){ safeLog({event:'enqueue.redis.error',error:e.message}); } };
          wrapper.drain = async ()=>{ try{ const timeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS||'30000',10); const start=Date.now(); while((Date.now()-start)<timeout){ const len = await redisClient.llen('queue:telegram:updates'); if(len===0) break; await new Promise(r=>setTimeout(r,200)); } safeLog({event:'queue.drained.redis'}); }catch(e){ safeLog({event:'drain.redis.error',error:e.message}); } };
        } catch(e){ safeLog({event:'ioredis.not.available',error:e.message}); }
      }

      if (!wrapper.enqueue) wrapper.enqueue = async (name,payload)=>{ safeLog({event:'enqueue.noop',name}); };
      if (!wrapper.drain) wrapper.drain = async ()=>{ safeLog({event:'drain.noop'}); };

      globalThis.queue = wrapper;
      safeLog({event:'queue.wrapper.ready'});
    })();

    // Graceful shutdown
    (function(){
      const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000',10);
      let shuttingDown = false;
      let inflight = 0;
      app.use((req,res,next)=>{
        if (shuttingDown) { res.setHeader('Connection','close'); return res.status(503).send('shutting down'); }
        inflight++; res.on('finish',()=>{ inflight = Math.max(0,inflight-1); }); next();
      });
      async function doShutdown(signal){
        if (shuttingDown) return; shuttingDown = true; globalThis.__isReady = false;
        console.info(JSON.stringify({event:'shutdown.initiated',signal,timestamp:new Date().toISOString(),inflight}));
        try{ if(typeof server !== 'undefined' && server && server.close) server.close(()=>{ console.info(JSON.stringify({event:'http.closed',timestamp:new Date().toISOString()})); }); }catch(e){ console.error('error closing server',e); }
        const start = Date.now();
        while(inflight>0 && (Date.now()-start) < shutdownTimeoutMs){ await new Promise(r=>setTimeout(r,200)); }
        try{ if(globalThis.queue && typeof globalThis.queue.drain === 'function'){ await globalThis.queue.drain(); console.info(JSON.stringify({event:'queue.drained',timestamp:new Date().toISOString()})); } else { console.info('No queue.drain found; best-effort drain.'); } }catch(e){ console.error('queue drain error',e); }
        console.info(JSON.stringify({event:'shutdown.complete',timestamp:new Date().toISOString(),inflight}));
        try{ process.exit(0); }catch(e){}
      }
      process.on('SIGTERM',()=>doShutdown('SIGTERM')); process.on('SIGINT',()=>doShutdown('SIGINT'));
    })();
  }
} catch(e){ console.error('COPILOT-OPS-LIFECYCLE ERROR', e); }
/* COPILOT-OPS-LIFECYCLE - END */
