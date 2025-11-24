/**
 * BETRIX EXPRESS SERVER - FULL PRODUCTION VERSION
 * Comprehensive, production-ready, IPv6-safe, proxy-aware
 *
 * Drop this file into src/app.js and restart your service.
 */

import express from "express";
import bodyParser from "body-parser";
import Redis from "ioredis";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import multer from "multer";
import bcrypt from "bcryptjs";

// If Node < 18, uncomment and install node-fetch
// import fetch from "node-fetch";

// ---------------------------------------------------------------------------
// Paths and environment
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  REDIS_URL = "redis://default:@localhost:6379",
  TELEGRAM_TOKEN = "",
  TELEGRAM_WEBHOOK_SECRET = "",
  TELEGRAM_WEBHOOK_URL = "",
  PAYPAL_CLIENT_ID = "",
  PAYPAL_CLIENT_SECRET = "",
  PORT = 5000,
  NODE_ENV = "production",
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD = "betrix2024!",
  ALLOWED_ORIGINS = "*"
} = process.env;

const port = Number.isInteger(parseInt(PORT, 10)) ? parseInt(PORT, 10) : 5000;
const isProd = NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Branding and configuration
// ---------------------------------------------------------------------------
const BETRIX_CONFIG = {
  brand: {
    name: "BETRIX",
    fullName: "BETRIX - Global Sports AI Platform",
    slogan: "Intelligent Sports Betting Analytics",
    version: "3.0.0",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    accentColor: "#f59e0b"
  },
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
      { name: "System Overview", path: "/admin", icon: "🖥️" },
      { name: "User Management", path: "/admin/users", icon: "👥" },
      { name: "Payment Logs", path: "/admin/payments", icon: "💰" },
      { name: "API Analytics", path: "/admin/analytics", icon: "📊" },
      { name: "Settings", path: "/admin/settings", icon: "⚙️" }
    ]
  },
  pricing: {
    tiers: {
      free: { name: "Free", price: 0, features: ["Basic Predictions", "Limited Access", "Community Access"] },
      signup: { name: "Signup", price: 150, features: ["Full Access 24h", "Basic Support", "Professional Betslips"] },
      daily: { name: "VVIP Daily", price: 200, features: ["Premium Predictions", "Priority Support", "AI Coach Access"] },
      weekly: { name: "VVIP Weekly", price: 800, features: ["All Daily Features", "Extended Analytics", "Expert Insights"] },
      monthly: { name: "VVIP Monthly", price: 2500, features: ["All Features", "24/7 Support", "Custom Analysis", "Personal Manager"] }
    }
  }
};

// ---------------------------------------------------------------------------
// App, server, Redis, WebSocket
// ---------------------------------------------------------------------------
const app = express();
const server = createServer(app);
const redis = new Redis(REDIS_URL);
const wss = new WebSocketServer({ server });

// Trust proxy so req.ip uses X-Forwarded-For (Render, Cloudflare, etc.)
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Logging system
// - console + redis list + admin websocket broadcast
// ---------------------------------------------------------------------------
const LOG_STREAM_KEY = "system:logs";
const LOG_LIMIT = 1000;

