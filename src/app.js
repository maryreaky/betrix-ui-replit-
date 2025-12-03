import express from "express";
import bodyParser from "body-parser";
import crypto from 'crypto';
import { Pool } from 'pg';
import { getRedis } from "./lib/redis-factory.js";
import Redis from "ioredis";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import multer from "multer";
import { TelegramService } from "./services/telegram.js";
import {
  handleMpesaCallback,
  handleSafaricomTillCallback,
  handlePayPalWebhook,
  handleBinanceWebhook,
  verifyPaymentManual
} from "./handlers/payment-webhook.js";
import { getMappingMisses, safeScanAndRepair } from './handlers/admin.js';
import { GeminiService } from "./services/gemini.js";
import { LocalAIService } from "./services/local-ai.js";
import { HuggingFaceService } from "./services/huggingface.js";
import { AzureAIService } from "./services/azure-ai.js";
import OpenLigaDBService from "./services/openligadb.js";
import RSSAggregator from "./services/rss-aggregator.js";
import FootballDataService from "./services/footballdata.js";
import ScoreBatService from "./services/scorebat.js";
import Scrapers from "./services/scrapers.js";
import { normalizeMatch, chooseBestMatch } from "./services/normalizer.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import DataExposureHandler from "./handlers/data-exposure-handler.js";
import { SportsAggregator } from "./services/sports-aggregator.js";

dotenv.config();

// ============================================================================
// PATHS & ENV
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  REDIS_URL = "redis://default:@localhost:6379",
  TELEGRAM_TOKEN = "",
  TELEGRAM_WEBHOOK_SECRET = "",
  PORT = 5000,
  NODE_ENV = "production",
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD = "betrix2024!",
  ALLOWED_ORIGINS = "*"
} = process.env;

const isProd = NODE_ENV === "production";
const port = Number.isInteger(Number(PORT)) ? Number(PORT) : Number(PORT) || 5000;

// ============================================================================
// BRAND CONFIG
// ============================================================================
const BETRIX = {
  name: "BETRIX",
  version: "3.0.0",
  slogan: "Intelligent Sports Betting Analytics",
  colors: { primary: "#2563eb", secondary: "#1e40af", accent: "#f59e0b" },
  menu: {
    main: [
      { name: "Dashboard", path: "/dashboard", icon: "📊" },
      { name: "Live Odds", path: "/odds", icon: "🎯" },
      { name: "Predictions", path: "/predictions", icon: "🔮" },
      { name: "Leaderboard", path: "/leaderboard", icon: "🏆" },
      { name: "Analytics", path: "/analytics", icon: "📈" },
      { name: "Payments", path: "/payments", icon: "💳" }
    ],
    admin: [
      { name: "Overview", path: "/admin", icon: "🖥️" },
      { name: "Users", path: "/admin/users", icon: "👥" },
      { name: "Payments", path: "/admin/payments", icon: "💰" },
      { name: "Analytics", path: "/admin/analytics", icon: "📊" },
      { name: "Settings", path: "/admin/settings", icon: "⚙️" }
    ]
  },
  pricing: {
    free: { name: "Free", price: 0, features: ["Basic Predictions", "Limited Access"] },
    member: { name: "Member", price: 150, features: ["Advanced analytics", "Priority support"] },
    vvip: { name: "VVIP", price: 200, features: ["AI Coach", "Exclusive content"] }
  }
};

// ============================================================================
// APP, SERVER, REDIS, WEBSOCKET
// ============================================================================
const app = express();

// IMPORTANT: set trust proxy BEFORE any middleware that relies on req.ip or X-Forwarded-For
// Use 1 when behind a single trusted proxy (Render, Cloudflare). Adjust if you have more.
app.set("trust proxy", 1);

// Quick top-level debug endpoint to inspect incoming headers and raw body preview
// Placed early to avoid any `/webhook`-prefixed middleware that may reject requests.
app.post('/__debug__webhook_echo', express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), (req, res) => {
  try {
    const headers = {};
    Object.keys(req.headers || {}).forEach(k => {
      if (k.startsWith('x-') || k.includes('signature') || k.includes('lipana')) {
        const v = String(req.headers[k] || '');
        headers[k] = v ? `${v.slice(0,12)}...len:${v.length}` : '(empty)';
      }
    });
    const rawPreview = (req.rawBody && req.rawBody.slice(0, 200).toString('utf8')) || JSON.stringify(req.body || {});
    return res.status(200).json({ ok: true, path: req.path, headerPreview: headers, rawPreview });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e) });
  }
});

const server = createServer(app);
const redis = getRedis();
const wss = new WebSocketServer({ server });

// Postgres connection via env var (used for generic webhook ingestion)
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Instantiate free-data services
const openLiga = new OpenLigaDBService();
const rssAggregator = new RSSAggregator(redis, { ttlSeconds: 60 });
const footballData = new FootballDataService();
const scorebat = new ScoreBatService(process.env.SCOREBAT_TOKEN || null);
const scrapers = new Scrapers(redis);

// Instantiate SportsAggregator for unified data fetching (SportMonks + Football-Data)
const sportsAggregator = new SportsAggregator(redis, { 
  scorebat,
  rss: rssAggregator,
  openLiga
});

// ============================================================================
// LOGGING
// ============================================================================
const LOG_STREAM_KEY = "system:logs";
const LOG_KEEP = 2000;

const safeJson = v => {
  try { return JSON.stringify(v); } catch { return String(v); }
};

const log = (level, moduleName, message, data = null) => {
  const ts = new Date().toISOString();
  const entry = { ts, level, module: moduleName, message, data, env: NODE_ENV };
  const extra = data ? ` | ${safeJson(data)}` : "";
  console.log(`[${ts}] [${level}] [${moduleName}] ${message}${extra} - app.js:157`);

  // Best-effort Redis logging
  redis.lpush(LOG_STREAM_KEY, safeJson(entry)).then(() => redis.ltrim(LOG_STREAM_KEY, 0, LOG_KEEP - 1)).catch(() => {});
  redis.incr(`stats:logs:${level}`).catch(() => {});
};

// ============================================================================
// WEBSOCKET HELPERS
// ============================================================================
const activeConnections = new Set();
const clientSubscriptions = new Map();

