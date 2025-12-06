# Environment variables

Add these to your hosting environment (Render, Heroku, etc.) or a local `.env` file. DO NOT commit secrets to git.

```
# Redis (supports rediss:// for TLS)
REDIS_URL=rediss://<user>:<password>@host:6379

# Postgres
DATABASE_URL=postgresql://<user>:<password>@host:5432/<db>

# Lipana (payments)
LIPANA_API_KEY=<your_lipana_public_key>
LIPANA_SECRET=<your_lipana_secret>
LIPANA_CALLBACK_URL=https://your-domain.example.com/webhook/mpesa
LIPANA_WEBHOOK_SECRET=<your_lipana_webhook_secret>

# Telegram bot
TELEGRAM_TOKEN=<your_telegram_bot_token>
TELEGRAM_WEBHOOK_URL=https://your-domain.example.com/webhook/telegram
TELEGRAM_WEBHOOK_SECRET=<your_telegram_webhook_secret>

# Azure OpenAI (optional)
AZURE_AI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_AI_KEY=<your_azure_api_key>
AZURE_AI_DEPLOYMENT=<your_deployment_name>
AZURE_API_VERSION=2023-05-15

# Optional: SSL/TLS and Postgres options
PGSSLMODE=require
PGSSLROOTCERT=/path/to/root.crt
```

Recommended: Add these values to your Render/host "Environment" or create a local `.env` file and ensure it is in `.gitignore`.

If you want, I can create a local `.env` file with the values you pasted — confirm and I'll write it locally (warning: this will store secrets on disk).