const log = (level, module, message, data = null) => {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, module, message, data, environment: NODE_ENV };

  // Console
  const addon = data ? ` | ${JSON.stringify(data)}` : "";
  console.log(`[${timestamp}] [${level}] [${module}] ${message}${addon}`);

  // Redis append + trim
  redis.lpush(LOG_STREAM_KEY, JSON.stringify(entry)).then(() => {
    redis.ltrim(LOG_STREAM_KEY, 0, LOG_LIMIT - 1).catch(() => {});
  }).catch(err => {
    console.error("Redis log storage error:", err?.message || err);
  });

  // Counters
  redis.incr(`stats:logs:${level}`).catch(() => {});

  // Broadcast to admin WS clients for WARN/ERROR
  if (level === "WARN" || level === "ERROR") {
    broadcastToAdmins({ type: "log", data: entry });
  }
};

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------
const activeConnections = new Set();
const clientSubscriptions = new Map();

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).slice(2, 11);
  activeConnections.add(ws);
  clientSubscriptions.set(ws, new Set());

  log("INFO", "WEBSOCKET", "Client connected", {
    clientId,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    totalConnections: activeConnections.size
  });

  ws.on("message", raw => {
    try {
      const data = JSON.parse(String(raw));
      handleWebSocketMessage(ws, data, clientId);
    } catch (err) {
      log("ERROR", "WEBSOCKET", "Message parse error", { clientId, error: err.message });
      safeSend(ws, { type: "error", error: "Invalid message format" });
    }
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    clientSubscriptions.delete(ws);
    log("INFO", "WEBSOCKET", "Client disconnected", { clientId, remainingConnections: activeConnections.size });
  });

  ws.on("error", err => {
    log("ERROR", "WEBSOCKET", "Socket error", { clientId, error: err.message });
  });

  safeSend(ws, {
    type: "welcome",
    data: {
      brand: BETRIX_CONFIG.brand,
      systemStatus: "operational",
      timestamp: new Date().toISOString(),
      serverVersion: BETRIX_CONFIG.brand.version,
      clientId
    }
  });
});

const safeSend = (ws, payload) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
};

const broadcastToAdmins = message => {
  const str = JSON.stringify(message);
  activeConnections.forEach(ws => {
    if (ws.readyState === 1) ws.send(str);
  });
};

const broadcastToChannel = (channel, message) => {
  const str = JSON.stringify(message);
  activeConnections.forEach(ws => {
    const subs = clientSubscriptions.get(ws);
    if (subs && subs.has(channel) && ws.readyState === 1) ws.send(str);
  });
};

const handleWebSocketMessage = (ws, data, clientId) => {
  switch (data?.type) {
    case "subscribe": {
      const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
      const subs = clientSubscriptions.get(ws) || new Set();
      channels.forEach(c => subs.add(c));
      clientSubscriptions.set(ws, subs);
      log("INFO", "WEBSOCKET", "Client subscribed", { clientId, channels });
      safeSend(ws, { type: "subscribed", channels, timestamp: Date.now() });
      break;
    }
    case "unsubscribe": {
      const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
      const subs = clientSubscriptions.get(ws) || new Set();
      channels.forEach(c => subs.delete(c));
      clientSubscriptions.set(ws, subs);
      log("INFO", "WEBSOCKET", "Client unsubscribed", { clientId, channels });
      safeSend(ws, { type: "unsubscribed", channels });
      break;
    }
    case "ping": {
      safeSend(ws, { type: "pong", timestamp: Date.now(), clientId });
      break;
    }
    case "get-stats": {
      safeSend(ws, { type: "stats", data: { clientId, uptime: process.uptime(), timestamp: Date.now() } });
      break;
    }
    default: {
      log("WARN", "WEBSOCKET", "Unknown message type", { clientId, type: data?.type });
      safeSend(ws, { type: "error", error: "Unknown message type" });
    }
  }
};

