# Environment & Provider Setup (Render / GitHub Actions / Heroku)

This document shows quick, copy/paste steps to create an environment group and add secrets for staging on common platforms.

## Principles
- Never commit secrets to the repository.
- Use the provider's secrets manager or GitHub Actions secrets.
- Use `REDIS_URL`, `TELEGRAM_TOKEN`, and payment sandbox keys for staging.

---

## Render (example)
1. In Render dashboard, go to your service -> Environment -> Environment Variables.
2. Click **Add Environment Variable** and add keys from `.env.example` (use real values).
3. Deploy the service (Render will use the new env vars on next deploy).

Render CLI (optional):
```powershell
# example: set an env var for a service
render services update-env --service-id srv-xxxxx --env-vars "REDIS_URL=redis://:password@host:6379"
```

Add new sports provider keys (example):

```powershell
# AllSports (RapidAPI)
render services update-env --service-id srv-xxxxx --env-vars "ALLSPORTS_API=<your-allsports-key>"

# SportsData.io
render services update-env --service-id srv-xxxxx --env-vars "SPORTSDATA_API_KEY=<your-sportsdata-key>"
```

---

## Heroku (example)
```powershell
# set config vars
heroku config:set REDIS_URL="redis://:password@host:6379" --app your-app-name
heroku config:set TELEGRAM_TOKEN="<token>" --app your-app-name
```

---

## GitHub Actions (example)
1. Go to repository -> Settings -> Secrets -> Actions -> New repository secret.
2. Add secrets named exactly as keys used in code (e.g., `REDIS_URL`, `TELEGRAM_TOKEN`, `PAYPAL_CLIENT_ID`, etc.).

Workflow snippet to expose secrets to a deploy step:
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Render
        uses: render-examples/deploy@v1
        env:
          REDIS_URL: ${{ secrets.REDIS_URL }}
          TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}
          PAYPAL_CLIENT_ID: ${{ secrets.PAYPAL_CLIENT_ID }}
          PAYPAL_CLIENT_SECRET: ${{ secrets.PAYPAL_CLIENT_SECRET }}
```

---

## Local safe testing
- Use `.env` on your machine (do not commit). The `.env.example` file lists required keys.
- You can run the e2e simulation locally without a real Redis (the script falls back to an in-memory mock):

```powershell
# if you want to use real staging Redis set REDIS_URL in your env
$env:REDIS_URL = "redis://:yourpassword@staging-redis:6379"
node scripts/e2e-simulate.js
```

---

If you want, I can generate IaC examples (Terraform) or a GitHub Actions deployment workflow tailored to Render/Heroku — tell me which provider and I'll scaffold it.
