# Production Environment Setup for BETRIX

This guide walks you through setting up production environment variables on Render, Heroku, or your own deployment platform.

## Overview

BETRIX requires the following core API keys and credentials:

- **REDIS_URL**: Redis database URL with authentication
- **TELEGRAM_TOKEN**: Telegram bot token for webhook/API access
- **API_SPORTS_KEY** / **API_SPORTS_BASE**: Football/sports data provider (api-sports.io)
- **RAPIDAPI_KEY**: RapidAPI key for AllSports and other RapidAPI endpoints
- **SPORTSDATA_API_KEY**: SportsData.io API key for fixture and league data
- **FOOTBALL_DATA_API**: Football-Data.io API key (optional but recommended)
- **PAYPAL_CLIENT_ID** / **PAYPAL_CLIENT_SECRET**: PayPal OAuth credentials for payment processing
- **PAYPAL_MODE**: Set to `sandbox` for testing, `live` for production
- Optional: AI keys (GEMINI_API_KEY, HF_TOKEN, HUGGINGFACE_TOKEN, AZURE_AI_KEY, etc.)

## Setup Steps

### Step 1: Gather Your Credentials

Collect the following credentials:

- Redis URL with authentication (e.g., `redis://default:password@host:6379`)
- Telegram Bot Token (from BotFather)
- API-Sports (football.api-sports.io) key and base URL
- RapidAPI key (for AllSports and other RapidAPI endpoints)
- SportsData.io API key
- Football-Data.io API key (optional)
- PayPal Client ID and Secret (sandbox or live)
- Gemini, HuggingFace, and other AI provider keys (optional)

### Step 2: Validate Locally (Optional)

Before setting production env vars, you can test them locally using the provided helper:

```powershell
# PowerShell (Windows)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\set-prod-env.ps1 -Vars @{
  REDIS_URL = 'your-redis-url-here'
  TELEGRAM_TOKEN = 'your-telegram-token-here'
  API_SPORTS_KEY = 'your-api-sports-key'
  API_SPORTS_BASE = 'https://v3.football.api-sports.io'
  RAPIDAPI_KEY = 'your-rapidapi-key'
  SPORTSDATA_API_KEY = 'your-sportsdata-key'
  PAYPAL_CLIENT_ID = 'your-paypal-client-id'
  PAYPAL_CLIENT_SECRET = 'your-paypal-secret'
}
```

Or set them manually:

```powershell
$env:REDIS_URL='your-url'
$env:TELEGRAM_TOKEN='your-token'
$env:API_SPORTS_KEY='your-key'
node scripts/check-providers.js
```

Expected output (critical providers):
```
REDIS: OK
TELEGRAM: OK
API_FOOTBALL: OK
SPORTSDATA: OK
```

### Step 3: Set Environment on Render

If you are deploying on Render:

1. Go to your Render service dashboard.
2. Click **Environment** tab.
3. Add each key-value pair.
4. Redeploy the service.

Or use the Render CLI:

```bash
render services update-env --service-id srv-XXXXX \
  --env-vars \
  "REDIS_URL=<your-redis-url> \
   TELEGRAM_TOKEN=<your-telegram-token> \
   API_SPORTS_KEY=<your-api-sports-key> \
   API_SPORTS_BASE=https://v3.football.api-sports.io \
   RAPIDAPI_KEY=<your-rapidapi-key> \
   SPORTSDATA_API_KEY=<your-sportsdata-key> \
   PAYPAL_CLIENT_ID=<your-paypal-client-id> \
   PAYPAL_CLIENT_SECRET=<your-paypal-secret> \
   PAYPAL_MODE=sandbox"
```

### Step 4: Set Environment on Heroku

If you are deploying on Heroku:

```bash
heroku config:set REDIS_URL='<your-redis-url>' \
  TELEGRAM_TOKEN='<your-telegram-token>' \
  API_SPORTS_KEY='<your-api-sports-key>' \
  API_SPORTS_BASE='https://v3.football.api-sports.io' \
  RAPIDAPI_KEY='<your-rapidapi-key>' \
  SPORTSDATA_API_KEY='<your-sportsdata-key>' \
  PAYPAL_CLIENT_ID='<your-paypal-client-id>' \
  PAYPAL_CLIENT_SECRET='<your-paypal-secret>' \
  --app your-app-name
```

