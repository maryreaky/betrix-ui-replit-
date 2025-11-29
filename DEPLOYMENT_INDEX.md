# BETRIX Bot Production Deployment — Documentation Index

**Last Updated**: 2025-11-29  
**Status**: ✅ Ready for Production  
**Time to Deploy**: 15–30 minutes

---

## 📚 Choose Your Path

### 🚀 **I Want to Deploy NOW** (15-30 min)
→ Start here: **[QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)**

Quick walkthrough with copy-paste commands. Perfect if you:
- Have Telegram token, SportMonks token, and Redis credentials ready
- Are comfortable with command line
- Want to be live in 30 minutes

### 📖 **I Want to Understand Everything** (30-45 min)
→ Read this: **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)**

Detailed setup guide with explanations. Covers:
- TLS certificate verification (with multiple options)
- Environment configuration (detailed walkthrough)
- Worker deployment and validation
- Production checklist
- Troubleshooting for each step

### 🏢 **I'm Deploying to Production Enterprise**
→ Use this: **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)**

Comprehensive enterprise checklist with:
- Pre-deployment validation
- Deployment to Heroku, Railway, Render, or self-hosted
- Systemd service setup (Linux)
- Docker deployment
- Monitoring and alerting
- Rollback procedures
- Support escalation

### 🎯 **I Want a Summary Before Starting**
→ Check this: **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)**

One-page reference with:
- What you get (features)
- Common issues & quick fixes
- Environment variables reference
- File structure overview
- Next steps

### 🏗️ **I Want to See the Architecture**
→ Visualize this: **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)**

System diagrams and flows:
- Overall system architecture
- Request flow (`/live` command)
- TLS resolution options
- Monitoring checkpoints
- Troubleshooting decision tree

---

## 🔥 Fast Path (Copy-Paste to Get Live)

If you want to **skip the reading** and just get it running:

### Step 1: Install Proxy CA (if behind proxy)
```powershell
# Get .cer from IT team, then:
.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\proxy-ca.cer'

# Verify:
node scripts/inspect-sportmonks-cert.js
```

### Step 2: Configure Environment
```powershell
.\scripts\setup-production-env.ps1
# Then fill in: TELEGRAM_TOKEN, REDIS_URL, SPORTSMONKS_API
```

### Step 3: Start Worker
```bash
node src/worker-final.js
# Keep this terminal open
```

### Step 4: Validate
```bash
# In new terminal:
node scripts/validate-telegram-live.js

# Then in Telegram:
# Send: /live
# Expect: Real match names
```

✅ **Done!** Your bot is live.

---

## 📋 All Documentation Files

| File | Purpose | Read Time | For Whom |
|------|---------|-----------|----------|
| **[QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)** | Fast 15-30 min deployment | 15 min | Everyone (start here) |
| **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** | Detailed step-by-step setup | 30-45 min | Those who want full details |
| **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** | Enterprise checklist & procedures | Reference | Operations/DevOps teams |
| **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** | One-page quick reference | 5 min | Quick lookup |
| **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** | System diagrams and flows | 10-15 min | Technical leads/architects |
| **[README.md](README.md)** | Project overview & features | 10 min | New team members |
| **[CHANGELOG.md](CHANGELOG.md)** | What changed in this version | 5 min | Version tracking |

---

## ✅ Pre-Deployment Checklist

Before starting **any** deployment guide:

