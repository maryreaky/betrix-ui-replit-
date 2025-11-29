# Production Setup & Deployment Guide

## 1. TLS Certificate Verification (Required)

### Option A: Install Proxy CA into OS Trust Store (Windows)

If your environment has an intercepting proxy (corporate or security appliance):

1. **Obtain the proxy CA certificate** (`.cer` or `.pem` file from your network/proxy admin)

2. **Run the helper script as Administrator:**
   ```powershell
   # Admin PowerShell:
   cd 'd:\betrix-ui (1)\betrix-ui'
   .\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'
   ```

3. **Verify the certificate was installed:**
   ```powershell
   Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like '*Proxy*' }
   ```

### Option B: Allowlist api.sportmonks.com in Proxy

Ask your network/proxy team to:
- Allowlist `api.sportmonks.com` so the proxy does **not** re-sign requests to that host
- This allows Node.js to verify the legitimate certificate from SportMonks

### Verification

After remediation, ensure Node.js can reach SportMonks:

```bash
node scripts/inspect-sportmonks-cert.js
```

Expected output: Certificate should show CN/issuer from actual SportMonks CA (not your proxy).

---

## 2. Environment Configuration

### Required Variables

Create or update your `.env` file with:

```env
# ===== REQUIRED =====
TELEGRAM_TOKEN=your_telegram_bot_token_here
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret_here
REDIS_URL=redis://default:your_redis_password@redis-host:6379

# ===== REQUIRED FOR SPORTMONKS =====
SPORTSMONKS_API=your_sportmonks_api_token_here

# ===== OPTIONAL: PRODUCTION FLAGS =====
# DO NOT SET SPORTSMONKS_INSECURE in production
# If you need to set it temporarily, unset it after testing
# SPORTSMONKS_INSECURE=

# AI Provider Chain (fallback: Gemini → Azure → HuggingFace → LocalAI)
GEMINI_API_KEY=your_gemini_key_optional
AZURE_ENDPOINT=https://your.openai.azure.com/
AZURE_KEY=your_azure_key_optional
HUGGINGFACE_TOKEN=your_hf_token_optional
```

### How to Set Environment Variables

**Option 1: .env File (Recommended for local dev)**
```bash
cp .env.example .env
# Edit .env with your values
```

**Option 2: Docker / Docker Compose**
```bash
export TELEGRAM_TOKEN=your_token
export REDIS_URL=redis://default:password@host:6379
export SPORTSMONKS_API=your_sportmonks_token
```

**Option 3: Host Environment (Production Server)**
```bash
# On Linux/macOS:
export TELEGRAM_TOKEN=your_token
export REDIS_URL=redis://default:password@host:6379
export SPORTSMONKS_API=your_sportmonks_token

# Or write to /etc/environment and restart service
```

### Verify Variables Are Set

```bash
# Quick check:
echo "REDIS_URL: $REDIS_URL"
echo "SPORTSMONKS_API: $SPORTSMONKS_API"
echo "TELEGRAM_TOKEN: $TELEGRAM_TOKEN"
```

---

## 3. Deploy Worker Process

### Start the Worker

```bash
# Terminal 1: Start the worker (processes queue + prefetch)
node src/worker-final.js
```

**Expected startup output:**
```
[Worker] Started: BRPOPLPUSH queue handler
[Redis] Connected to redis://default:...@host:6379
[Worker] Prefetch scheduler running (60s interval)
[Sports] Aggregator ready (SportMonks primary for football)
```

### Check Worker is Running

In another terminal:
```bash
# Check worker heartbeat in Redis
redis-cli GET worker:heartbeat

# Should return recent timestamp like: "2025-11-29T12:34:56Z"
```

---

## 4. Validate /live Command in Telegram

### Test Script (Automated)

```bash
# Terminal 2: Run validation test
SPORTSMONKS_API=your_token REDIS_URL=redis://... TELEGRAM_TOKEN=your_token \
  node scripts/test-match-callback.js
```

**Expected output:**
```
✅ SportMonks: Found 37 live matches
✅ Handler response: editMessageText
✅ Match: "Albacete vs Deportivo La Coruña"
✅ Provider: sportsmonks
```

### Manual Test in Telegram

1. **Message your bot** with `/live`
2. **Expected response:**
   - Real team names (e.g., "Manchester City vs Liverpool")
   - Clickable match buttons (or inline keyboard)
   - No "Unknown vs Unknown" placeholders
3. **Click a match button** to see details
4. **Expected:**
   - Match score / status updates
   - Live commentary or stats (if available)
   - Real provider data (SportMonks)

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `/live` shows "Unknown vs Unknown" | SportMonks not configured or returning empty. Check `SPORTSMONKS_API` env var. |
| "NOAUTH" errors in logs | Redis password in `REDIS_URL` is wrong. Verify credentials. |
| TLS certificate error | Install proxy CA or allowlist `api.sportmonks.com`. Run `scripts/inspect-sportmonks-cert.js` to diagnose. |
| No response to `/live` | Worker not running. Check `redis-cli GET worker:heartbeat`. |
| Buttons don't respond | Webhook/callback routing issue. Check `TELEGRAM_WEBHOOK_SECRET` and worker logs. |

---

## 5. Production Checklist

- [ ] **TLS**: Installed proxy CA or allowlisted `api.sportmonks.com`
- [ ] **Env**: Set `TELEGRAM_TOKEN`, `REDIS_URL` (with password), `SPORTSMONKS_API`
- [ ] **SPORTSMONKS_INSECURE**: Unset (confirm it's not in production env)
- [ ] **Redis**: Verified connectivity; no `NOAUTH` errors in logs
- [ ] **Worker**: Running `src/worker-final.js` and `redis-cli GET worker:heartbeat` shows recent timestamp
- [ ] **Bot**: Tested `/live` command shows real match names and clickable details
- [ ] **Logs**: No TLS errors; no unhandled promise rejections
- [ ] **Monitoring**: Check `http://localhost:5000/monitor.html` for health dashboard (if web server also running)

---

## 6. Going Live

### Deploy to Production Host

1. **Copy code to production server** (git clone or CI/CD)
2. **Set environment variables** (see step 2 above)
3. **Start worker** in background or as systemd service:
   ```bash
   # As systemd service (Linux):
   # /etc/systemd/system/betrix-worker.service
   [Unit]
   Description=BETRIX Worker
   After=network.target
   
   [Service]
   Type=simple
   User=betrix
   WorkingDirectory=/opt/betrix
   Environment="TELEGRAM_TOKEN=..."
   Environment="REDIS_URL=..."
   Environment="SPORTSMONKS_API=..."
   ExecStart=/usr/bin/node /opt/betrix/src/worker-final.js
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable and start:**
   ```bash
   sudo systemctl enable betrix-worker
   sudo systemctl start betrix-worker
   ```

5. **Monitor:**
   ```bash
   sudo journalctl -u betrix-worker -f
   ```

### Docker (Alternative)

If using Docker, ensure environment variables are passed:

```bash
docker run -d \
  -e TELEGRAM_TOKEN="$TELEGRAM_TOKEN" \
  -e REDIS_URL="$REDIS_URL" \
  -e SPORTSMONKS_API="$SPORTSMONKS_API" \
  your-image-name \
  node src/worker-final.js
```

---

## Support

For issues or questions:
- Check logs: `worker-final.js` outputs to console
- Redis diagnostics: `redis-cli PING`, `redis-cli GET worker:heartbeat`
- TLS debug: `node scripts/inspect-sportmonks-cert.js`
- Handler test: `SPORTSMONKS_API=... node scripts/test-match-callback.js`