const safeSend = (ws, payload) => {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); } catch {}
};

const broadcastToAdmins = message => {
  const str = JSON.stringify(message);
  activeConnections.forEach(ws => { try { if (ws.readyState === 1) ws.send(str); } catch {} });
};

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).slice(2, 11);
  activeConnections.add(ws);
  clientSubscriptions.set(ws, new Set());
  log("INFO", "WEBSOCKET", "Client connected", { clientId, ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress, total: activeConnections.size });

  safeSend(ws, { type: "welcome", data: { brand: BETRIX.name, version: BETRIX.version, clientId, ts: new Date().toISOString() } });

  ws.on("message", raw => {
    try {
      const data = JSON.parse(String(raw));
      handleWebSocketMessage(ws, data, clientId);
    } catch (err) {
      log("ERROR", "WEBSOCKET", "Invalid WS message", { clientId, err: err.message });
      safeSend(ws, { type: "error", error: "Invalid message format" });
    }
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    clientSubscriptions.delete(ws);
    log("INFO", "WEBSOCKET", "Client disconnected", { clientId, remaining: activeConnections.size });
  });

  ws.on("error", err => log("ERROR", "WEBSOCKET", "WS error", { clientId, err: err.message }));
});

const handleWebSocketMessage = (ws, data, clientId) => {
  if (!data || typeof data.type !== "string") { safeSend(ws, { type: "error", error: "Missing message type" }); return; }
  switch (data.type) {
    case "subscribe": {
      const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
      const subs = clientSubscriptions.get(ws) || new Set();
      channels.forEach(c => subs.add(c));
      clientSubscriptions.set(ws, new Set());
      log("INFO", "WEBSOCKET", "Subscribed", { clientId, channels });
      safeSend(ws, { type: "subscribed", channels, ts: Date.now() });
      break;
    }
    case "unsubscribe": {
      const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
      const subs = clientSubscriptions.get(ws) || new Set();
      channels.forEach(c => subs.delete(c));
      clientSubscriptions.set(ws, new Set());
      log("INFO", "WEBSOCKET", "Unsubscribed", { clientId, channels });
      safeSend(ws, { type: "unsubscribed", channels });
      break;
    }
    case "ping": safeSend(ws, { type: "pong", ts: Date.now(), clientId }); break;
    case "get-stats": safeSend(ws, { type: "stats", data: { uptime: process.uptime(), ts: Date.now() } }); break;
    default:
      log("WARN", "WEBSOCKET", "Unknown WS type", { clientId, type: data.type });
      safeSend(ws, { type: "error", error: "Unknown message type" });
  }
};

// ============================================================================
// PUB/SUB: prefetch updates -> broadcast to WebSocket clients
// NOTE: MUST create a separate Redis client for pub/sub, not the singleton
// because once subscribed, Redis doesn't allow regular commands on that connection
// ============================================================================
try {
  // Create a SEPARATE Redis instance dedicated to pub/sub
  // Do NOT reuse the singleton getRedis() since it's used for regular commands
  const sub = process.env.USE_MOCK_REDIS === '1' || !process.env.REDIS_URL
    ? { subscribe: async () => {}, on: () => {} }  // Mock pub/sub for local testing
    : new Redis(process.env.REDIS_URL);  // Real ioredis instance for production

  sub.subscribe('prefetch:updates', 'prefetch:error').then(() => {
    log('INFO', 'PREFETCH', 'Subscribed to prefetch channels');
  }).catch(()=>{});

  sub.on('message', (channel, message) => {
    let payload = message;
    try {
      payload = JSON.parse(message);
    } catch (e) {
      // keep raw payload if JSON parse fails
    }
    log('INFO', 'PREFETCH', `pubsub:${channel}`, { payload });
    try {
      broadcastToAdmins({ type: channel, data: payload });
    } catch (e) {
      console.error('broadcast prefetch failed - app.js:262', e);
    }
  });
} catch (e) {
  console.error('prefetch subscriber failed to start - app.js:266', e);
}

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.telegram.org", "https://api.paypal.com"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
});

