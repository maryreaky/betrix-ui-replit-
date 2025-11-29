# 🚀 BETRIX Production Deployment — Complete Summary

**Status**: ✅ Ready for Production | **Date**: 2025-11-29 | **Version**: 1.0

---

## What You Get

Your Telegram bot now has **real live sports data** with SportMonks integration:

✅ **Real Team Names**  
Instead of "Unknown vs Unknown", the bot displays actual match teams.

✅ **Clickable Match Details**  
Users can tap match buttons to see live scores, stats, and updates.

✅ **Reliable Message Queue**  
Redis-backed queue ensures messages are processed even if the bot restarts.

✅ **Automatic Provider Failover**  
SportMonks is primary; StatPal is automatic fallback if needed.

✅ **Production-Ready Architecture**  
Tested, monitored, and documented for enterprise deployment.

---

## Quick Start (15–30 minutes)

### 1. Install Proxy CA (If Behind Corporate Proxy)

```powershell
# Get .cer file from your IT team, then:
.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'
```

**Skip if** you have direct internet access.

### 2. Configure Environment

```powershell
# Interactive setup:
.\scripts\setup-production-env.ps1

# OR manually create .env:
TELEGRAM_TOKEN=your_bot_token
REDIS_URL=redis://default:password@host:6379
SPORTSMONKS_API=your_sportmonks_token
```

### 3. Start the Worker

```bash
node src/worker-final.js
```

**Keep running.** Opens new terminal for next step.

### 4. Validate

```bash
# In new terminal:
node scripts/validate-telegram-live.js

# Then test in Telegram:
# Send: /live
# Expect: Real match names with clickable buttons
```

---

## Detailed Guides

| Document | Purpose | Time |
|----------|---------|------|
| [QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md) | Fast deployment walkthrough | 15-30 min |
| [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) | Complete setup with all details | 30-45 min |
| [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) | Enterprise deployment checklist | Reference |

---

## What Changed

**Main Branch** now includes:

1. **SportMonks Integration** (`src/services/sportmonks-service.js`)
   - Axios-based API client
   - Per-service TLS configuration
   - Automatic retry/backoff

2. **Updated Aggregator** (`src/services/sports-aggregator.js`)
   - SportMonks primary for football
   - StatPal fallback
   - Normalization to internal match format

3. **Handler Wiring** (`src/handlers/telegram-handler-v2-clean.js`)
   - `/live` command support
   - Match details callbacks
   - Proper Telegram message editing

4. **Deployment Scripts**
   - `scripts/setup-production-env.ps1` — Interactive env setup
   - `scripts/validate-telegram-live.js` — End-to-end validation
   - `docs/dev-scripts/install-proxy-ca.ps1` — TLS certificate installation

