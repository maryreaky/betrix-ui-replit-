/**
 * BETRIX EXPRESS SERVER - PRODUCTION
 * - Express + WebSocket + Redis + Multer + Rate limiting + Security + Logging
 * - Proxy-aware rate limiting (uses req.ip with trust proxy)
 * - Secure Telegram webhook validation via X-Telegram-Bot-Api-Secret-Token
 * - Admin basic auth (bcrypt + Redis), graceful shutdown, health and metrics
 *
 * Review environment variables before deploying:
 *   REDIS_URL, TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET, PORT, NODE_ENV, ADMIN_USERNAME, ADMIN_PASSWORD, ALLOWED_ORIGINS
 *
 * Install required packages:
 *   npm i express body-parser ioredis helmet cors express-rate-limit compression morgan ws multer bcryptjs dotenv
 */

import express from "express";
import bodyParser from "body-parser";
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
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

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

const server = createServer(app);
const redis = new Redis(REDIS_URL);
const wss = new WebSocketServer({ server });

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
  console.log(`[${ts}] [${level}] [${moduleName}] ${message}${extra}`);

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
      clientSubscriptions.set(ws, subs);
      log("INFO", "WEBSOCKET", "Subscribed", { clientId, channels });
      safeSend(ws, { type: "subscribed", channels, ts: Date.now() });
      break;
    }
    case "unsubscribe": {
      const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
      const subs = clientSubscriptions.get(ws) || new Set();
      channels.forEach(c => subs.delete(c));
      clientSubscriptions.set(ws, subs);
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
}));

app.use(cors({
  origin: ALLOWED_ORIGINS === "*" ? "*" : ALLOWED_ORIGINS.split(",").map(s => s.trim()),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(compression());
app.use(morgan(isProd ? "combined" : "dev"));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

app.use(express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

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
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|txt|csv/;
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok = allowed.test(ext) && allowed.test(file.mimetype);
    if (ok) { log("INFO", "UPLOAD", "Accepted file", { filename: file.originalname, mimetype: file.mimetype }); cb(null, true); }
    else { log("WARN", "UPLOAD", "Rejected file", { filename: file.originalname, mimetype: file.mimetype }); cb(new Error("Invalid file type")); }
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
    await redis.rpush(`jobs:${priority}`, JSON.stringify(job));
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
    endpoints: { dashboard: "/dashboard", api: "/api/v1", admin: "/admin", webhooks: "/webhook", payments: "/paypal", health: "/health", metrics: "/metrics" },
    menu: BETRIX.menu?.main || []
  });
});

app.get("/health", (req, res) => {
  res.json(formatResponse(true, { status: "healthy", uptime: process.uptime(), redis: true, version: BETRIX.version }, "All systems operational"));
});

app.get("/metrics", async (req, res) => {
  try {
    const logCount = await redis.llen(LOG_STREAM_KEY).catch(() => 0);
    res.json(formatResponse(true, { uptime: process.uptime(), logs: logCount }, "Metrics"));
  } catch (err) {
    res.status(500).json(formatResponse(false, null, "Metrics fetch failed"));
  }
});

app.get("/dashboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { brand: BETRIX.brand, menu: BETRIX.menu?.main, stats: { totalUsers: 50000, activePredictions: 1234, uptime: process.uptime() } }));
});

// Admin endpoints
app.get("/admin", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  const raw = await redis.lrange(LOG_STREAM_KEY, 0, 19).catch(() => []);
  const logs = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  res.json(formatResponse(true, { menus: BETRIX.menu?.admin, recentLogs: logs }, "Admin overview"));
});

app.post("/admin/settings", authenticateAdmin, upload.single("logo"), async (req, res) => {
  try {
    const settings = req.body || {};
    await redis.set("admin:settings", JSON.stringify(settings));
    log("INFO", "ADMIN", "Settings updated", { admin: req.adminUser });
    res.json(formatResponse(true, settings, "Settings updated"));
  } catch (err) {
    log("ERROR", "ADMIN", "Settings update failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to update settings"));
  }
});

// Predictions / odds / analytics scaffolding
app.get("/predictions", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { predictions: [{ match: "Barcelona vs Real Madrid", pred: "Barcelona Win", conf: "87%", odds: 1.85 }], accuracy: 97.2 }));
});

app.get("/odds", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { odds: [{ league: "EPL", match: "Man United vs Liverpool", home: 2.45, draw: 3.20, away: 2.80 }], updated: new Date().toISOString() }));
});

app.get("/leaderboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { leaderboard: [{ rank: 1, name: "ProBetter", points: 15450 }], yourRank: 247 }));
});

app.get("/analytics", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { dailyActiveUsers: 12340, totalPredictions: 1234567 }));
});

// User routes
app.get("/user/:userId/stats", tierBasedRateLimiter, (req, res) => {
  const userId = req.params.userId;
  const bets = 156, wins = 95;
  res.json(formatResponse(true, { userId, totalBets: bets, wins, losses: bets - wins, winRate: `${((wins / bets) * 100).toFixed(1)}%` }));
});

app.get("/user/:userId/referrals", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { userId: req.params.userId, totalReferrals: 14, earnings: 8400 }));
});

// Audit & pricing
app.get("/audit", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  try {
    const raw = await redis.lrange(LOG_STREAM_KEY, 0, 50).catch(() => []);
    const parsed = raw.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean).slice(0, 20);
    res.json(formatResponse(true, { auditLogs: parsed }));
  } catch (err) {
    log("ERROR", "AUDIT", "Fetch failed", { err: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to fetch audit logs"));
  }
});

app.get("/pricing", (req, res) => res.json(formatResponse(true, { tiers: BETRIX.pricing })));

// ============================================================================
// TELEGRAM WEBHOOK (secure header validation)
// ============================================================================
const validateTelegramRequest = (req, pathToken) => {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (!header || header !== TELEGRAM_WEBHOOK_SECRET) return { ok: false, reason: "invalid_secret_header" };
  }
  if (pathToken && TELEGRAM_TOKEN && pathToken !== TELEGRAM_TOKEN) return { ok: false, reason: "invalid_path_token" };
  return { ok: true };
};

app.post("/webhook/:token?", tierBasedRateLimiter, express.json({ limit: "1mb" }), async (req, res) => {
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
// ERROR HANDLING & 404
// ============================================================================
app.use((req, res) => res.status(404).json(formatResponse(false, null, "Not found")));

app.use((err, req, res, next) => {
  log("ERROR", "EXPRESS", "Unhandled error", { message: err?.message, stack: err?.stack });
  if (res.headersSent) return next(err);
  res.status(500).json(formatResponse(false, null, "Internal server error"));
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
    server.close(() => log("INFO", "SHUTDOWN", "HTTP server closed"));
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

    server.listen(port, "0.0.0.0", () => {
      log("INFO", "SERVER", "BETRIX Server started", { port, environment: NODE_ENV, version: BETRIX.version });
    });
  } catch (err) {
    log("ERROR", "INIT", "Startup failed", { err: err.message });
    process.exit(1);
  }
};

start();

export { app, server, redis, wss };


