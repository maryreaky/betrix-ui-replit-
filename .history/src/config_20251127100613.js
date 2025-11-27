/**
 * Centralized configuration management
 * All environment variables with validation and defaults
 */

const CONFIG = {
  // Core
  REDIS_URL: process.env.REDIS_URL,
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  TZ: process.env.TZ || "Africa/Nairobi",

  // APIs
  API_FOOTBALL: {
    BASE: process.env.API_FOOTBALL_BASE || process.env.API_SPORTS_BASE || "https://api-football-v3.p.rapidapi.com",
    KEY: process.env.API_FOOTBALL_KEY || process.env.API_SPORTS_KEY,
  },

  // AllSports API (RapidAPI)
  ALLSPORTS: {
    HOST: process.env.ALLSPORTS_HOST || 'allsportsapi.p.rapidapi.com',
    KEY: process.env.ALLSPORTS_API || process.env.ALLSPORTS_API_KEY,
  },

  // SportsData.io
  SPORTSDATA: {
    KEY: process.env.SPORTSDATA_API_KEY || process.env.SPORTSDATA_KEY || process.env.SPORTS_DATA_KEY,
    BASE: process.env.SPORTSDATA_BASE || 'https://api.sportsdata.io',
  },

  // Football-Data.org
  FOOTBALLDATA: {
    KEY: process.env.FOOTBALL_DATA_API || process.env.FOOTBALLDATA_API_KEY,
    BASE: process.env.FOOTBALLDATA_BASE || 'https://api.football-data.org/v4',
  },

  // SofaScore (RapidAPI)
  SOFASCORE: {
    BASE: process.env.SOFASCORE_API_BASE || 'https://sofascore.p.rapidapi.com',
    KEY: process.env.SOFASCORE_API_KEY || process.env.RAPIDAPI_KEY,
    HOST: process.env.SOFASCORE_HOST || 'sofascore.p.rapidapi.com',
  },

  // SportsMonks
  SPORTSMONKS: {
    KEY: process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_API_KEY,
    BASE: process.env.SPORTSMONKS_BASE || 'https://api.sportsmonks.com/v3',
  },

  // Telegram
  TELEGRAM: {
    SAFE_CHUNK: Math.max(500, Number(process.env.TELEGRAM_SAFE_CHUNK || 3000)),
    ADMIN_ID: process.env.ADMIN_TELEGRAM_ID,
    BOT_USERNAME: process.env.BOT_USERNAME,
  },

  // M-Pesa (Daraja)
  MPESA: {
    ENABLED: Boolean(process.env.MPESA_CONSUMER_KEY),
    ENV: process.env.MPESA_ENV || "sandbox",
    CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    SHORTCODE: process.env.MPESA_SHORTCODE,
    PASSKEY: process.env.MPESA_PASSKEY,
    CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
    PAYBILL: process.env.MPESA_PAYBILL,
    TILL: process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || "606215", // Safaricom Till Number
    ACCOUNT: process.env.MPESA_ACCOUNT || "BETRIX",
    API_BASE: (process.env.MPESA_ENV === "production")
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke",
  },

  // PayPal
  PAYPAL: {
    ENABLED: Boolean(process.env.PAYPAL_CLIENT_ID),
    ENV: process.env.PAYPAL_ENV || "sandbox",
    CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    SUCCESS_URL: process.env.PAYPAL_SUCCESS_URL,
    CANCEL_URL: process.env.PAYPAL_CANCEL_URL,
    API_BASE: (process.env.PAYPAL_ENV === "live")
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com",
  },

  // Binance
  BINANCE: {
    ENABLED: Boolean(process.env.BINANCE_WALLET_ADDRESS),
    WALLET_ADDRESS: process.env.BINANCE_WALLET_ADDRESS,
    MEMO_TAG: process.env.BINANCE_MEMO_TAG,
  },

  // Banking
  BANK: {
    BTC_ADDRESS: process.env.BTC_ADDRESS,
    SWIFT_BANK_NAME: process.env.SWIFT_BANK_NAME,
    SWIFT_ACCOUNT_NAME: process.env.SWIFT_ACCOUNT_NAME,
    SWIFT_IBAN: process.env.SWIFT_IBAN,
    SWIFT_SWIFT: process.env.SWIFT_SWIFT,
  },

  // Gemini AI
  GEMINI: {
    API_KEY: process.env.GEMINI_API_KEY,
    ENABLED: Boolean(process.env.GEMINI_API_KEY),
    MAX_PROMPT_TOKENS: Number(process.env.GEMINI_MAX_PROMPT_TOKENS || 1500),
  },

  // Twilio OTP
  TWILIO: {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  },

  // Pricing
  PRICING: {
    SIGNUP_FEE: { KES: 150, USD: 1 },
    VVIP: {
      DAILY: { KES: 200, USD: 2 },
      WEEKLY: { KES: 800, USD: 6 },
      MONTHLY: { KES: 2500, USD: 20 },
    },
  },

  // Pagination
  PAGE_SIZE: 5,
  MAX_TABLE_ROWS: 20,
  MAX_AGG_ROWS: 30,

  // Limits
  FREE_ODDS_DAILY_LIMIT: 2,

  // Roles
  ROLES: {
    FREE: "free",
    MEMBER: "member",
    VVIP: "vvip",
  },

  // Durations (milliseconds)
  DURATIONS: {
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
  },

  // Leagues mapping
  LEAGUES: {
    epl: 39, premierleague: 39, england: 39,
    laliga: 140, spain: 140,
    seriea: 135, italy: 135,
    bundesliga: 78, germany: 78,
    ligue1: 61, france: 61,
    ucl: 2, championsleague: 2,
  },

  // Provider health & feature flags
  PROVIDERS: {
    SPORTSDATA: { enabled: process.env.PROVIDER_SPORTSDATA_ENABLED !== 'false', priority: 1 },
    SPORTSMONKS: { enabled: process.env.PROVIDER_SPORTSMONKS_ENABLED !== 'false', priority: 2 },
    API_SPORTS: { enabled: process.env.PROVIDER_API_SPORTS_ENABLED !== 'false', priority: 3 },
    FOOTBALLDATA: { enabled: process.env.PROVIDER_FOOTBALLDATA_ENABLED !== 'false', priority: 4 },
    SOFASCORE: { enabled: process.env.PROVIDER_SOFASCORE_ENABLED !== 'false', priority: 5 },
    ALLSPORTS: { enabled: process.env.PROVIDER_ALLSPORTS_ENABLED !== 'false', priority: 6 },
    ESPN: { enabled: process.env.PROVIDER_ESPN_ENABLED !== 'false', priority: 7 },
    CLAUDE: { enabled: process.env.PROVIDER_CLAUDE_ENABLED !== 'false', priority: 0 }
  },

  // Provider diagnostics (Redis key prefix)
  DIAGNOSTICS: {
    PREFIX: 'betrix:provider:health:',
    TTL: 3600, // 1 hour
  },
  // Claude (Anthropic) Haiku model
  CLAUDE: {
    ENABLED: process.env.CLAUDE_HAIKU_ENABLED !== 'false',
    API_KEY: process.env.CLAUDE_API_KEY || process.env.CLAUDE_HAIKU_KEY || null,
    MODEL: process.env.CLAUDE_HAIKU_MODEL || 'claude-haiku-4.5',
    TIMEOUT_MS: Number(process.env.CLAUDE_TIMEOUT_MS || 15000)
  },
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = ["REDIS_URL", "TELEGRAM_TOKEN"];
  const missing = required.filter(k => !process.env[k]);
  
  // Accept either API_FOOTBALL_KEY or API_SPORTS_KEY
  const hasApiFootballKey = process.env.API_FOOTBALL_KEY || process.env.API_SPORTS_KEY;
  if (!hasApiFootballKey) {
    missing.push("API_FOOTBALL_KEY (or API_SPORTS_KEY)");
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export { CONFIG, validateConfig };
