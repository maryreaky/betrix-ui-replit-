# SportMonks Integration (BETRIX)

Summary
-------
This project now includes a lightweight SportMonks integration used as a fallback for live matches when StatPal returns no usable data. The integration lives in `src/services/sportmonks-service.js` and is invoked by the aggregator when configured.

How it works
------------
- `SportMonksService` wraps common endpoints: `livescores`, `fixtures`, `leagues`, `seasons`, `teams`, `players`, `venues`.
- The aggregator (`src/services/sports-aggregator.js`) will attempt to use StatPal first; if StatPal returns no live matches, it will call SportMonks and normalize results using the existing `_formatMatches` pipeline.

Environment
-----------
Set your SportMonks API key in the environment used by the worker process. The config accepts either:

- `SPORTSMONKS_API` or
- `SPORTSMONKS_API_KEY`

Examples (PowerShell):

```powershell
$env:SPORTSMONKS_API = 'your_sportmonks_token_here'
```

Or persist in `.env` on local/dev

Notes & Troubleshooting
-----------------------
- The test script `scripts/test-sportmonks.js` can be run to fetch a small sample for quick verification.
- If SportMonks returns empty arrays, check the API key, network access, and whether the SportMonks plan supports the requested endpoints.
- Prefetch data is written to Redis under `betrix:prefetch:live:by-sport` — use `scripts/inspect-redis-prefetch.js` to view current prefetch contents.

Files added/modified
--------------------
- Added: `src/services/sportmonks-service.js`
- Modified: `src/services/sports-aggregator.js` (instantiate `SportMonksService` and fallback for live matches)
- Modified: `src/handlers/telegram-handler-v2.js` (try SportMonks when StatPal empty)
- Added: `scripts/test-sportmonks.js` (quick connectivity test)
- Added: `scripts/inspect-redis-prefetch.js` (inspect Redis prefetch keys)

Next steps
----------
1. Ensure `SPORTSMONKS_API` is available to the production worker process (system env or process manager config).
2. Restart the worker (ensure `dotenv` is loaded or env set) so prefetch runs and `betrix:prefetch:live:by-sport` is updated.
3. Confirm Telegram live menu displays real team names. If still showing placeholders, verify Redis connectivity and that prefetch `samples` arrays contain normalized matches.

Recent changes (automatic update)
--------------------------------
- Added pagination to live menus with `Prev` / `Next` / `Refresh` support (`src/handlers/menu-handler.js`).
- Telegram callback handler now handles menu paging and refresh (`menu_live_page:` / `menu_live_refresh:`) in `src/handlers/telegram-handler-v2.js`.
- SportMonks service now accepts multiple env var names (`SPORTSMONKS_API`, `SPORTSMONKS_API_KEY`) and has retry/backoff on fetches (`src/services/sportmonks-service.js`).
- Prefetch merging: `APIBootstrap.prefetchLiveMatches()` now merges new samples into the existing `betrix:prefetch:live:by-sport` Redis key instead of overwriting it (`src/tasks/api-bootstrap.js`).

If you want me to: I can (A) run the full worker for a short smoke test, (B) add pagination UI on the Telegram side to use `editMessageText` instead of sending new messages, or (C) implement a demo fallback provider to guarantee non-empty menus even with provider outages. Which would you like next?