// ---------------------------------------------------------------------------
// Middleware stack
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
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
  res.setHeader("X-Powered-By", `${BETRIX_CONFIG.brand.name}/${BETRIX_CONFIG.brand.version}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// ---------------------------------------------------------------------------
// Rate limiting - IPv6 safe using ipKeyGenerator
// ---------------------------------------------------------------------------
const baseRateLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => NODE_ENV === "development",
    keyGenerator: req => ipKeyGenerator(req) // use helper to normalize IPv6
  });

const freeLimiter = baseRateLimiter(60 * 1000, 30, "Rate limit exceeded. Upgrade for higher limits.");
const memberLimiter = baseRateLimiter(60 * 1000, 60, "Rate limit exceeded for member tier.");
const vvipLimiter = baseRateLimiter(60 * 1000, 150, "Rate limit exceeded for VVIP tier.");
const adminLimiter = baseRateLimiter(60 * 1000, 300, "Rate limit exceeded for admin.");

const getUserTier = async userId => {
  try {
    if (!userId) return "free";
    const cached = await redis.get(`user:tier:${userId}`);
    return cached || "free";
  } catch (err) {
    log("WARN", "TIER", "Cache lookup failed", { error: err.message });
    return "free";
  }
};

const tierBasedRateLimiter = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.body.userId || req.headers["x-user-id"];
    const tier = await getUserTier(userId);
    log("DEBUG", "RATELIMIT", "Applying tier limiter", { userId, tier, ip: req.ip, forwarded: req.headers["x-forwarded-for"] });
    if (tier === "admin") return adminLimiter(req, res, next);
    if (tier === "vvip") return vvipLimiter(req, res, next);
    if (tier === "member") return memberLimiter(req, res, next);
    return freeLimiter(req, res, next);
  } catch (err) {
    log("ERROR", "RATELIMIT", "Tier limiter error", { error: err.message });
    return freeLimiter(req, res, next);
  }
};

// ---------------------------------------------------------------------------
// File uploads (Multer)
// ---------------------------------------------------------------------------
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|txt|csv/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      log("INFO", "UPLOAD", "File validated", { filename: file.originalname, mimetype: file.mimetype });
      return cb(null, true);
    }
    log("WARN", "UPLOAD", "Invalid file type", { filename: file.originalname, mimetype: file.mimetype });
    cb(new Error("Invalid file type. Allowed: jpeg, jpg, png, gif, pdf, txt, csv"));
  }
});

// ---------------------------------------------------------------------------
// Admin authentication (Basic + bcrypt + Redis)
// ---------------------------------------------------------------------------
const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    log("WARN", "AUTH", "Missing Basic auth");
    return res.status(401).json({ error: "Admin authentication required" });
  }
  try {
    const creds = Buffer.from(auth.slice(6), "base64").toString();
    const [username, password] = creds.split(":");
    const adminHash = await redis.get("admin:password");
    if (!adminHash) {
      log("WARN", "AUTH", "Admin password not initialized");
      return res.status(500).json({ error: "Admin system not initialized" });
    }
    const ok = await bcrypt.compare(password, adminHash);
    if (username === ADMIN_USERNAME && ok) {
      req.adminUser = username;
      log("INFO", "AUTH", "Admin authenticated", { username });
      return next();
    }
    log("WARN", "AUTH", "Invalid admin credentials", { username });
    return res.status(401).json({ error: "Invalid admin credentials" });
  } catch (err) {
    log("ERROR", "AUTH", "Auth error", { error: err.message });
    return res.status(500).json({ error: "Authentication failed" });
  }
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const formatResponse = (success, data = null, message = "") => ({
  success,
  data,
  message,
  timestamp: new Date().toISOString(),
  brand: BETRIX_CONFIG.brand.name
});

const getBrandStyles = () => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, ${BETRIX_CONFIG.brand.primaryColor} 0%, ${BETRIX_CONFIG.brand.secondaryColor} 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .container { max-width: 500px; width: 100%; padding: 20px; }
  .brand-header { text-align: center; color: white; margin-bottom: 40px; }
  .brand-header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 700; }
  .brand-header p { font-size: 1.1em; opacity: 0.9; }
  .payment-status { background: white; border-radius: 10px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); text-align: center; }
  .payment-status.success { border-top: 5px solid #10b981; }
  .payment-status.error { border-top: 5px solid #ef4444; }
  .payment-status.cancelled { border-top: 5px solid ${BETRIX_CONFIG.brand.accentColor}; }
  .payment-status h2 { margin-bottom: 15px; font-size: 1.8em; color: #333; }
  .payment-status p { color: #666; margin-bottom: 20px; line-height: 1.6; }
  .features { text-align: left; background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
  .btn { display: inline-block; padding: 12px 30px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; transition: all 0.3s; border: none; cursor: pointer; }
  .btn-primary { background: ${BETRIX_CONFIG.brand.primaryColor}; color: white; }
  .btn-secondary { background: #e5e7eb; color: #333; }
`;

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------
const generatePricingMessage = () => {
  let msg = `💵 <b>${BETRIX_CONFIG.brand.name} Pricing Plans</b>\n\n`;
  Object.entries(BETRIX_CONFIG.pricing.tiers).forEach(([k, t]) => {
    if (k === "free") return;
    msg += `🎯 <b>${t.name}</b> - ${t.price}\n`;
    t.features.forEach(f => (msg += `   ✅ ${f}\n`));
    msg += "\n";
  });
  msg += `💳 <i>Use /pay to subscribe</i>`;
  return msg;
};

const sendTelegram = async (chatId, message, options = {}) => {
  try {
    if (!TELEGRAM_TOKEN) {
      log("WARN", "TELEGRAM", "Token not configured");
      return { ok: false };
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text: message, parse_mode: "HTML", ...options };
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await resp.json();
    if (data.ok) log("INFO", "TELEGRAM", "Message sent", { chatId });
    else log("ERROR", "TELEGRAM", "Send failed", { chatId, error: data.description });
    return data;
  } catch (err) {
    log("ERROR", "TELEGRAM", "sendTelegram error", { error: err.message });
    return { ok: false };
  }
};

const queueJob = async (jobType, data, priority = "normal") => {
  try {
    const key = `jobs:${priority}`;
    const payload = { id: Math.random().toString(36).slice(2, 11), type: jobType, data, timestamp: Date.now(), priority };
    await redis.rpush(key, JSON.stringify(payload));
    log("INFO", "QUEUE", "Job queued", { type: jobType, id: payload.id });
    return payload.id;
  } catch (err) {
    log("ERROR", "QUEUE", "Queue failed", { error: err.message });
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Routes - root, health, dashboard
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    ...BETRIX_CONFIG.brand,
    status: "operational",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    endpoints: {
      dashboard: "/dashboard",
      api: "/api/v1",
      admin: "/admin",
      webhooks: "/webhook",
      payments: "/paypal",
      health: "/health",
      metrics: "/metrics"
    },
    menu: BETRIX_CONFIG.menu.main
  });
});

