# Payment Architecture & Operational Runbook

Purpose
- Document payment wiring, required environment variables, webhook setup, troubleshooting steps, and a rollout checklist for the payment subsystem (Safaricom Till, M-Pesa, PayPal, Binance).

Required environment variables
- `REDIS_URL` — Redis connection string (with credentials if required).
- `PAYPAL_CLIENT_ID` — PayPal REST app client id (sandbox or live).
- `PAYPAL_CLIENT_SECRET` — PayPal REST app secret.
- `PAYPAL_MODE` — `sandbox` or `live` (defaults to `sandbox`).
- `PAYPAL_WEBHOOK_ID` — PayPal webhook ID (recommended; enables PayPal verify call).
- `PAYPAL_WEBHOOK_SECRET` or `PAYMENT_WEBHOOK_SECRET` — optional HMAC secret for PayPal fallback.
- `MPESA_TILL` or `SAFARICOM_TILL_NUMBER` — Safaricom till number used in UI and validation (defaults to `606215`).
- `SAFARICOM_TILL_SECRET` or `PAYMENT_WEBHOOK_SECRET` — optional HMAC secret for Till webhook validation.
- `MPESA_WEBHOOK_SECRET` or `PAYMENT_WEBHOOK_SECRET` — optional HMAC secret for M-Pesa webhook validation.
- `ADMIN_TELEGRAM_ID` or `TELEGRAM_ADMIN_ID` — Telegram numeric id to receive admin alerts.

Key Redis keys and meaning
- `payment:order:{orderId}` — canonical order JSON storing order metadata, providerRef, checkoutUrl, userId, tier, createdAt.
- `payment:by_provider_ref:{provider}:{ref}` — maps provider callback reference (e.g., PayPal orderId, Mpesa receipt) → `orderId`.
- `payment:by_user:{userId}:pending` — pending order id for a user (used for manual verify flows).
- `payment:by_phone:{phone}` — mapping from phone → orderId for quick reconciliation.
- `transaction:{txId}` — stored transaction JSON for captured transaction records.

How it works (high-level)
1. The app creates a canonical order via `createPaymentOrder(...)` which writes `payment:order:{orderId}` and mapping keys such as `payment:by_provider_ref:*` and `payment:by_user:*`.
2. Providers (PayPal, M-Pesa, Till, Binance) send webhooks back to endpoints in the app (`/webhook/payment/*`).
3. Webhook handlers prefer quick mapping lookups (providerRef, phone) to find the canonical `orderId`. The code intentionally avoids scanning Redis for scalability.
4. Once an order is found, `verifyAndActivatePayment(redis, orderId, providerTxId)` is called to mark completed and activate the user's subscription.

PayPal webhook setup (recommended)
1. In PayPal Developer Dashboard, create a REST app (Sandbox or Live) and obtain `client_id` and `client_secret`.
2. Create a Webhook in your app settings and subscribe to events: `PAYMENT.CAPTURE.COMPLETED`, `BILLING.SUBSCRIPTION.CREATED` (others optional).
3. Record the Webhook ID and set `PAYPAL_WEBHOOK_ID` in environment variables on your server.
4. Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MODE` (sandbox/live) for SDK usage.
5. The app will call PayPal's `verify-webhook-signature` when `PAYPAL_WEBHOOK_ID` and credentials are present.

Safaricom Till / M-Pesa
- The application validates Till notifications against `MPESA_TILL` (or `SAFARICOM_TILL_NUMBER`).
- Configure HMAC secrets `SAFARICOM_TILL_SECRET` or `MPESA_WEBHOOK_SECRET` if provider supports sending an HMAC header; the app will validate using HMAC-SHA256.
- Orders must be created with a providerRef mapping so webhooks can reconcile quickly.

Troubleshooting mapping-misses
- Symptoms: Webhook logs show "Order mapping not found" and admin alert sent.
- Quick checks:
  - Inspect Redis for mappings (using `redis-cli` or similar):

```bash
# Example: check if PayPal order id maps to internal order
redis-cli -u "${REDIS_URL}" GET "payment:by_provider_ref:PAYPAL:<paypalOrderId>"

# Check canonical order exists
redis-cli -u "${REDIS_URL}" GET "payment:order:<orderId>"
```

- If mapping is missing but webhook contains provider reference (e.g., PayPal order id), search recent `payment:order:*` entries for metadata containing that providerRef (careful: scanning is expensive and not recommended in production).

- Recovery (manual repair):
  1. Locate the canonical order that corresponds to the provider transaction (if you can find it via logs or database backups).
  2. Re-create mapping key pointing to the order id:

```bash
redis-cli -u "${REDIS_URL}" SET "payment:by_provider_ref:PAYPAL:<providerRef>" "<orderId>"
```

  3. Manually call the manual verify endpoint to process the order (or provide a dedicated admin script):

```bash
# Example using curl (replace host/port and orderId)
curl -X POST https://your-server.example.com/webhook/payment/manual/<orderId> -H "Content-Type: application/json" -d '{}'
```

- Long-term: Add instrumentation and alerting for mapping-miss rate. Consider temporary safe scan mode (admin-only tool) when enabling a new provider.

Runbook: Accept / Reject policy for webhooks
- The system returns 200 only when the event is successfully processed.
- For mapping-misses the webhook returns 400 with `Order mapping not found` and an admin alert is sent.
- This is intentional to avoid expensive Redis scans and to surface missing initiator mappings during rollout.

Testing locally (harness)
- Use the test harness `scripts/test-payment-harness.js` to simulate create → verify flows.
- Example (PowerShell):

```powershell
$env:REDIS_URL = "redis://:password@host:6379"
$env:PAYPAL_CLIENT_ID = "<sandbox-client-id>"
$env:PAYPAL_CLIENT_SECRET = "<sandbox-secret>"
$env:PAYPAL_MODE = "sandbox"
node scripts/test-payment-harness.js
```

Rollout checklist
- [ ] Ensure production environment has `REDIS_URL` and required keys set.
- [ ] Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE`, and `PAYPAL_WEBHOOK_ID` (if used).
- [ ] Set `MPESA_TILL` to the accepted till number for production.
- [ ] Confirm HMAC secrets are set if providers support it.
- [ ] Add `ADMIN_TELEGRAM_ID` (or `TELEGRAM_ADMIN_ID`) for admin alerts.
- [ ] Run test harness against sandbox keys and verify mappings are created in Redis.
- [ ] Deploy to staging, enable webhooks, and validate webhook reconciliation end-to-end.
- [ ] Monitor mapping-miss alerts for 48–72 hours after rollout; escalate if >1% of payments are missing mappings.

Appendix: Useful Redis commands
- List keys (warning: expensive on large DBs): `KEYS "payment:*"`
- More targeted scans:

```bash
redis-cli -u "${REDIS_URL}" SCAN 0 MATCH "payment:by_provider_ref:PAYPAL:*" COUNT 1000
```

Contact / escalation
- Team lead: @your-team
- Admin alerts: `ADMIN_TELEGRAM_ID` will receive immediate messages for mapping misses.

---

Document created by automation. Update as needed during rollout.
