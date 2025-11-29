# Production Deployment Architecture & Flow

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       TELEGRAM BOT USERS                          │
│                       (Send /live command)                        │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Telegram API          │
                    │   (Bot API)             │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼──────────────────┐
                    │   Your Bot Webhook            │
                    │   (or polling)                │
                    └────────────┬──────────────────┘
                                 │
                    ┌────────────▼──────────────────┐
                    │   Express Web Server (5000)   │
                    │   - POST /webhook             │
                    │   - GET /monitor              │
                    │   - Redis PubSub listener     │
                    └────────────┬──────────────────┘
                                 │
                    ┌────────────▼──────────────────┐
                    │   Redis Queue                 │
                    │   - telegram:updates (List)   │
                    │   - telegram:processing       │
                    └────────────┬──────────────────┘
                                 │
                    ┌────────────▼──────────────────┐
        ┌───────────┤   Worker Process              │
        │           │ (src/worker-final.js)         │
        │           │ - BRPOPLPUSH handler          │
        │           │ - Handler router              │
        │           │ - Prefetch scheduler          │
        │           └────────────┬──────────────────┘
        │                        │
        │         ┌──────────────┼──────────────┐
        │         │              │              │
    ┌───▼──┐  ┌───▼──────┐  ┌────▼─────┐  ┌────▼──────┐
    │Redis │  │SportMonks│  │StatPal   │  │OpenLigaDB │
    │      │  │(Primary) │  │(Fallback)│  │(Cache)    │
    └──────┘  └──────────┘  └──────────┘  └───────────┘
```

---

## Request Flow: /live Command

```
1. USER SENDS /live IN TELEGRAM
   └─> Telegram API webhooks to your bot
       └─> POST /webhook with update JSON
           └─> Bot queues message to Redis
               └─> Returns 200 OK to Telegram

2. WORKER PROCESSES QUEUE
   └─> BRPOPLPUSH telegram:updates → telegram:processing
       └─> Routes message to handler (handleLive)
           └─> Handler fetches live matches:
               • Calls sportmonks.getLivescores()
                 (axios-based, with TLS handling)
               └─> Normalizes response to internal format
                   └─> Builds Telegram message text
                       └─> Returns editMessageText action

3. TELEGRAM SENDS RESPONSE
   └─> Bot sends editMessageText via Telegram API
       └─> Updates original message with real match names
           └─> Displays clickable buttons
               └─> User sees: "Manchester City vs Liverpool" ✅

4. USER CLICKS MATCH BUTTON
   └─> Telegram sends callback_query to webhook
       └─> Worker routes to match details handler
           └─> Fetches detailed match info
               └─> Edits message with score, stats, etc.
                   └─> User sees live updates ✅
```

---

## Environment & Configuration

```
┌──────────────────────────────────────────────────────┐
│              Environment Variables                   │
├──────────────────────────────────────────────────────┤
│ Required:                                            │
│  • TELEGRAM_TOKEN=your_bot_token                     │
│  • REDIS_URL=redis://default:pwd@host:6379          │
│  • SPORTSMONKS_API=your_sportmonks_token             │
│                                                      │
│ Optional:                                            │
│  • GEMINI_API_KEY=... (AI provider)                  │
│  • AZURE_ENDPOINT=... (AI fallback)                  │
│                                                      │
│ Dev Only (DO NOT USE IN PRODUCTION):                │
│  • SPORTSMONKS_INSECURE=true (TLS bypass)            │
└──────────────────────────────────────────────────────┘
```

---

## TLS Certificate Resolution

### Scenario A: Direct Internet Access (No Proxy)

```
Node.js Request
    ↓
Connects to api.sportmonks.com:443
    ↓
SportMonks Presents Certificate
    ↓
Node.js Verifies Against OS Trust Store
    ↓
✅ Certificate Valid → Request Proceeds
```

**No action needed.** SportMonks certificate is from trusted CA.

### Scenario B: Behind Corporate Proxy (Intercepting)

```
Node.js Request
    ↓
Connects to api.sportmonks.com:443
    ↓
PROXY INTERCEPTS & RE-SIGNS CERTIFICATE
    ↓
Proxy CA Presents Certificate (CN: sportmonks.com)
    ↓
Node.js Verifies Against OS Trust Store
    ↓
❌ Certificate Invalid (proxy CA not in trust store)
    ↓
Solution: Install Proxy CA into Windows Trust Store
```

**Action Required:**
```powershell
.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'
```

---

## Deployment Options

### 1. Local Development (Windows)

```powershell
# Terminal 1: Start worker
$env:TELEGRAM_TOKEN = "your_token"
$env:REDIS_URL = "redis://..."
$env:SPORTSMONKS_API = "your_token"
node src/worker-final.js

# Terminal 2: Validate
node scripts/validate-telegram-live.js

# Terminal 3: Test in Telegram
# Send /live to your bot
```

### 2. Heroku / Railway / Render

```bash
# Set config vars in dashboard
# Create Procfile or configure build command
# Deploy: git push heroku main
# Scale: heroku ps:scale worker=1
```

### 3. Self-Hosted Linux (systemd)

```bash
# 1. Create /etc/systemd/system/betrix-worker.service
# 2. systemctl enable betrix-worker
# 3. systemctl start betrix-worker
# 4. journalctl -u betrix-worker -f
```

### 4. Docker

```bash
docker run -d \
  -e TELEGRAM_TOKEN="$TELEGRAM_TOKEN" \
  -e REDIS_URL="$REDIS_URL" \
  -e SPORTSMONKS_API="$SPORTSMONKS_API" \
  betrix-bot:latest \
  node src/worker-final.js