app.get("/health", (req, res) => {
  res.json(formatResponse(true, { status: "healthy", uptime: process.uptime(), redis: true, version: BETRIX_CONFIG.brand.version }, "All systems operational"));
});

app.get("/dashboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, {
    brand: BETRIX_CONFIG.brand,
    menu: BETRIX_CONFIG.menu.main,
    stats: { totalUsers: 50000, activePredictions: 1234, totalPayments: 450000, systemUptime: process.uptime() },
    quickActions: [
      { name: "View Predictions", action: "/predictions", icon: "🔮" },
      { name: "Check Odds", action: "/odds/live", icon: "🎯" },
      { name: "Payment History", action: "/payments/history", icon: "💳" },
      { name: "Support", action: "/support", icon: "💬" }
    ]
  }));
});

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------
app.get("/admin", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  const latest = (await redis.lrange(LOG_STREAM_KEY, 0, 19).catch(() => [])).map(s => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);
  res.json(formatResponse(true, { menus: BETRIX_CONFIG.menu.admin, stats: { totalUsers: 50000, activeSessions: 2340, revenue: 450000, systemHealth: "98%" }, recentLogs: latest }));
});

app.get("/admin/users", authenticateAdmin, tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { users: [{ id: 1, name: "User1", tier: "vvip" }, { id: 2, name: "User2", tier: "member" }], total: 50000, active: 45000 }));
});

app.get("/admin/payments", authenticateAdmin, tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { payments: [{ id: "PY1", user: "User1", amount: 2500, status: "completed" }], total: 450000, pending: 25000 }));
});

