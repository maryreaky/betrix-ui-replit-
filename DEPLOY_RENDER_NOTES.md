Render Web + Worker Notes

- `src/app.js` now implements idempotent enqueue for Telegram updates using Redis `SET ... NX` (24h TTL) and pushes updates onto `telegram:updates`.
- A minimal webhook HTTP server is present inside `src/worker-final.js` (enabled by `START_MINIMAL_WEB_ON_WORKER=true` by default). This allows the worker to accept and enqueue webhook payloads if the worker is accidentally started in the web slot. The worker's minimal server performs deduplication as well.
- Added an explicit `/admin/redis-ping` endpoint in `src/app.js` for quick Redis connectivity checks.

Scripts:
- `scripts/render_update_services.ps1` — PowerShell helper to patch Render services (requires `RENDER_API_KEY` + service ids set as env vars). Use it to set the web start command to `npm start` and worker to `npm run worker`.

Security note: rotate any exposed tokens (Telegram, DB, Redis, Render API) immediately and update Render environment variables accordingly.

Post-deploy smoke-checks:
- `curl https://your-render-web.url/admin/health`
- `curl https://your-render-web.url/admin/redis-ping`
- Confirm Telegram webhook: `https://api.telegram.org/bot<NEW_TOKEN>/getWebhookInfo`