```

---

## Monitoring & Health Checks

```
┌─────────────────────────────────────────────┐
│         Health Check Points                 │
├─────────────────────────────────────────────┤
│ 1. Redis Connectivity                       │
│    redis-cli PING → PONG ✅                 │
│                                             │
│ 2. Worker Heartbeat                         │
│    redis-cli GET worker:heartbeat           │
│    → "2025-11-29T12:34:56Z" ✅              │
│                                             │
│ 3. SportMonks API                           │
│    node scripts/inspect-sportmonks-cert.js  │
│    → Certificate from SportMonks CA ✅      │
│                                             │
│ 4. Telegram Bot                             │
│    Send /live in Telegram                   │
│    → Real match names shown ✅              │
│                                             │
│ 5. Worker Logs                              │
│    No NOAUTH errors ✅                      │
│    No TLS errors ✅                         │
│    No unhandled rejections ✅               │
└─────────────────────────────────────────────┘
```

---

## Troubleshooting Decision Tree

```
Bot not responding?
├─ Check worker is running
│  └─ redis-cli GET worker:heartbeat
│     ├─ Shows timestamp? → Skip ahead to "No real data"
│     └─ Empty? → Worker crashed/not running
│        └─ node src/worker-final.js
│
Bot shows "Unknown vs Unknown"?
├─ Check SPORTSMONKS_API is set
│  └─ echo $SPORTSMONKS_API
│     ├─ Empty? → Set env var (setup-production-env.ps1)
│     └─ Set? → Test API: node scripts/test-sportmonks-axios.js
│
TLS Certificate Error?
├─ Check certificate source
│  └─ node scripts/inspect-sportmonks-cert.js
│     ├─ Shows proxy CA? → Install proxy CA
│     │  └─ .\docs\dev-scripts\install-proxy-ca.ps1 -CertPath ...
│     └─ Shows SportMonks CA? → TLS is OK, look elsewhere
│
NOAUTH errors in logs?
├─ Check Redis password
│  └─ redis-cli -u "$REDIS_URL" PING
│     ├─ Error? → Password wrong in REDIS_URL
│     │  └─ Re-run: .\scripts\setup-production-env.ps1
│     └─ PONG? → Redis auth working
│
Still stuck?
└─ Check worker logs for specific errors
   └─ Look for: [ERROR], [NOAUTH], certificate, timeout
```

---

## Service Dependencies

```
┌─────────────┐
│ Worker      │  ← Must be running for bot to work
└──────┬──────┘
       │
       ├─► Redis      ← Must be accessible + authenticated
       │
       ├─► Telegram   ← Must have valid token
       │
       └─► SportMonks ← Must have valid API token
                       ← Must have network access
                       ← TLS must be working (or use insecure flag for dev)
```

---

## File Dependencies

```
src/worker-final.js (MAIN WORKER)
├─ src/handlers/telegram-handler-v2-clean.js
│  ├─ src/services/sports-aggregator.js
│  │  ├─ src/services/sportmonks-service.js
│  │  ├─ src/services/statpal-service.js
│  │  └─ Other sports providers...
│  └─ Telegram API (via node-telegram-bot-api)
│
├─ src/tasks/api-bootstrap.js (Startup initialization)
│
└─ ioredis (Redis client)
   └─ Redis Server (must be running)
```

---

## Success Criteria

| Check | Status | How to Verify |
|-------|--------|---------------|
| Environment vars set | ✅ | `echo $TELEGRAM_TOKEN; echo $REDIS_URL; echo $SPORTSMONKS_API` |
| Redis connected | ✅ | `redis-cli PING` → PONG |
| TLS working | ✅ | `node scripts/inspect-sportmonks-cert.js` → SportMonks CA |
| SportMonks API responding | ✅ | `node scripts/test-sportmonks-axios.js` → live matches |
| Worker running | ✅ | `redis-cli GET worker:heartbeat` → timestamp |
| Handler wired correctly | ✅ | `node scripts/test-match-callback.js` → response payload |
| Telegram responds to /live | ✅ | Send `/live` in Telegram → see real match names |
| Match buttons work | ✅ | Click match → message edits with details |

---

## Quick Reference Commands

```bash
# Start worker
node src/worker-final.js

# Validate setup
node scripts/validate-telegram-live.js

# Test SportMonks
node scripts/test-sportmonks-axios.js
node scripts/inspect-sportmonks-cert.js

# Test handler
node scripts/test-match-callback.js

# Redis diagnostics
redis-cli PING
redis-cli GET worker:heartbeat
redis-cli LLEN telegram:updates
redis-cli LLEN telegram:processing

# Check TLS (if issues)
.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\ca.cer'

# Setup environment
.\scripts\setup-production-env.ps1

# View logs (systemd)
sudo journalctl -u betrix-worker -f

# View logs (Docker)
docker logs -f betrix-worker
```

---

## Deployment Checklist (Final)

- [ ] **Code**: Latest main branch (`git pull origin main`)
- [ ] **TLS**: Resolved (proxy CA installed or no proxy)
- [ ] **Environment**: TELEGRAM_TOKEN, REDIS_URL, SPORTSMONKS_API set
- [ ] **Redis**: Reachable and authenticated (`redis-cli PING` → PONG)
- [ ] **Worker**: Running (`node src/worker-final.js`)
- [ ] **Validation**: Tests pass (`node scripts/validate-telegram-live.js`)
- [ ] **Telegram**: `/live` shows real match names (not placeholders)
- [ ] **Buttons**: Clickable and responsive
- [ ] **Logs**: No errors, no "NOAUTH", no unhandled rejections
- [ ] **Monitoring**: Set up alerts if needed

---

**✨ Ready to deploy! Follow [QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md) for next steps.**
