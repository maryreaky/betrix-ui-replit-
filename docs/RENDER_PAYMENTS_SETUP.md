# Render deployment - Payments / Lipana env vars

This file lists the environment variables required for Lipana (M-Pesa STK) integration and quick checks to verify the deployed service.

Required env vars (Render -> Service -> Environment):

- `LIPANA_API_KEY` – Lipana publishable/server API key (used as `x-api-key` when creating STK pushes)
- `LIPANA_WEBHOOK_SECRET` – HMAC secret Lipana uses to sign webhooks (verify in `verifySignature`)
- `LIPANA_CALLBACK_URL` or `MPESA_CALLBACK_URL` – Public URL Lipana should POST callbacks to (e.g. `https://your-app.onrender.com/webhook/mpesa`)
- `DATABASE_URL` – Postgres connection string for storing payments and webhooks
- `TELEGRAM_TOKEN` – Bot token used to notify users on payment events
- Optional: `LIPANA_API_BASE` – override for Lipana API base URL (default https://api.lipana.dev)

Quick verification steps after deployment

1. Check the service environment page in Render and ensure the above env vars are present and not empty.
2. Tail the service logs and look for the webhook debug lines added earlier (these show raw payload hex and computed HMAC prefixes):
   - `[verifySignature] LIPANA_SECRET fingerprint(first8)= ...`
   - `[verifySignature] Incoming signature(header)= ...`
   - `[verifySignature] Computed expectedHex(first16)= ...`
3. Test STK push creation (use your local helper script or call the API):
   - Run locally (replace URL and key):
     ```pwsh
     node .\scripts\create_lipana_stk_fix.js
     ```
   - Confirm the API returns `201` and a `transactionId`.
4. Send a signed test webhook (the project includes `scripts/send_signed_webhook.js`) to the deployed `https://<your-service>/webhook/mpesa` endpoint.
5. Confirm the webhook is accepted (HTTP 200) and that the `webhooks` table / `payments` table has a row with the `transactionId` and `status` updated.
6. Check Telegram: the user who initiated the payment should receive a notification (success/failed).

If HMAC signature mismatches occur

- Ensure `LIPANA_WEBHOOK_SECRET` on Render matches the secret used when signing test webhooks. The app logs print a short fingerprint (first 8 hex chars) — compare that to a locally computed fingerprint to validate.
- Ensure the webhook is verified against the raw request bytes: the app captures `req.rawBody` in the JSON parser verify hook and HMACs are computed over that buffer.
- If payload transformations happen in a proxy or CDN, use a direct public URL or disable transformations.

Notes

- Do not commit secrets to the repo. Use Render's secure env var UI.
- For production, rotate `LIPANA_WEBHOOK_SECRET` carefully and update both provider and Render.
