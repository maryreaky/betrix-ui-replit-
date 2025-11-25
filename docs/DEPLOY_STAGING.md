# Staging Deploy & Payment Harness Runbook

This document lists the exact steps and commands used to deploy to staging and validate payment flows (Safaricom Till, M-Pesa, PayPal) using the test harness.

Important: do not commit secrets to the repo. Use CI / cloud provider secrets or local environment variables.

---

## Required secrets / env variables (staging)
- `REDIS_URL` (e.g. `redis://:password@host:6379`)
- `TELEGRAM_TOKEN` (bot token)
- `ADMIN_TELEGRAM_ID` or `TELEGRAM_ADMIN_ID` (numeric chat id to receive admin alerts)
- `PAYPAL_CLIENT_ID` (sandbox/live)
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_MODE` (`sandbox` or `live`)
- `PAYPAL_WEBHOOK_ID` (recommended to enable PayPal verification)
- `MPESA_TILL` or `SAFARICOM_TILL_NUMBER` (staging till number, default `606215`)
- Optional: `PAYMENT_WEBHOOK_SECRET`, `MPESA_WEBHOOK_SECRET`, `SAFARICOM_TILL_SECRET` for HMAC validation
- Optional: `SLACK_WEBHOOK_URL`, `PAGERDUTY_ROUTING_KEY` for notifications

Set these as your staging environment variables in your platform (Render, Heroku, Netlify, etc) or as GitHub Actions secrets for CI workflows.

---

## Deploy steps (staging)
1. Prepare staging environment (example using GitHub Actions or a platform UI):
   - Ensure `origin/main` has the cleaned `main` branch.
   - Configure secrets in the platform (see list above).

2. Deploy (example for Render / Heroku / similar):
   - Push `main` to remote (already done).
   - In the platform dashboard, create/update staging service pointing to the repo and branch `main`.
   - Set the environment variables/secrets.
   - Trigger a deploy.

3. Verify service startup logs contain a successful Redis connection and worker heartbeat.

---

## Run payment harness locally against staging
Option A: Run the harness locally but point to staging Redis and Telegram bot. This allows verifying order creation and webhook mapping behavior without sending real money.

PowerShell example (replace placeholders):

```powershell
# Example: set staging secrets for the run
$env:REDIS_URL = "redis://:yourredispassword@staging-redis.example.com:6379"
$env:TELEGRAM_TOKEN = "123456:ABCD..."
$env:ADMIN_TELEGRAM_ID = "123456789"
$env:PAYPAL_CLIENT_ID = "<sandbox-client-id>"
$env:PAYPAL_CLIENT_SECRET = "<sandbox-secret>"
$env:PAYPAL_MODE = "sandbox"
$env:PAYPAL_WEBHOOK_ID = "<webhook-id>"
$env:MPESA_TILL = "606215"

# Optionally choose which provider the harness should simulate
$env:TEST_METHOD = "SAFARICOM_TILL"  # or MPESA, PAYPAL, BINANCE
$env:TEST_TIER = "PLUS"
$env:TEST_USER_ID = "9999"

# Run the harness
node scripts/test-payment-harness.js
```

What the harness does
- Creates a canonical order via `createPaymentOrder(...)` using the configured provider.
- Persists `payment:order:{orderId}` and `payment:by_provider_ref:{provider}:{ref}` mappings.
- When a simulated verification is performed, it calls `verifyAndActivatePayment` to mark subscription active.

---

## Testing webhook roundtrip (manual)
If you want to simulate an incoming webhook to staging (e.g., to `/webhook/payment/till`), use `curl` or Postman. Example:

```bash
curl -X POST https://staging.example.com/webhook/payment/till \
  -H 'Content-Type: application/json' \
  -d '{"till_number":"606215","amount":200,"transaction_id":"TX123","phone_number":"2547XXXXXXXX","status":"completed","reference":"<your-provider-ref>"}'
```

Check staging logs and admin Telegram for mapping-miss alerts or success messages.

---

## Verification checklist
- [ ] Staging service started and connected to `REDIS_URL`
- [ ] Payment webhooks reachable from provider (or use tunneling for local testing e.g., `ngrok`)
- [ ] `PAYPAL_WEBHOOK_ID` configured and PayPal webhook verify returns `SUCCESS`
- [ ] Use `scripts/test-payment-harness.js` to create test orders for each provider
- [ ] Confirm order keys exist in Redis:
  - `payment:order:{orderId}`
  - `payment:by_provider_ref:{provider}:{ref}`
- [ ] Trigger or simulate webhook once order created and confirm subscription activated
- [ ] Monitor `/admin/mapping-misses` in staging and the Telegram admin channel for alerts

---

## Rollback notes
- If a serious issue is detected, rollback by reverting the staging deploy to the previous commit or redeploy the previous release in your provider dashboard.
- Do not reintroduce the `.history` folder or any files with secrets. If secrets leak, rotate them immediately (Redis, PayPal, Telegram tokens).

---

## Useful commands (PowerShell)

```powershell
# Run tests locally
npm test

# Run harness locally
node scripts/test-payment-harness.js

# Inspect Redis (example using redis-cli)
redis-cli -u "$env:REDIS_URL" GET "payment:by_provider_ref:PAYPAL:<paypalOrderId>"

# Manual verify endpoint (replace host and orderId)
Invoke-WebRequest -Method POST -Uri "https://staging.example.com/webhook/payment/manual/<orderId>" -Body '{}' -ContentType 'application/json'
```

---

If you want, I can run the harness now — paste or provide the staging env values (at least `REDIS_URL`, `TELEGRAM_TOKEN`, `ADMIN_TELEGRAM_ID`, and payment sandbox keys). If you prefer not to share secrets here, I will not run the harness and will only add this doc to the repo (committed and pushed).