### Step 5: Set Environment on Azure Web App

If you are deploying on Azure:

```bash
az webapp config appsettings set --name your-app-name \
  --resource-group your-rg \
  --settings \
  REDIS_URL='<your-redis-url>' \
  TELEGRAM_TOKEN='<your-telegram-token>' \
  API_SPORTS_KEY='<your-api-sports-key>' \
  API_SPORTS_BASE='https://v3.football.api-sports.io'
```

## Step 6: Verify Providers Are Working

After setting the environment variables and redeploying:

1. **SSH into the production environment** (or access the logs) and run:
   ```bash
   node scripts/check-providers.js
   ```
   All critical providers (Redis, Telegram, API-Football, SportsData) should show **OK**.

2. **Test the bot in Telegram**:
   - Send `/menu` to your BETRIX bot.
   - Verify you receive a formatted menu response (not demo/fallback text).
   - Send `/live` to see live football matches (should show real data, not samples).

3. **Monitor logs** for errors:
   - Check your hosting provider's logs for any Redis connection or API failures.
   - Look for lines like `[WEBHOOK] ✅ handleUpdate called` indicating webhook is active.

## Environment Variable Mappings

The codebase accepts multiple names for the same credential to support different naming conventions:

| Internal Name | Accepted Environment Names |
|---|---|
| `API_FOOTBALL_KEY` | `API_FOOTBALL_KEY`, `API_SPORTS_KEY` |
| `API_FOOTBALL_BASE` | `API_FOOTBALL_BASE`, `API_SPORTS_BASE` |
| `ALLSPORTS_API` | `ALLSPORTS_API`, `ALLSPORTS_API_KEY`, `RAPIDAPI_KEY` |
| `SPORTSDATA_API_KEY` | `SPORTSDATA_API_KEY`, `SPORTSDATA_KEY`, `SPORTS_DATA_KEY` |

## Troubleshooting

### "Redis connection failed"
- Verify `REDIS_URL` is correct and includes the password.
- Check that your network allows connections to the Redis host.
- Ensure Redis TLS is properly configured if using TLS.

### "Telegram bot not responding"
- Confirm `TELEGRAM_TOKEN` is correct (no spaces or typos).
- Verify your webhook URL is set correctly in the Telegram Bot API.
- Check logs for `[WEBHOOK]` messages indicating webhook reception.

### "API-Football returns 401"
- Verify `API_SPORTS_KEY` is correct and not expired.
- Check your api-sports.io account for rate limits or subscription status.

### "SportsData returns 401"
- Confirm `SPORTSDATA_API_KEY` is correct.
- Verify your SportsData.io subscription is active.

### "PayPal payment fails"
- In sandbox mode, only test PayPal accounts work.
- Verify `PAYPAL_MODE=sandbox` for testing, or switch to `live` after testing.
- Check that PayPal credentials are from the same sandbox/production account.

## Security Notes

- **Never commit `.env` files or real credentials to version control.**
- Use your hosting provider's secure environment variable storage.
- Rotate API keys regularly.
- Monitor API usage for suspicious activity.
- Keep PayPal mode as `sandbox` until you are ready for live payments.

## Testing Checklist

After deployment:

- [ ] `node scripts/check-providers.js` shows OK for Redis, Telegram, API-Football, SportsData
- [ ] `/menu` command returns formatted menu with buttons (not placeholder text)
- [ ] `/live` command returns actual live football matches (not demo samples)
- [ ] `/standings` command shows real league tables
- [ ] `/odds` command displays current odds
- [ ] Payment buttons work and create orders in the system
- [ ] No Redis NOAUTH or API auth errors in logs
- [ ] Webhook receives messages (check `[WEBHOOK]` logs)

## Next Steps

1. Gather all required credentials from your providers.
2. Set the environment variables on your production platform.
3. Redeploy the application.
4. Run `node scripts/check-providers.js` to validate all providers.
5. Test the bot by sending commands in Telegram.
6. Monitor logs and fix any provider-specific issues.
7. When ready for payments, switch `PAYPAL_MODE` to `live` and update PayPal credentials to production.