app.get("/admin/analytics", authenticateAdmin, tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { metrics: { dailyActiveUsers: 12340, totalPredictions: 1234567, accuracy: 97.2, roi: 18.3 }, trends: { predictions: "+15%", users: "+12%", revenue: "+18%" } }));
});

app.post("/admin/settings", authenticateAdmin, upload.single("logo"), async (req, res) => {
  try {
    const settings = req.body;
    await redis.set("admin:settings", JSON.stringify(settings));
    log("INFO", "ADMIN", "Settings updated", { admin: req.adminUser });
    res.json(formatResponse(true, settings, "Settings updated successfully"));
  } catch (err) {
    log("ERROR", "ADMIN", "Settings update failed", { error: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to update settings"));
  }
});

// ---------------------------------------------------------------------------
// Predictions, odds, leaderboard, analytics
// ---------------------------------------------------------------------------
app.get("/predictions", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, {
    predictions: [
      { match: "Barcelona vs Real Madrid", pred: "Barcelona Win", conf: "87%", odds: 1.85, roi: "+2.1%", users: 2340 },
      { match: "Man United vs Liverpool", pred: "Over 2.5", conf: "86%", odds: 1.78, roi: "+1.8%", users: 1890 },
      { match: "Bayern vs Dortmund", pred: "Bayern Win", conf: "91%", odds: 1.65, roi: "+1.2%", users: 1540 }
    ],
    accuracy: 97.2,
    roi: 18.3,
    totalPredictions: 1234567
  }));
});

app.get("/odds", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, {
    odds: [
      { league: "EPL", match: "Man United vs Liverpool", home: 2.45, draw: 3.20, away: 2.80 },
      { league: "La Liga", match: "Barcelona vs Real Madrid", home: 1.85, draw: 3.50, away: 3.95 },
      { league: "Serie A", match: "Juventus vs AC Milan", home: 2.10, draw: 3.40, away: 3.20 }
    ],
    total: 3,
    updated: new Date().toISOString()
  }));
});

app.get("/leaderboard", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, {
    leaderboard: [
      { rank: 1, name: "ProBetter", points: 15450, winRate: "68%", roi: "+24.5%", streak: 23 },
      { rank: 2, name: "AnalystKing", points: 14320, winRate: "65%", roi: "+22.1%", streak: 18 }
    ],
    yourRank: 247,
    yourPoints: 12340
  }));
});

app.get("/analytics", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { metrics: { dailyActiveUsers: 12340, totalPredictions: 1234567, accuracy: 97.2, roi: 18.3 }, charts: { winRate: 60.9, accuracy: 97.2, roi: 18.3 } }));
});

// ---------------------------------------------------------------------------
// User stats
// ---------------------------------------------------------------------------
app.get("/user/:userId/stats", tierBasedRateLimiter, (req, res) => {
  const userId = req.params.userId;
  const bets = 156, wins = 95, loss = 61;
  res.json(formatResponse(true, { userId, totalBets: bets, wins, losses: loss, winRate: ((wins / bets) * 100).toFixed(1) + "%", roi: "+18.3%", profit: 45600, rank: 247 }));
});

app.get("/user/:userId/rank", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { userId: req.params.userId, globalRank: 247, points: 12340, region: "Top 15%", weekChange: "+45", monthChange: "+120" }));
});

app.get("/user/:userId/referrals", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { userId: req.params.userId, totalReferrals: 14, earnings: 8400, level: "Silver", breakdown: { free: 8, member: 4, vvip: 2 } }));
});