app.use(cors({
  origin: ALLOWED_ORIGINS === "*" ? "*" : ALLOWED_ORIGINS.split(",").map(s => s.trim()),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 200
});

app.use(compression();
app.use(morgan(isProd ? "combined" : "dev");
// Capture raw bytes for HMAC verification at the global JSON parser level.
// This ensures `req.rawBody` is available even if body parsing happens earlier.
app.use(bodyParser.json({ limit: "50mb", verify: (req, _res, buf) => { req.rawBody = buf; } });
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" });

app.use(express.static(path.join(__dirname, "public"));
app.use("/assets", express.static(path.join(__dirname, "assets"));

app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|woff|woff2)$/)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
  } else {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Powered-By", `${BETRIX.name}/${BETRIX.version}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// ============================================================================
// RATE LIMITING (proxy-aware key generator using req.ip)
// ============================================================================
const baseLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => NODE_ENV === "development",
    keyGenerator: req => {
      try {
        // Use express-rate-limit helper to normalize IPv6/IPv4 addresses
        return ipKeyGenerator(req);
      } catch (e) {
        // Fallback: proxy-aware req.ip or first X-Forwarded-For entry
        return req.ip || (req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || "unknown";
      }
    }
  });

const freeLimiter = baseLimiter(60 * 1000, 30, "Rate limit exceeded. Upgrade for higher limits.");
const memberLimiter = baseLimiter(60 * 1000, 60, "Rate limit exceeded for member tier.");
const vvipLimiter = baseLimiter(60 * 1000, 150, "Rate limit exceeded for VVIP tier.");
const adminLimiter = baseLimiter(60 * 1000, 300, "Rate limit exceeded for admin.");

const getUserTier = async userId => {
  try {
    if (!userId) return "free";
    const tier = await redis.get(`user:tier:${userId}`);
    return tier || "free";
  } catch (err) {
    log("WARN", "TIER", "Redis tier lookup failed", { err: err.message });
    return "free";
  }
};

const tierBasedRateLimiter = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.body?.userId || req.headers["x-user-id"];
    const tier = await getUserTier(userId);
    log("DEBUG", "RATELIMIT", "Tier check", { userId, tier, ip: req.ip, forwarded: req.headers["x-forwarded-for"] });
    if (tier === "admin") return adminLimiter(req, res, next);
    if (tier === "vvip") return vvipLimiter(req, res, next);
    if (tier === "member") return memberLimiter(req, res, next);
    return freeLimiter(req, res, next);
  } catch (err) {
    log("ERROR", "RATELIMIT", "Tier limiter error", { err: err.message });
    return freeLimiter(req, res, next);
  }
};

// ============================================================================
// UPLOADS (Multer)
 // ============================================================================

// Temporary: inspect incoming webhook headers for debugging Lipana signature delivery.
// Logs header keys and a short masked preview of any signature-like header.
app.use('/webhook', (req, _res, next) => {
  try {
    const keys = Object.keys(req.headers || {}).filter(k => k.startsWith('x-') || k.includes('signature') || k.includes('lipana');
    const preview = {};
    keys.forEach(k => {
      const v = String(req.headers[k] || '').trim();
      // Mask the value but show prefix for debugging (first 8 chars)
      preview[k] = v ? `${v.slice(0,8)}...len:${v.length}` : '(empty)';
    });
    console.log('[WEBHOOKDEBUG] path= - app.js:387', req.path, 'headerPreview=', preview);
  } catch (e) {
    // ignore logging errors
  }
  return next();
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|txt|csv/;
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok = allowed.test(ext) && allowed.test(file.mimetype);
    if (ok) { log("INFO", "UPLOAD", "Accepted file", { filename: file.originalname, mimetype: file.mimetype }); cb(null, true); }
    else { log("WARN", "UPLOAD", "Rejected file", { filename: file.originalname, mimetype: file.mimetype }); cb(new Error("Invalid file type"); }
  }
});

// ============================================================================
// AUTH (Admin Basic + bcrypt + Redis)
 // ============================================================================
const authenticateAdmin = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Basic ")) { log("WARN", "AUTH", "Missing Basic auth"); return res.status(401).json({ error: "Admin authentication required" }); }
  try {
    const creds = Buffer.from(header.slice(6), "base64").toString();
    const [username, password] = creds.split(":");
    let storedHash = await redis.get("admin:password");
    if (!storedHash) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await redis.set("admin:password", hash);
      storedHash = hash;
      log("INFO", "AUTH", "Initialized admin password hash");
    }
    const valid = await bcrypt.compare(password, storedHash);
    if (username === ADMIN_USERNAME && valid) { req.adminUser = username; log("INFO", "AUTH", "Admin authenticated", { username }); return next(); }
    log("WARN", "AUTH", "Invalid admin credentials", { username }); return res.status(401).json({ error: "Invalid admin credentials" });
  } catch (err) {
    log("ERROR", "AUTH", "Auth error", { err: err.message }); return res.status(500).json({ error: "Authentication failed" });
  }
};

// ============================================================================
// UTILITIES
// ============================================================================
const formatResponse = (success, data = null, message = "") => ({ success, data, message, timestamp: new Date().toISOString(), brand: BETRIX.name });

