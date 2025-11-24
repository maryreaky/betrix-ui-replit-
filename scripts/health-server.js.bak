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