// ---------------------------------------------------------------------------
// Audit and compliance
// ---------------------------------------------------------------------------
app.get("/audit", authenticateAdmin, tierBasedRateLimiter, async (req, res) => {
  try {
    const logs = await redis.lrange(LOG_STREAM_KEY, 0, 50).catch(() => []);
    const parsed = logs.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(0, 20);
    res.json(formatResponse(true, { auditLogs: parsed }));
  } catch (err) {
    log("ERROR", "AUDIT", "Audit fetch failed", { error: err.message });
    res.status(500).json(formatResponse(false, null, "Failed to fetch audit logs"));
  }
});

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
app.get("/pricing", (req, res) => {
  res.json(formatResponse(true, {
    tiers: {
      free: { name: "FREE", price: 0, requests: 30, features: ["Live matches", "Basic predictions"] },
      member: { name: "MEMBER", price: 150, requests: 60, features: ["Advanced analytics", "Priority support", "No ads"] },
      vvip: { name: "VVIP", price: 200, requests: 150, features: ["AI Coach", "Exclusive content", "VIP support 24/7"] }
    }
  }));
});

// ---------------------------------------------------------------------------
// Telegram webhook handling
// - validate token path and optional secret header
// - process updates asynchronously via queueJob
// ---------------------------------------------------------------------------
function validateTelegramWebhook(req, tokenParam) {
  if (!TELEGRAM_TOKEN) {
    log("WARN", "WEBHOOK", "TELEGRAM_TOKEN not configured");
    return false;
  }
  if (typeof tokenParam === "string" && tokenParam.length > 0) {
    if (tokenParam !== TELEGRAM_TOKEN) {
      log("WARN", "WEBHOOK", "Invalid token in path");
      return false;
    }
  }
  if (TELEGRAM_WEBHOOK_SECRET) {
    const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (!headerSecret || headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
      log("WARN", "WEBHOOK", "Missing/invalid X-Telegram-Bot-Api-Secret-Token");
      return false;
    }
  }
  return true;
}

const processTelegramUpdate = async update => {
  try {
    const msg = update?.message || update?.edited_message || update?.channel_post;
    const cbq = update?.callback_query;
    if (msg?.chat?.id && (msg?.text || msg?.caption)) {
      const chatId = msg.chat.id;
      const text = String(msg.text || msg.caption || "").trim();
      const userId = msg?.from?.id || msg?.chat?.id;
      log("INFO", "WEBHOOK", "Telegram update", { chatId, userId, text });
      // Simple command handling
      if (text === "/pricing") {
        await sendTelegram(chatId, generatePricingMessage());
      } else if (text === "/start") {
        await sendTelegram(chatId, `Welcome to ${BETRIX_CONFIG.brand.name}! Use /pricing to view plans.`);
      } else {
        await queueJob("telegram-message", { update, chatId, text, userId });
        await sendTelegram(chatId, "Thanks — your message is being processed.");
      }
      await redis.hincrby(`user:${userId}:stats`, "messages", 1);
      await redis.expire(`user:${userId}:stats`, 86400);
    }
    if (cbq) {
      const chatId = cbq?.message?.chat?.id;
      const userId = cbq?.from?.id;
      const data = cbq?.data || "";
      log("INFO", "WEBHOOK", "Callback query", { chatId, userId, data });
      await queueJob("telegram-callback", { update, chatId, userId, data });
      if (chatId) await sendTelegram(chatId, `Action received: ${data}`);
    }
  } catch (err) {
    log("ERROR", "WEBHOOK", "Process update failed", { error: err.message });
  }
}

app.post("/webhook", tierBasedRateLimiter, async (req, res) => {
  try {
    if (!validateTelegramWebhook(req)) return res.status(403).json(formatResponse(false, null, "Invalid webhook signature"));
    const update = req.body;
    res.status(200).json(formatResponse(true, { processed: true }));
    processTelegramUpdate(update);
  } catch (err) {
    log("ERROR", "WEBHOOK", "Webhook error", { error: err.message });
    res.status(200).json(formatResponse(true, { processed: false, error: err.message }));
  }
});