const queueJob = async (type, payload, priority = "normal") => {
  const id = Math.random().toString(36).slice(2, 12);
  const job = { id, type, payload, priority, ts: Date.now() };
  try {
    // Special-case Telegram webhook updates: push directly to the worker queue
    if (type === "telegram:update") {
      // Some parts of the code push the raw update object; the worker expects the
      // serialized update on the Redis list `telegram:updates` so push payload there.
      await redis.rpush("telegram:updates", JSON.stringify(payload);
      log("INFO", "QUEUE", "Queued telegram:update to telegram:updates", { id, size: JSON.stringify(payload).length });
      return id;
    }

    await redis.rpush(`jobs:${priority}`, JSON.stringify(job);
    log("INFO", "QUEUE", "Queued job", { id, type, priority });
    return id;
  } catch (err) {
    log("ERROR", "QUEUE", "Queue push failed", { err: err.message });
    throw err;
  }
};

// ============================================================================
// ROUTES
// ============================================================================
app.get("/", (req, res) => {
  res.json({
    brand: { name: BETRIX.name, version: BETRIX.version, slogan: BETRIX.slogan },
    status: "operational",
    uptime: process.uptime(),
    endpoints: { dashboard: "/dashboard", monitor: "/monitor.html", api: "/api/v1", admin: "/admin", webhooks: "/webhook", payments: "/paypal", health: "/health", metrics: "/metrics" },
    menu: BETRIX.menu?.main || []
  });
});

app.get("/health", (req, res) => {
  res.json(formatResponse(true, { status: "healthy", uptime: process.uptime(), redis: true, version: BETRIX.version }, "All systems operational");
});

app.get("/metrics", async (req, res) => {
  try {
    const logCount = await redis.llen(LOG_STREAM_KEY).catch(() => 0);
    res.json(formatResponse(true, { uptime: process.uptime(), logs: logCount }, "Metrics");
  } catch (err) {
    res.status(500).json(formatResponse(false, null, "Metrics fetch failed");
  }
});

// Simple endpoints for free sources
app.get('/openligadb/leagues', async (req, res) => {
  try {
    const leagues = await openLiga.getAvailableLeagues();
    return res.json(formatResponse(true, leagues.slice(0, 200), 'OpenLigaDB leagues');
  } catch (err) {
    log('ERROR', 'OPENLIGA', 'Failed to fetch leagues', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch leagues');
  }
});

app.get('/openligadb/matchdata', async (req, res) => {
  try {
    const league = req.query.league;
    const season = req.query.season || new Date().getFullYear();
    const group = req.query.group || 1;
    if (!league) return res.status(400).json(formatResponse(false, null, 'Missing league param (e.g. bl1)');
    const data = await openLiga.getMatchData(league, season, group);
    return res.json(formatResponse(true, data, 'Match data');
  } catch (err) {
    log('ERROR', 'OPENLIGA', 'Matchdata fetch failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch match data');
  }
});

// Friendly live wrapper: best-effort recent matches for a league
app.get('/live', async (req, res) => {
  try {
    const league = req.query.league || 'bl1';
    const season = req.query.season || new Date().getFullYear();
    const groups = Number(req.query.groups || 3);
    const data = await openLiga.getRecentMatches(league, season, groups);
    // Filter to upcoming / recent matches within sensible window
    return res.json(formatResponse(true, data, 'Live/Recent matches (best-effort)');
  } catch (err) {
    log('ERROR', 'LIVE', 'Live fetch failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch live matches');
  }
});

// Aggregate news feeds (BBC + ESPN + Guardian recommended)
app.get('/news', async (req, res) => {
  try {
    const feeds = [
      'https://feeds.bbci.co.uk/sport/football/rss.xml',
      'https://www.theguardian.com/football/rss',
      'https://www.espn.com/espn/rss/football/news'
    ];
    const results = await rssAggregator.fetchMultiple(feeds);
    return res.json(formatResponse(true, results, 'Aggregated sports news feeds');
  } catch (err) {
    log('ERROR', 'RSS', 'News aggregation failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch news');
  }
});

// Football-data CSV endpoint
app.get('/fixtures', async (req, res) => {
  try {
    const comp = req.query.comp || 'E0';
    const season = req.query.season || '2324';
    const data = await footballData.fixturesFromCsv(comp, season);
    // Cache to Redis for short period
    await redis.set(`cache:fixtures:${comp}:${season}`, JSON.stringify(data), 'EX', 60 * 60).catch(()=>{});
    return res.json(formatResponse(true, data, 'Fixtures from football-data.co.uk (best-effort)');
  } catch (err) {
    log('ERROR', 'FOOTBALLDATA', 'Fixtures fetch failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch fixtures');
  }
});

// Highlights endpoint via ScoreBat
app.get('/highlights', async (req, res) => {
  try {
    const feed = await scorebat.freeFeed().catch(e => ({ error: e.message });
    return res.json(formatResponse(true, feed, 'ScoreBat highlights (free feed)');
  } catch (err) {
    log('ERROR', 'SCOREBAT', 'Highlights fetch failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch highlights');
  }
});

// Standings normalization endpoint: combine OpenLigaDB + football-data
app.get('/standings', async (req, res) => {
  try {
    const league = req.query.league || 'bl1';
    const season = req.query.season || new Date().getFullYear();
    // Try OpenLigaDB first
    let openData = [];
    try { openData = await openLiga.getMatchData(league, season, 1).catch(()=>[]); } catch(e) { openData = []; }
    // Try football-data as fallback for fixtures/standings
    let fdData = [];
    try { const fdRes = await footballData.fixturesFromCsv('E0', '2324').catch(()=>null); if (fdRes) fdData = fdRes.fixtures || []; } catch(e) { fdData = []; }

    // Normalize some matches and pick best
    const normalized = [];
    for (const m of (openData || []).slice(0,50)) normalized.push(normalizeMatch(m, 'openligadb');
    for (const m of (fdData || []).slice(0,50)) normalized.push(normalizeMatch(m, 'footballdata');

    const best = normalized.map(n => ({...n, rank: n.confidence})).slice(0,50);
    return res.json(formatResponse(true, { combined: best, sources: { open: !!openData.length, footballData: !!fdData.length } }, 'Combined standings/matches (normalized)');
  } catch (err) {
    log('ERROR', 'STANDINGS', 'Standings failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Failed to fetch standings');
  }
});

// Admin queue status (safe: no secrets). Shows Redis queue lengths and worker heartbeat.
app.get("/admin/queue", async (req, res) => {
  try {
    const telegramUpdates = await redis.llen("telegram:updates").catch(() => 0);
    const telegramCallbacks = await redis.llen("telegram:callbacks").catch(() => 0);
    const workerHeartbeat = await redis.get("worker:heartbeat").catch(() => null);
    const commit = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null;

    return res.json(formatResponse(true, {
      telegram_updates: telegramUpdates,
      telegram_callbacks: telegramCallbacks,
      worker_heartbeat: workerHeartbeat ? Number(workerHeartbeat) : null,
      commit: commit
    }, "Queue status");
  } catch (err) {
    log("ERROR", "ADMIN", "Failed to read queue status", { err: err.message });
    return res.status(500).json(formatResponse(false, null, "Failed to read queue status");
  }
});

// Admin: fetch Telegram getWebhookInfo (uses server-side token, no token exposure)
app.get("/admin/webhook-info", async (req, res) => {
  try {
    if (!TELEGRAM_TOKEN) return res.status(400).json(formatResponse(false, null, "TELEGRAM_TOKEN not configured");
    const tg = new TelegramService(TELEGRAM_TOKEN);
    const info = await tg.getWebhookInfo();
    return res.json(formatResponse(true, info, "Webhook info retrieved");
  } catch (err) {
    log("ERROR", "TELEGRAM", "getWebhookInfo failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Failed to fetch webhook info");
  }
});

// Admin AI health: reports which AI integrations are enabled and last active provider
app.get("/admin/ai-health", async (req, res) => {
  try {
    const geminiEnabled = !!process.env.GEMINI_API_KEY;
  const huggingfaceModelsRaw = process.env.HUGGINGFACE_MODELS || process.env.HUGGINGFACE_MODEL || null;
  const huggingfaceModels = huggingfaceModelsRaw ? huggingfaceModelsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const huggingfaceEnabled = huggingfaceModels.length > 0;
    const localEnabled = true; // LocalAI is built-in
    const lastActive = await redis.get("ai:active").catch(() => null);

    return res.json(formatResponse(true, {
      geminiEnabled,
  huggingfaceEnabled,
  huggingfaceModels,
      localEnabled,
      lastActive: lastActive || null
    }, "AI health");
  } catch (err) {
    log("ERROR", "ADMIN", "AI health check failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "AI health check failed");
  }
});

// Admin-only raw Gemini debug endpoint - test Gemini API directly and log full response
app.post("/admin/gemini-debug", authenticateAdmin, async (req, res) => {
  try {
    const prompt = req.body?.prompt || "What is artificial intelligence?";
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json(formatResponse(false, null, "GEMINI_API_KEY not set in environment");
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
    });

    const text = result.response?.text?.() || "";
    const status = result.response?.candidates?.[0]?.finishReason || "unknown";
    
    return res.json(formatResponse(true, {
      apiKeyProvided: !!apiKey,
      prompt,
      responseText: text,
      responseLength: text.length,
      finishReason: status,
      fullResponse: JSON.stringify(result.response)
    }, "Gemini debug");
  } catch (err) {
    log('ERROR', 'GEMINI-DEBUG', 'Raw Gemini test failed', { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, { error: err?.message || String(err) }, 'Gemini debug failed');
  }
});

// Admin-only AI test endpoint - runs a short prompt through the composite chain and returns provider+response
app.post("/admin/ai-test", authenticateAdmin, async (req, res) => {
  try {
    const prompt = req.body?.prompt || req.query?.prompt;
    if (!prompt) return res.status(400).json(formatResponse(false, null, "Missing 'prompt' in body or query");

    // Build same composite chain locally in web process for testing (does not affect worker)
    const geminiS = new GeminiService(process.env.GEMINI_API_KEY);
    const azureS = new AzureAIService(
      process.env.AZURE_AI_ENDPOINT || process.env.AZURE_ENDPOINT,
      process.env.AZURE_AI_KEY || process.env.AZURE_KEY,
      process.env.AZURE_AI_DEPLOYMENT || process.env.AZURE_DEPLOYMENT,
      process.env.AZURE_API_VERSION
    );
    const hfModelsRaw = process.env.HUGGINGFACE_MODELS || process.env.HUGGINGFACE_MODEL || null;
    const hf = new HuggingFaceService(hfModelsRaw, process.env.HUGGINGFACE_TOKEN);
    const local = new LocalAIService();

    // Try Gemini
    if (geminiS && geminiS.enabled) {
      try {
        const out = await geminiS.chat(prompt, {});
        return res.json(formatResponse(true, { provider: 'gemini', model: null, response: out }, 'AI test');
      } catch (err) {
        log('WARN', 'AI-TEST', 'Gemini test failed, falling back', { err: err?.message || String(err) });
      }
    }

    // Try Azure
    if (azureS && azureS.isHealthy()) {
      try {
        const out = await azureS.chat(prompt, {});
        return res.json(formatResponse(true, { provider: 'azure', model: azureS.lastUsed || null, response: out }, 'AI test');
      } catch (err) {
        log('WARN', 'AI-TEST', 'Azure test failed, falling back', { err: err?.message || String(err) });
      }
    }

    // Try HuggingFace
    if (hf && hf.isHealthy()) {
      try {
        const out = await hf.chat(prompt);
        return res.json(formatResponse(true, { provider: 'huggingface', model: hf.lastUsed || null, response: out }, 'AI test');
      } catch (err) {
        log('WARN', 'AI-TEST', 'HuggingFace test failed, falling back', { err: err?.message || String(err) });
      }
    }

    // Local fallback
    const out = await local.chat(prompt);
    return res.json(formatResponse(true, { provider: 'local', model: null, response: out }, 'AI test');
  } catch (err) {
    log('ERROR', 'AI-TEST', 'AI test failed', { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, 'AI test failed');
  }
});

app.get("/dashboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { brand: BETRIX.brand, menu: BETRIX.menu?.main, stats: { totalUsers: 50000, activePredictions: 1234, uptime: process.uptime() } });
});

// Admin endpoints
app.get("/admin", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  const raw = await redis.lrange(LOG_STREAM_KEY, 0, 19).catch(() => []);
  const logs = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  res.json(formatResponse(true, { menus: BETRIX.menu?.admin, recentLogs: logs }, "Admin overview");
});

// Admin: mapping misses summary (past N days)
app.get("/admin/mapping-misses", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const data = await getMappingMisses(redis, days);
    return res.json(formatResponse(true, data, "Mapping misses");
  } catch (err) {
    log("ERROR", "ADMIN", "mapping-misses failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Failed to fetch mapping misses");
  }
});

// Admin: provider health dashboard (no auth required, read-only diagnostics)
app.get("/admin/provider-health", async (req, res) => {
  try {
    const prefix = 'betrix:provider:health:';
    // Scan for all provider health keys
    const keys = [];
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100).catch(() => ['0', []]);
      cursor = result[0];
      keys.push(...(result[1] || []);
    } while (cursor !== '0');

    const health = {};
    for (const key of keys) {
      try {
        const val = await redis.get(key).catch(() => null);

    // Log a short fingerprint of the configured secret (does not reveal the secret)
    try {
      const _rawSecret = process.env.LIPANA_WEBHOOK_SECRET ? String(process.env.LIPANA_WEBHOOK_SECRET) : '';
      const trimmedSecret = _rawSecret.trim();
      const secretFingerprint = trimmedSecret ? crypto.createHash('sha256').update(trimmedSecret).digest('hex').slice(0,8) : '(no-secret)';
      console.log('[verifySignature] LIPANA_SECRET fingerprint(first8)= - app.js:786', secretFingerprint);
    } catch (e) {
      // ignore logging errors
    }
        if (val) {
          const parsed = JSON.parse(val);
          const provider = key.replace(prefix, '');
          health[provider] = { ...parsed, lastCheck: new Date(parsed.ts).toISOString() };
        }
      } catch (e) {
        // Skip malformed entries
      }
    }

    const summary = {
      totalProviders: keys.length,
      healthy: Object.values(health).filter(h => h.ok === true).length,
      unhealthy: Object.values(health).filter(h => h.ok === false).length,
      providers: health,
      scanTime: new Date().toISOString()
    };

    return res.json(formatResponse(true, summary, "Provider health dashboard");
  } catch (err) {
    log("ERROR", "ADMIN", "provider-health failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Failed to fetch provider health");
  }
});

// Admin: safe-scan and attempt to repair missing mappings (admin-run only)
app.post("/admin/safe-scan", authenticateAdmin, tierBasedRateLimiter, express.json(), async (req, res) => {
  try {
    const scanLimit = Number(req.body.scanLimit || 2000);
    const days = Number(req.body.days || 7);
    const summary = await safeScanAndRepair(redis, { scanLimit, days });
    return res.json(formatResponse(true, summary, "Safe-scan completed");
  } catch (err) {
    log("ERROR", "ADMIN", "safe-scan failed", { err: err?.message || String(err) });
    return res.status(500).json(formatResponse(false, null, "Safe-scan failed");
  }
});

app.post("/admin/settings", authenticateAdmin, upload.single("logo"), async (req, res) => {
  try {
    const settings = req.body || {};
    await redis.set("admin:settings", JSON.stringify(settings);
    log("INFO", "ADMIN", "Settings updated", { admin: req.adminUser });
    res.json(formatResponse(true, settings, "Settings updated");
  } catch (err) {
    log("ERROR", "ADMIN", "Settings update failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to update settings");
  }
});

// Predictions / odds / analytics scaffolding
app.get("/predictions", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { predictions: [{ match: "Barcelona vs Real Madrid", pred: "Barcelona Win", conf: "87%", odds: 1.85 }], accuracy: 97.2 });
});

app.get("/odds", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { odds: [{ league: "EPL", match: "Man United vs Liverpool", home: 2.45, draw: 3.20, away: 2.80 }], updated: new Date().toISOString() });
});

app.get("/leaderboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { leaderboard: [{ rank: 1, name: "ProBetter", points: 15450 }], yourRank: 247 });
});

app.get("/analytics", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { dailyActiveUsers: 12340, totalPredictions: 1234567 });
});

// User routes
app.get("/user/:userId/stats", tierBasedRateLimiter, (req, res) => {
  const userId = req.params.userId;
  const bets = 156, wins = 95;
  res.json(formatResponse(true, { userId, totalBets: bets, wins, losses: bets - wins, winRate: `${((wins / bets) * 100).toFixed(1)}%` });
});

app.get("/user/:userId/referrals", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { userId: req.params.userId, totalReferrals: 14, earnings: 8400 });
});

// Audit & pricing
app.get("/audit", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  try {
    const raw = await redis.lrange(LOG_STREAM_KEY, 0, 50).catch(() => []);
    const parsed = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean).slice(0, 20);
    res.json(formatResponse(true, { auditLogs: parsed });
  } catch (err) {
    log("ERROR", "AUDIT", "Fetch failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to fetch audit logs");
  }
});

app.get("/pricing", (req, res) => res.json(formatResponse(true, { tiers: BETRIX.pricing }));

// ============================================================================
// MONITORING DASHBOARD (public, provides system health metrics)
// ============================================================================
app.get("/monitor", async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Gather metrics in parallel
    const [
      uptime,
      workerHeartbeat,
      aiActive,
      logCount,
      queueLength,
      activeConnections,
      prefetchFailures,
      prefetchLastUpdates
    ] = await Promise.all([
      Promise.resolve(process.uptime()),
      redis.get('worker:heartbeat').catch(() => null),
      redis.get('ai:active').catch(() => null),
      redis.llen(LOG_STREAM_KEY).catch(() => 0),
      redis.llen('telegram:updates').catch(() => 0),
      Promise.resolve(activeConnections.size),
      (async () => {
        const types = ['rss', 'openligadb', 'scorebat', 'footballdata'];
        const failures = {};
        for (const t of types) {
          const f = await redis.get(`prefetch:failures:${t}`).catch(() => null);
          failures[t] = f ? Number(f) : 0;
        }
        return failures;
      })(),
      (async () => {
        const types = ['rss', 'openligadb', 'scorebat', 'footballdata'];
        const updates = {};
        for (const t of types) {
          const u = await redis.get(`prefetch:last:${t}`).catch(() => null);
          updates[t] = u ? Number(u) : null;
        }
        return updates;
      })()
    ]);

    const workerHealthy = workerHeartbeat && (Date.now() - Number(workerHeartbeat)) < 45000; // 45s tolerance
    const responseTime = Date.now() - startTime;

    res.json(formatResponse(true, {
      status: 'operational',
      uptime_seconds: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      services: {
        worker: {
          healthy: workerHealthy,
          heartbeat_age_ms: workerHeartbeat ? Date.now() - Number(workerHeartbeat) : null,
          last_seen: workerHeartbeat ? new Date(Number(workerHeartbeat)).toISOString() : null
        },
        ai: {
          active_provider: aiActive || 'unknown',
          redis_key: 'ai:active'
        },
        websocket: {
          connected_clients: activeConnections,
          subscribed_types: ['prefetch:updates', 'prefetch:error']
        }
      },
      prefetch: {
        failures: prefetchFailures,
        last_updates: Object.entries(prefetchLastUpdates).reduce((acc, [k, v]) => {
          acc[k] = v ? {
            timestamp: new Date(v).toISOString(),
            age_seconds: Math.floor((Date.now() - v) / 1000)
          } : null;
          return acc;
        }, {})
      },
      queue: {
        pending_updates: queueLength,
        logs_stored: logCount
      },
      performance: {
        response_time_ms: responseTime,
        redis_latency_ms: responseTime  // Approximation
      },
      version: BETRIX.version,
      brand: BETRIX.name
    }, 'System monitoring metrics');
  } catch (err) {
    log('ERROR', 'MONITOR', 'Dashboard failed', { err: err.message });
    return res.status(500).json(formatResponse(false, null, 'Monitor dashboard error');
  }
});

// ============================================================================
// TELEGRAM WEBHOOK (secure header validation)
// ============================================================================
const validateTelegramRequest = (req, pathToken) => {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (!header || header !== TELEGRAM_WEBHOOK_SECRET) return { ok: false, reason: 'invalid_secret_header' };
  }
  if (pathToken && TELEGRAM_TOKEN && pathToken !== TELEGRAM_TOKEN) return { ok: false, reason: 'invalid_path_token' };
  return { ok: true };
};

// Telegram-specific webhook endpoint. Keep this distinct so other /webhook/* routes (mpesa, paypal)
// are not accidentally matched by the generic token route.
app.post("/webhook/telegram/:token?", tierBasedRateLimiter, express.json({ limit: "1mb" }), async (req, res) => {
  const pathToken = req.params.token;
  const check = validateTelegramRequest(req, pathToken);
  if (!check.ok) {
    log("WARN", "WEBHOOK", "Invalid webhook request", { reason: check.reason, forwarded: req.headers["x-forwarded-for"] || req.ip });
    return res.status(403).send("Forbidden");
  }

  try {
    const payload = req.body;
    await queueJob("telegram:update", payload, "normal");
    log("DEBUG", "WEBHOOK", "Webhook queued", { size: JSON.stringify(payload).length });
    return res.status(200).send("OK");
  } catch (err) {
    log("ERROR", "WEBHOOK", "Queue failed", { err: err.message });
    return res.status(500).send("Internal Server Error");
  }
});

// ============================================================================
// PAYMENTS (scaffold)
// ============================================================================
app.get("/paypal/checkout", tierBasedRateLimiter, (req, res) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${BETRIX.name} Payments</title><style>body{font-family:Segoe UI,Arial;background:#f6f8fb;padding:40px} .container{max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.08)}</style></head><body><div class="container"><h1>${BETRIX.name} Payments</h1><p>Redirecting to payment provider...</p></div></body></html>`;
  res.send(html);
});

// ============================================================================
// PAYMENT WEBHOOKS
// ============================================================================
// M-Pesa STK Push callback
app.post(
  "/webhook/payment/mpesa",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleMpesaCallback(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "M-Pesa webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "M-Pesa webhook error");
    }
  }
);

// Safaricom Till confirmation
app.post(
  "/webhook/payment/till",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleSafaricomTillCallback(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Till webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Till webhook error");
    }
  }
);

// PayPal webhook
app.post(
  "/webhook/payment/paypal",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handlePayPalWebhook(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "PayPal webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "PayPal webhook error");
    }
  }
);

// Binance webhook
app.post(
  "/webhook/payment/binance",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await handleBinanceWebhook(req, redis, tg);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Binance webhook failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Binance webhook error");
    }
  }
);

// Simple health check for Render / uptime probes
app.get('/health', (_req, res) => res.status(200).send('OK');
// Lipana / M-Pesa generic webhook receiver (HMAC-SHA256 signature in x-lipana-signature)
function verifySignature(req) {
  // Accept multiple possible header names
  const headerKeys = ['x-lipana-signature', 'x-signature', 'x-lipana-hmac', 'signature', 'x-hook-signature'];
  let signature = null;
  for (const k of headerKeys) {
    if (req.headers[k]) { signature = String(req.headers[k]); break; }
  }
  // Normalize header value if present (but continue so we can log even when missing)
  signature = signature ? signature.trim() : '';
  if (signature.toLowerCase().startsWith('sha256=')) signature = signature.slice(7).trim();

  // Raw bytes from the global JSON parser verify hook
  const raw = req.rawBody || (req.body ? Buffer.from(JSON.stringify(req.body), 'utf8') : Buffer.from('');

  // Use a trimmed secret to avoid accidental whitespace/newline mismatches
  const _rawSecret = process.env.LIPANA_WEBHOOK_SECRET ? String(process.env.LIPANA_WEBHOOK_SECRET) : '';
  const lipanaSecret = _rawSecret.trim();

  // Unconditional fingerprint + incoming signature logging to help debug Render env
  try {
    const fingerprint = crypto.createHash('sha256').update(lipanaSecret).digest('hex').substring(0,8);
    const incomingPreview = signature ? `${String(signature).slice(0,64)}...len:${String(signature).length}` : '(empty)';
    console.log('[verifySignature] LIPANA_SECRET fingerprint(first8)= - app.js:1112', fingerprint);
    console.log('[verifySignature] Incoming signature(header)= - app.js:1113', incomingPreview);
  } catch (e) {
    // ignore logging errors
  }

  // Log raw body preview and headers to help identify byte-level differences
  try {
    const ct = req.headers['content-type'] || '(none)';
    const cl = req.headers['content-length'] || (raw && raw.length) || '(unknown)';
    const rawPreview = raw && raw.slice(0, 1024) ? raw.slice(0, 1024).toString('utf8') : '(empty)';
    const rawHex = raw && raw.slice(0, 64) ? raw.slice(0, 64).toString('hex') : '';
    const parsedPreview = req.body ? JSON.stringify(req.body).slice(0,1024) : '(no parsed body)';
    console.log('[verifySignature] content-type=', ct, 'content-length=', cl);
    console.log('[verifySignature] rawPreview(utf8,first1k)= - app.js:1106', rawPreview);
    console.log('[verifySignature] rawPreview(hex,first64bytes)= - app.js:1107', rawHex);
    console.log('[verifySignature] parsed(JSON.stringify) preview= - app.js:1108', parsedPreview);
  } catch (e) {
    // ignore logging errors
  }

  if (!lipanaSecret) {
    try { console.log('[verifySignature] LIPANA_SECRET is missing or empty - app.js:1119'); } catch (e) {}
    return false;
  }

  const expectedHex = crypto.createHmac('sha256', lipanaSecret).update(raw).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', lipanaSecret).update(raw).digest('base64');

  // Log computed signatures (masked) for easier comparison
  try {
    console.log('[verifySignature] Computed expectedHex(first16)= - app.js:1128', expectedHex.slice(0,16), '...');
    console.log('[verifySignature] Computed expectedBase64(first16)= - app.js:1129', expectedBase64.slice(0,16), '...');
  } catch (e) {}

  const safeCompare = (aBuf, bBuf) => {
    try { if (!Buffer.isBuffer(aBuf) || !Buffer.isBuffer(bBuf)) return false; if (aBuf.length !== bBuf.length) return false; return crypto.timingSafeEqual(aBuf, bBuf); } catch (e) { return false; }
  };

  // Try hex comparison
  try {
    const sigHexBuf = Buffer.from(signature, 'hex');
    const expectedHexBuf = Buffer.from(expectedHex, 'hex');
    if (safeCompare(sigHexBuf, expectedHexBuf)) return true;
  } catch (e) {
    // not hex
  }

  // Try base64 comparison
  try {
    const sigB64Buf = Buffer.from(signature, 'base64');
    const expectedB64Buf = Buffer.from(expectedBase64, 'base64');
    if (safeCompare(sigB64Buf, expectedB64Buf)) return true;
  } catch (e) {
    // not base64
  }

  return false;
}

// Capture raw body buffer for HMAC verification (use Buffer, not string)
app.post('/webhook/mpesa', express.json({ limit: '1mb', verify: (req, res, buf, encoding) => { req.rawBody = buf; } }), async (req, res) => {
    console.log("[WEBHOOK HEADERS]", req.headers);
    console.log("[WEBHOOK HEADERS]", req.headers);
    console.log("[WEBHOOK HEADERS]", req.headers);
  if (!verifySignature(req)) {
    log('WARN', 'WEBHOOK', 'Invalid Lipana signature', { ip: req.ip });
    return res.status(401).send('Unauthorized');
  }
  try {
    log('INFO', 'WEBHOOK', 'Webhook received', { body: req.body });
    // insert into webhooks table (raw_payload stored as jsonb)
    const q = `INSERT INTO webhooks(event, transaction_id, amount, phone, reference, message, timestamp, raw_payload, created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now())`;
    const vals = [
      req.body.event || null,
      req.body.transaction_id || req.body.transactionId || null,
      req.body.amount || null,
      req.body.phone || req.body.msisdn || null,
      req.body.reference || req.body.tx_ref || null,
      req.body.message || null,
      req.body.timestamp || new Date().toISOString(),
      JSON.stringify(req.body)
    ];
    await pool.query(q, vals);
    return res.status(200).send('OK');
  } catch (err) {
    log('ERROR', 'WEBHOOK', 'DB insert error', { err: err?.message || String(err) });
    return res.status(500).send('DB Error');
  }
});

// Temporary debug endpoint: echo masked headers + small raw-body preview
app.post('/webhook/debug-echo', express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }), (req, res) => {
  try {
    const headers = {};
    Object.keys(req.headers || {}).forEach(k => {
      if (k.startsWith('x-') || k.includes('signature') || k.includes('lipana')) {
        const v = String(req.headers[k] || '');
        headers[k] = v ? `${v.slice(0,12)}...len:${v.length}` : '(empty)';
      }
    });
    const rawPreview = (req.rawBody && req.rawBody.slice(0, 200).toString('utf8')) || JSON.stringify(req.body || {});
    return res.status(200).json({ ok: true, path: req.path, headerPreview: headers, rawPreview });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e) });
  }
});

// Manual verify (user clicked "I have paid") - orderId in URL
app.post(
  "/webhook/payment/manual/:orderId",
  tierBasedRateLimiter,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const tg = new TelegramService(TELEGRAM_TOKEN);
      const result = await verifyPaymentManual(req, redis, tg, orderId);
      return res.status(result?.success ? 200 : 400).json(result);
    } catch (err) {
      log("ERROR", "PAYMENTS", "Manual verify failed", { err: err?.message || String(err) });
      return res.status(500).json(formatResponse(false, null, "Manual verify error");
    }
  }
);

// ============================================================================
// ERROR HANDLING & 404
// ============================================================================
app.use((req, res) => res.status(404).json(formatResponse(false, null, "Not found"));

app.use((err, req, res, next) => {
  log("ERROR", "EXPRESS", "Unhandled error", { message: err?.message, stack: err?.stack });
  if (res.headersSent) return next(err);
  res.status(500).json(formatResponse(false, null, "Internal server error");
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("INFO", "SHUTDOWN", "Initiating graceful shutdown");
  try {
    server.close(() => log("INFO", "SHUTDOWN", "HTTP server closed");
    wss.clients.forEach(ws => { try { ws.close(1001, "Server shutting down"); } catch {} });
    await redis.quit().catch(() => {});
    log("INFO", "SHUTDOWN", "Redis connection closed");
  } catch (err) {
    log("ERROR", "SHUTDOWN", "Shutdown error", { err: err.message });
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// START SERVER
// ============================================================================
const start = async () => {
  try {
    const adminHash = await redis.get("admin:password");
    if (!adminHash) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await redis.set("admin:password", hash);
      log("INFO", "INIT", "Admin password initialized");
    }

    // Initialize startup data feed (prefetch initializer)
    try {
      const { default: StartupInitializer } = await import('./services/startup-initializer.js');
      const startupInit = new StartupInitializer(redis);
      
      // Non-blocking startup initialization - fetch data in background
      startupInit.initialize()
        .then(() => {
          const status = startupInit.getStatus();
          log("INFO", "STARTUP", "Startup initialization complete", { 
            ready: status.ready,
            sports: status.sports,
            items: status.totalItems
          });
        })
        .catch(err => {
          log("WARN", "STARTUP", "Startup initialization failed, using fallback providers", { 
            error: err?.message || String(err) 
          });
        });
      
      // Store initializer in app locals for access in handlers
      app.locals.startupInit = startupInit;
    } catch (err) {
      log("WARN", "STARTUP", "Could not load startup initializer", { error: err?.message || String(err) });
    }

    server.listen(port, "0.0.0.0", () => {
      log("INFO", "SERVER", "BETRIX Server started", { port, environment: NODE_ENV, version: BETRIX.version });
    });
    // Register webhook if configured
    try {
      if (TELEGRAM_TOKEN && process.env.TELEGRAM_WEBHOOK_URL) {
        const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
        const secret = TELEGRAM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || null;
        const tg = new TelegramService(TELEGRAM_TOKEN);
        const resp = await tg.setWebhook(webhookUrl, ["message", "callback_query"], secret);
        log("INFO", "TELEGRAM", "setWebhook response", { resp });
      } else {
        log("INFO", "TELEGRAM", "Webhook not configured - missing TELEGRAM_TOKEN or TELEGRAM_WEBHOOK_URL");
      }
    } catch (err) {
      log("ERROR", "TELEGRAM", "Failed to set webhook", { err: err?.message || String(err) });
    }
  } catch (err) {
    log("ERROR", "INIT", "Startup failed", { err: err.message });
    process.exit(1);
  }
};

start();

/**
 * Register data exposure API endpoints
 * Called from worker-final.js after sportsAggregator is initialized
 */
export function registerDataExposureAPI(sportsAggregator) {
  try {
    new DataExposureHandler(app, sportsAggregator);
    log("INFO", "DATA_EXPOSURE", "Data exposure API registered successfully", { endpoints: ['/api/data/summary', '/api/data/live', '/api/data/fixtures', '/api/data/match', '/api/data/standings', '/api/data/leagues', '/api/data/cache-info', '/api/data/cache-cleanup', '/api/data/export', '/api/data/schema'] });
  } catch (err) {
    log("ERROR", "DATA_EXPOSURE", "Failed to register data exposure API", { error: err?.message || String(err) });
  }
}

// Export core app pieces and initialized data services for other modules
export { app, server, redis, wss, openLiga, rssAggregator, footballData, scorebat, scrapers };
export { sportsAggregator };