5. **Documentation**
   - README updates (TLS troubleshooting, Redis auth)
   - PRODUCTION_SETUP.md (detailed setup)
   - QUICKSTART_DEPLOY.md (fast start)
   - DEPLOYMENT_RUNBOOK.md (enterprise checklist)
   - CHANGELOG.md (what's new)

---

## Before You Start

**Required:**
- ✅ Telegram bot token (from [@BotFather](https://t.me/botfather))
- ✅ SportMonks API token (from [sportmonks.com](https://sportmonks.com))
- ✅ Redis instance (local or cloud, with auth)
- ✅ Node.js v20+

**Optional:**
- ⚠️ Proxy CA certificate (if behind corporate proxy)

---

## Common Issues & Fixes

### Issue: Bot shows "Unknown vs Unknown"
```bash
# 1. Verify SportMonks token:
echo "SPORTSMONKS_API: $SPORTSMONKS_API"

# 2. Test API directly:
node scripts/test-sportmonks-axios.js

# 3. Check worker logs for errors
```

### Issue: "NOAUTH" errors in logs
```bash
# Wrong password in REDIS_URL. Fix:
.\scripts\setup-production-env.ps1

# Or manually verify:
redis-cli -u "$REDIS_URL" PING
# Should return: PONG
```

### Issue: TLS certificate errors
```bash
# 1. Check certificate:
node scripts/inspect-sportmonks-cert.js

# 2. If shows proxy CA, install actual proxy CA:
.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'
```

### Issue: Bot doesn't respond
```bash
# Check worker is running:
redis-cli GET worker:heartbeat
# Should show recent timestamp

# Verify webhook is registered (if using webhooks)
# Ensure TELEGRAM_TOKEN is correct
```

---

## Environment Variables (Complete Reference)

### Required for Production

```env
# Telegram bot authentication
TELEGRAM_TOKEN=your_telegram_bot_token

# Redis with authentication
REDIS_URL=redis://default:your_password@redis-host:6379

# SportMonks API token
SPORTSMONKS_API=your_sportmonks_token
```

### Optional

```env
# AI providers (fallback chain: Gemini → Azure → HuggingFace → LocalAI)
GEMINI_API_KEY=...
AZURE_ENDPOINT=https://your.openai.azure.com/
AZURE_KEY=...
HUGGINGFACE_TOKEN=...

# Webhook configuration (if applicable)
TELEGRAM_WEBHOOK_SECRET=random_secret_for_webhook
```

### Development Only (DO NOT USE IN PRODUCTION)

```env
# Temporarily disable TLS verification for SportMonks (dev only)
SPORTSMONKS_INSECURE=true
# ⚠️ Always unset after fixing TLS or testing
```

---

## Deployment Targets

### Heroku / Railway / Render

```bash
# Set config variables in dashboard, then:
git push heroku main
heroku ps:scale worker=1
```

### Self-Hosted Linux

```bash
# Create systemd service (see DEPLOYMENT_RUNBOOK.md)
sudo systemctl start betrix-worker
sudo journalctl -u betrix-worker -f
```

### Docker

```bash
docker run -d \
  -e TELEGRAM_TOKEN="$TELEGRAM_TOKEN" \
  -e REDIS_URL="$REDIS_URL" \
  -e SPORTSMONKS_API="$SPORTSMONKS_API" \
  betrix-bot:latest \
  node src/worker-final.js
```

---

## Monitoring & Health

### Daily Checks

```bash
# 1. Worker heartbeat (should be recent timestamp)
redis-cli GET worker:heartbeat

# 2. Manual bot test in Telegram
# Send: /live
# Expect: Real match names, not placeholders

# 3. Review logs for errors
# Should see no NOAUTH, TLS, or unhandled rejections
```

### Production Alerts

- [ ] Worker process crashes
- [ ] Redis connection fails
- [ ] Telegram webhook returns errors
- [ ] SportMonks API unreachable

---

## File Structure

```
betrix-ui-replit-/
├── src/
│   ├── services/
│   │   ├── sportmonks-service.js       ✨ NEW: SportMonks API wrapper
│   │   └── sports-aggregator.js        ✨ UPDATED: SportMonks primary
│   ├── handlers/
│   │   ├── telegram-handler-v2-clean.js ✨ NEW: /live handler
│   │   └── telegram-handler-v2.js      (legacy)
│   ├── worker-final.js                 ✨ UPDATED: TLS config
│   └── app.js                          (web server, optional)
│
├── scripts/
│   ├── setup-production-env.ps1        ✨ NEW: Interactive env setup
│   ├── validate-telegram-live.js       ✨ NEW: Validation test
│   ├── test-match-callback.js          (existing)
│   ├── test-sportmonks-axios.js        (existing)
│   └── ...
│
├── docs/
│   └── dev-scripts/
│       ├── install-proxy-ca.ps1        ✨ NEW: CA installation
│       ├── add-proxy-bypass.ps1        (existing)
│       ├── inspect-sportmonks-cert.js  (existing)
│       └── sportmonks-relay.js         (relay, dev-only)
│
├── README.md                           ✨ UPDATED: TLS/Redis docs
├── CHANGELOG.md                        ✨ NEW: What's new
├── PRODUCTION_SETUP.md                 ✨ NEW: Setup guide
├── QUICKSTART_DEPLOY.md                ✨ NEW: Fast start
├── DEPLOYMENT_RUNBOOK.md               ✨ NEW: Enterprise checklist
└── .env.example                        (template)
```

---

## Next Steps

1. **Read QUICKSTART_DEPLOY.md** (15-30 min) ← Start here
2. **Configure environment** using `scripts/setup-production-env.ps1`
3. **Resolve TLS** (if behind proxy)
4. **Start worker** and validate in Telegram
5. **Monitor** for 24 hours
6. **Go live** on production platform

---

## Support

**Questions?** Check these in order:
1. [QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md) — Most common issues
2. [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) — Detailed setup
3. [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — Troubleshooting section
4. Bot logs — `node src/worker-final.js` output

**Key Diagnostics:**
```bash
# Test SportMonks:
node scripts/test-sportmonks-axios.js

# Test handler:
node scripts/test-match-callback.js

# Validate everything:
node scripts/validate-telegram-live.js

# Check Redis:
redis-cli PING

# Check TLS:
node scripts/inspect-sportmonks-cert.js
```

---

## Deployment Success Criteria

✅ **Bot responds to `/live`**  
✅ **Real team names displayed** (not "Unknown")  
✅ **Clickable match buttons** work  
✅ **No Redis authentication errors**  
✅ **No TLS certificate errors**  
✅ **Worker heartbeat** visible in Redis  
✅ **Telegram webhook** functional (if used)  

---

## Timeline

- **Time to Deploy**: 15–30 minutes
- **Time to Validate**: 5 minutes
- **Time to Go Live**: 45 minutes total

---

**🎉 Ready to launch!**

Start with [QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md) for the fastest path to production.