app.post("/webhook/:token", tierBasedRateLimiter, async (req, res) => {
  try {
    if (!validateTelegramWebhook(req, req.params.token)) return res.status(403).json(formatResponse(false, null, "Invalid webhook signature"));
    const update = req.body;
    res.status(200).json(formatResponse(true, { processed: true }));
    processTelegramUpdate(update);
  } catch (err) {
    log("ERROR", "WEBHOOK", "Token webhook error", { error: err.message });
    res.status(200).json(formatResponse(true, { processed: false, error: err.message }));
  }
});

app.post("/telegram/set-webhook", authenticateAdmin, async (req, res) => {
  try {
    if (!TELEGRAM_TOKEN) return res.status(400).json(formatResponse(false, null, "TELEGRAM_TOKEN not set"));
    const base = TELEGRAM_WEBHOOK_URL || `${req.protocol}://${req.get("host")}`;
    const target = `${base.replace(/\/$/, "")}/webhook/${TELEGRAM_TOKEN}`;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`;
    const body = { url: target, secret_token: TELEGRAM_WEBHOOK_SECRET || undefined, max_connections: 40, allowed_updates: ["message", "edited_message", "channel_post", "callback_query"] };
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await resp.json();
    log(data.ok ? "INFO" : "WARN", "WEBHOOK", "setWebhook", { ok: data.ok, description: data.description });
    res.json(formatResponse(data.ok, data, data.ok ? "Webhook set" : data.description || "Failed"));
  } catch (err) {
    log("ERROR", "WEBHOOK", "setWebhook error", { error: err.message });
    res.status(500).json(formatResponse(false, null, err.message));
  }
});

app.get("/telegram/webhook-info", authenticateAdmin, async (req, res) => {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo`;
    const resp = await fetch(url);
    const info = await resp.json();
    res.json(formatResponse(true, info, "Webhook info"));
  } catch (err) {
    log("ERROR", "WEBHOOK", "getWebhookInfo error", { error: err.message });
    res.status(500).json(formatResponse(false, null, err.message));
  }
});

// ---------------------------------------------------------------------------
// PayPal success/cancel pages and webhook queueing
// ---------------------------------------------------------------------------
app.get("/paypal/success", async (req, res) => {
  const { token, PayerID } = req.query;
  try {
    const pending = await redis.get(`payment:pending:${token}`);
    if (!pending) {
      return res.send(`<html><head><title>Payment Error</title><style>${getBrandStyles()}</style></head><body><div class="container"><div class="brand-header"><h1>${BETRIX_CONFIG.brand.name}</h1></div><div class="payment-status error"><h2>Payment session expired</h2><p>Please try again.</p><a href="/dashboard" class="btn btn-primary">Dashboard</a></div></div></body></html>`);
    }
    await queueJob("paypal-success", { token, PayerID, pending });
    res.send(`<html><head><title>Payment Successful</title><style>${getBrandStyles()}</style></head><body><div class="container"><div class="brand-header"><h1>🎉 ${BETRIX_CONFIG.brand.name}</h1></div><div class="payment-status success"><h2>Payment Successful</h2><p>Your subscription is being activated.</p><a href="/dashboard" class="btn btn-primary">Go to Dashboard</a></div></div></body></html>`);
  } catch (err) {
    log("ERROR", "PAYPAL", "Success handler error", { error: err.message });
    res.status(500).send("Error processing payment");
  }
});

app.get("/paypal/cancel", (req, res) => {
  res.send(`<html><head><title>Payment Cancelled</title><style>${getBrandStyles()}</style></head><body><div class="container"><div class="brand-header"><h1>${BETRIX_CONFIG.brand.name}</h1></div><div class="payment-status cancelled"><h2>Payment Cancelled</h2><p>Your payment was not completed.</p><a href="/dashboard" class="btn btn-secondary">Dashboard</a></div></div></body></html>`);
});