- [ ] **Code**: Cloned or pulled latest main branch
- [ ] **Node.js**: v20+ installed (`node --version`)
- [ ] **Telegram Token**: Generated from [@BotFather](https://t.me/botfather)
- [ ] **SportMonks Token**: Obtained from [sportmonks.com](https://sportmonks.com)
- [ ] **Redis**: Running and accessible (local or cloud)
  - Test: `redis-cli PING` → should return `PONG`
  - Or: Credentials for cloud Redis (Upstash, Redis Cloud, etc.)
- [ ] **Network**: Outbound HTTPS to `api.sportmonks.com` allowed
- [ ] **(If behind proxy)**: Proxy CA certificate file available from IT

---

## 🎯 Common Scenarios

### Scenario: Home Network (No Proxy)

1. Follow **[QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)**
2. Skip TLS step (you have direct internet)
3. Configure environment with your 3 tokens
4. Start worker and test

**Time**: 15 minutes

### Scenario: Corporate Network (Intercepting Proxy)

1. Check **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** → TLS section
2. Get proxy CA certificate from IT
3. Run `.\docs\dev-scripts\install-proxy-ca.ps1`
4. Continue with **[QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)**

**Time**: 20-30 minutes (mostly waiting for IT)

### Scenario: Cloud Deployment (Heroku, Railway, Render)

1. Read **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** → Section 2 (env vars)
2. Follow **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** → "Heroku / Railway / Render" section
3. Set config variables in platform dashboard
4. Deploy: `git push heroku main` (or equivalent)

**Time**: 15-20 minutes

### Scenario: Self-Hosted Linux (systemd)

1. Follow **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** → Full setup
2. Check **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** → "Self-Hosted Linux (systemd)" section
3. Create systemd service file
4. `systemctl enable` and `systemctl start betrix-worker`

**Time**: 30 minutes

---

## 🚨 Common Issues

### Problem: "Unknown vs Unknown" in Telegram

**Root cause**: SportMonks API not returning data

**Fix**:
1. Verify `SPORTSMONKS_API` token is correct
2. Run: `node scripts/test-sportmonks-axios.js`
3. Check worker logs for errors
4. See **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** → Troubleshooting

### Problem: Bot doesn't respond to /live

**Root cause**: Worker not running or Redis issue

**Fix**:
1. Check worker is running: `redis-cli GET worker:heartbeat`
2. Verify `TELEGRAM_TOKEN` is set
3. Start worker: `node src/worker-final.js`
4. See **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** → Troubleshooting

### Problem: "NOAUTH" errors in logs

**Root cause**: Wrong Redis password

**Fix**:
1. Check `REDIS_URL` format: `redis://default:PASSWORD@HOST:PORT`
2. Verify password (no typos)
3. Test: `redis-cli -u "$REDIS_URL" PING`
4. Re-run setup: `.\scripts\setup-production-env.ps1`
5. See **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** → Section 2

### Problem: TLS certificate verification failed

**Root cause**: Behind proxy that re-signs certificates

**Fix**:
1. Check: `node scripts/inspect-sportmonks-cert.js`
2. If shows proxy CA:
   - Get .cer from IT team
   - Run: `.\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'C:\path\to\ca.cer'`
   - Verify: `node scripts/inspect-sportmonks-cert.js` again
3. See **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** → TLS section

---

## 📞 Getting Help

| Issue Type | Where to Look |
|------------|----------------|
| "How do I get started?" | [QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md) |
| "How do I set up the database/environment?" | [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) Section 2 |
| "How do I deploy to production?" | [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) |
| "How do I troubleshoot [X] error?" | [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) Troubleshooting |
| "What does the system architecture look like?" | [ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md) |
| "What are the environment variables?" | [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) Section 2 or [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) |
| "Is TLS/certificate stuff important?" | [ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md) TLS section |
| "What's the quick reference?" | [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) |
| "I'm stuck, what do I do?" | 1) Check [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) Troubleshooting<br>2) Run validation script: `node scripts/validate-telegram-live.js`<br>3) Check worker logs |

---

## 🚀 Recommended Reading Order

### For Developers (New to Project)

1. **[README.md](README.md)** (5 min) — Understand what this project is
2. **[QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)** (15 min) — Get it running locally
3. **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** (10 min) — Understand how it works

### For DevOps/Operations

1. **[DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)** (Reference) — Complete checklist
2. **[PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** (30 min) — Detailed setup
3. **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** (10 min) — System overview

### For Managers/Tech Leads

1. **[DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)** (5 min) — Quick overview
2. **[ARCHITECTURE_DEPLOYMENT.md](ARCHITECTURE_DEPLOYMENT.md)** (10 min) — System design
3. **[CHANGELOG.md](CHANGELOG.md)** (5 min) — What's new

---

## 📊 Success Metrics

After deployment, you should see:

✅ Bot responds to `/live` within 2 seconds  
✅ Real team names displayed (e.g., "Manchester City vs Liverpool")  
✅ Clickable match buttons in Telegram  
✅ Match details update when clicked  
✅ No Redis authentication errors in logs  
✅ No TLS certificate errors  
✅ Worker heartbeat visible: `redis-cli GET worker:heartbeat` → timestamp  

---

## 🎉 Next Steps

1. **Choose your path** above (quick, detailed, or enterprise)
2. **Follow the guide** — copy-paste commands as provided
3. **Test in Telegram** — send `/live` command
4. **Verify output** — should show real match names, not placeholders
5. **Monitor for 24 hours** — check logs daily for first week
6. **Go live** — promote to production users

---

## 📝 Document Status

| Document | Status | Last Updated | Applies To |
|----------|--------|--------------|-----------|
| QUICKSTART_DEPLOY.md | ✅ Ready | 2025-11-29 | All users |
| PRODUCTION_SETUP.md | ✅ Ready | 2025-11-29 | Detailed setup |
| DEPLOYMENT_RUNBOOK.md | ✅ Ready | 2025-11-29 | Enterprise |
| DEPLOYMENT_SUMMARY.md | ✅ Ready | 2025-11-29 | Quick reference |
| ARCHITECTURE_DEPLOYMENT.md | ✅ Ready | 2025-11-29 | Technical |
| README.md | ✅ Updated | 2025-11-29 | Project overview |
| CHANGELOG.md | ✅ New | 2025-11-29 | Version tracking |

---

**🎯 Ready to deploy?**

→ **[Start with QUICKSTART_DEPLOY.md](QUICKSTART_DEPLOY.md)** for the fastest path to production.

→ Or pick another guide above based on your needs.

**Good luck! 🚀**
