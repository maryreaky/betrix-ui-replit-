# Quick Start: Deploy BETRIX Bot to Production

> **Timeline**: 15-30 minutes (depending on TLS setup)

## Prerequisites

- ✅ Telegram bot token (from [@BotFather](https://t.me/botfather))
- ✅ SportMonks API token (from [sportmonks.com](https://sportmonks.com))
- ✅ Redis instance (local or cloud, with authentication)
- ✅ Network access to `api.sportmonks.com`
- ⚠️ (If behind corporate proxy) Proxy CA certificate or proxy admin access

---

## Step 1: Resolve TLS Certificate Issues (5-10 min)

**Does your network have an intercepting proxy?** (corporate network, security appliance, etc.)

### If YES: Install Proxy CA

1. **Get the proxy CA certificate** from your network admin (usually `.cer` or `.pem` file)

2. **Run the installation script:**
   ```powershell
   cd 'd:\betrix-ui (1)\betrix-ui'
   .\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'
   ```

3. **Verify it worked:**
   ```powershell
   node scripts/inspect-sportmonks-cert.js
   ```
   Should show: Certificate from SportMonks CA (not your proxy)

### If NO: Skip to Step 2

> If you're on a home network or ISP with direct access, TLS should work automatically.

---

## Step 2: Configure Environment Variables (5 min)

**Interactive setup (recommended):**

```powershell
cd 'd:\betrix-ui (1)\betrix-ui'
.\scripts\setup-production-env.ps1
```

This will prompt you for:
- `TELEGRAM_TOKEN` (your bot token)
- `REDIS_URL` (redis://default:password@host:6379)
- `SPORTSMONKS_API` (your SportMonks token)

**Alternative: Manual .env file**

```bash
cp .env.example .env
# Edit .env with your values
```

**Verify variables are set:**

```powershell
echo "TELEGRAM_TOKEN: $env:TELEGRAM_TOKEN"
echo "REDIS_URL: $env:REDIS_URL"
echo "SPORTSMONKS_API: $env:SPORTSMONKS_API"
```

---

## Step 3: Start the Worker (2 min)

```powershell
cd 'd:\betrix-ui (1)\betrix-ui'
node src/worker-final.js
```

**Expected output:**
```
[Worker] Started: BRPOPLPUSH queue handler
[Redis] Connected to redis://default:...
[Worker] Prefetch scheduler running (60s interval)
[Sports] Aggregator ready (SportMonks primary for football)
```

> Leave this terminal running. Open a new terminal for Step 4.

---

## Step 4: Validate in Telegram (5 min)

### Option A: Run Automated Test

```powershell
# In a NEW terminal:
cd 'd:\betrix-ui (1)\betrix-ui'

# Set env vars if using session (skip if using .env):
$env:TELEGRAM_TOKEN = "your_token"
$env:REDIS_URL = "redis://..."
$env:SPORTSMONKS_API = "your_token"

# Run validation:
node scripts/validate-telegram-live.js
```

**Expected output:**
```
✅ All required env vars set
✅ Redis connected: PONG
✅ SportMonks API responded with 37 live matches
✅ Handler returned a response
✅ Real team names detected (not placeholders)
```

### Option B: Manual Test in Telegram

1. **Open Telegram** and message your bot
2. **Send**: `/live`
3. **Expected response**:
   - ✅ List of real match names (e.g., "Manchester City vs Liverpool")
   - ✅ Clickable buttons or inline keyboard
   - ❌ NOT "Unknown vs Unknown"
4. **Click a match** to see live details
5. **Expected**: Message edited with match score/status

---

## Step 5: Verify Everything (2 min)

**Check worker is running:**

```bash
redis-cli GET worker:heartbeat
# Should return: "2025-11-29T12:34:56Z" or similar timestamp
```

**Check for errors:**

- No "NOAUTH" errors in worker logs → Redis password is correct ✅
- No "UNABLE_TO_VERIFY_LEAF_SIGNATURE" → TLS is fixed ✅
- No unhandled promise rejections → Code is stable ✅

**Monitor the bot:**

- Send `/live` regularly to check live matches update
- Watch worker logs for any warnings
- (Optional) Monitor dashboard: `http://localhost:5000/monitor.html` (if web server running)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `/live` shows "Unknown vs Unknown" | ① Verify `SPORTSMONKS_API` token is set and correct<br>② Run: `node scripts/test-sportmonks-axios.js`<br>③ Check worker logs for errors |
| Bot doesn't respond to `/live` | ① Ensure worker is running: `redis-cli GET worker:heartbeat`<br>② Verify `TELEGRAM_TOKEN` is set<br>③ Check webhook is registered |
| "NOAUTH" errors in logs | ① Wrong Redis password in `REDIS_URL`<br>② Example correct format: `redis://default:mypassword@host:6379`<br>③ Re-run setup script to update |
| TLS certificate errors | ① Run proxy CA installer: `.\docs\dev-scripts\install-proxy-ca.ps1`<br>② Or allowlist `api.sportmonks.com` in proxy settings<br>③ Verify: `node scripts/inspect-sportmonks-cert.js` |
| Redis connection refused | ① Check Redis is running: `redis-cli PING`<br>② Verify `REDIS_URL` host/port/password<br>③ If cloud Redis, allow firewall rule for your IP |

---

## Going to Production

### For Heroku / Railway / Render:

1. Set config variables in platform dashboard:
   ```
   TELEGRAM_TOKEN=...
   REDIS_URL=...
   SPORTSMONKS_API=...
   ```

2. Deploy:
   ```bash
   git push heroku main
   # or equivalent for your platform
   ```

### For Self-Hosted Linux:

1. **Create systemd service** (`/etc/systemd/system/betrix-worker.service`):
   ```ini
   [Unit]
   Description=BETRIX Worker
   After=network.target redis.service
   
   [Service]
   Type=simple
   User=betrix
   WorkingDirectory=/opt/betrix
   EnvironmentFile=/opt/betrix/.env
   ExecStart=/usr/bin/node /opt/betrix/src/worker-final.js
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Start service**:
   ```bash
   sudo systemctl enable betrix-worker
   sudo systemctl start betrix-worker
   sudo systemctl status betrix-worker
   ```

3. **Monitor**:
   ```bash
   sudo journalctl -u betrix-worker -f
   ```

### For Docker:

```bash
docker build -t betrix-bot .
docker run -d \
  -e TELEGRAM_TOKEN="$TELEGRAM_TOKEN" \
  -e REDIS_URL="$REDIS_URL" \
  -e SPORTSMONKS_API="$SPORTSMONKS_API" \
  --name betrix-worker \
  betrix-bot \
  node src/worker-final.js
```

---

## Support & Monitoring

- **Logs**: `node src/worker-final.js` outputs to stdout
- **Health**: `redis-cli GET worker:heartbeat` (should be recent timestamp)
- **Diagnostics**:
  - Redis: `redis-cli PING`, `redis-cli DBSIZE`
  - SportMonks: `node scripts/inspect-sportmonks-cert.js`
  - Handler: `node scripts/test-match-callback.js`

---

**🎉 You're live!** The bot will now respond to `/live` with real match data from SportMonks.