app.post("/paypal/webhook", tierBasedRateLimiter, async (req, res) => {
  try {
    await queueJob("paypal-webhook", { event: req.body });
    broadcastToAdmins({ type: "payment-webhook", data: { eventType: req.body?.event_type, timestamp: new Date().toISOString() } });
    res.json(formatResponse(true, { status: "queued" }));
  } catch (err) {
    log("ERROR", "PAYPAL", "Webhook error", { error: err.message });
    res.status(500).json(formatResponse(false, null, err.message));
  }
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
app.get("/metrics", tierBasedRateLimiter, (req, res) => {
  res.json(formatResponse(true, { uptime: process.uptime(), version: BETRIX_CONFIG.brand.version, redis: true, wsConnections: activeConnections.size, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// Error handling and 404
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  log("ERROR", "HANDLER", err.message, { stack: err.stack });
  res.status(500).json(formatResponse(false, null, err.message || "Internal server error"));
});

app.use((req, res) => {
  log("WARN", "ROUTES", "Not found", { path: req.path, method: req.method });
  res.status(404).json(formatResponse(false, null, "Endpoint not found"));
});

// ---------------------------------------------------------------------------
// Initialization and graceful shutdown
// ---------------------------------------------------------------------------
async function initializeServer() {
  try {
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await redis.set("admin:password", adminHash);

    await redis.mset("stats:totalUsers", "0", "stats:activePredictions", "0", "stats:totalRevenue", "0", "stats:lastUpdated", new Date().toISOString());

    log("INFO", "INIT", "Server initialization completed", { brand: BETRIX_CONFIG.brand.name, version: BETRIX_CONFIG.brand.version, environment: NODE_ENV });
    log("INFO", "INIT", "Admin credentials configured", { username: ADMIN_USERNAME });

    if (TELEGRAM_TOKEN && TELEGRAM_WEBHOOK_URL) {
      try {
        const target = `${TELEGRAM_WEBHOOK_URL.replace(/\/$/, "")}/webhook/${TELEGRAM_TOKEN}`;
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`;
        const body = { url: target, secret_token: TELEGRAM_WEBHOOK_SECRET || undefined, max_connections: 40, allowed_updates: ["message", "edited_message", "channel_post", "callback_query"] };
        const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await resp.json();
        log(data.ok ? "INFO" : "WARN", "INIT", "Auto setWebhook", { ok: data.ok, description: data.description });
      } catch (err) {
        log("WARN", "INIT", "Auto setWebhook failed", { error: err.message });
      }
    }
  } catch (err) {
    log("ERROR", "INIT", "Initialization failed", { error: err.message });
    process.exit(1);
  }
}

let shuttingDown = false;
async function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("INFO", "SHUTDOWN", "Graceful shutdown initiated");
  try {
    activeConnections.forEach(ws => { try { ws.close(1001, "Server shutdown"); } catch {} });
    try { await redis.quit(); } catch {}
    server.close(() => {
      log("INFO", "SHUTDOWN", "HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      log("WARN", "SHUTDOWN", "Forcing shutdown");
      process.exit(1);
    }, 10000);
  } catch (err) {
    log("ERROR", "SHUTDOWN", "Shutdown error", { error: err.message });
    process.exit(1);
  }
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
initializeServer().then(() => {
  server.listen(port, "0.0.0.0", () => {
    log("INFO", "SERVER", `🚀 ${BETRIX_CONFIG.brand.name} Server started`, {
      port,
      environment: NODE_ENV,
      version: BETRIX_CONFIG.brand.version,
      endpoints: { main: `http://0.0.0.0:${port}`, api: `http://0.0.0.0:${port}/api/v1`, admin: `http://0.0.0.0:${port}/admin`, health: `http://0.0.0.0:${port}/health`, metrics: `http://0.0.0.0:${port}/metrics`, telegram_webhook: TELEGRAM_TOKEN ? `/webhook/${TELEGRAM_TOKEN}` : null }
    });
  });
}).catch(err => {
  log("ERROR", "SERVER", "Failed to start", { error: err.message });
  process.exit(1);
});

export default app;
