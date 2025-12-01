# Betrix Bot (Minimal Scaffold)

This folder contains a minimal Telegraf-based scaffold for the Betrix signup + payment flows.

Files:
- `server.js` — Bot entrypoint with signup and payment UI handlers.
- `db.js` — Minimal Postgres helpers using `pg`.
- `payments.js` — Stubbed M-Pesa STK push implementation (for local dev).

Quick start (from repo root):

1. Install dependencies (if not already):

```powershell
npm install
```

2. Create the DB tables (use the SQL in `migrations/001_create_users_payments.sql`):

```powershell
# Example using psql
psql "${env:DATABASE_URL}" -f migrations/001_create_users_payments.sql
```

3. Create a `.env` file from the project's `.env.example`, set `TELEGRAM_BOT_TOKEN` and `DATABASE_URL`.

4. Run the bot:

```powershell
npm run bot:start
```

Notes:
- The payments module is a stub — replace with real M-Pesa integration when ready.
- This scaffold intentionally keeps logic minimal for fast iteration and tests.