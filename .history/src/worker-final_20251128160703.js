#!/usr/bin/env node

/**
 * BETRIX Final Production Worker
 * Complete integration of all services and intelligence
 */

import Redis from "ioredis";
import { CONFIG, validateConfig } from "./config.js";
import { Logger } from "./utils/logger.js";
import { TelegramService } from "./services/telegram.js";
import { UserService } from "./services/user.js";
import { APIFootballService } from "./services/api-football.js";
import { GeminiService } from "./services/gemini.js";
import { LocalAIService } from "./services/local-ai.js";
import { HuggingFaceService } from "./services/huggingface.js";
import { AzureAIService } from "./services/azure-ai.js";
import { FreeSportsService } from "./services/free-sports.js";
import ClaudeService from "./services/claude.js";
import { BotHandlers } from "./handlers.js";
import OpenLigaDBService from "./services/openligadb.js";
import RSSAggregator from "./services/rss-aggregator.js";
import FootballDataService from "./services/footballdata.js";
import ScoreBatService from "./services/scorebat-enhanced.js";
import Scrapers from "./services/scrapers.js";
import SportsAggregator from "./services/sports-aggregator.js";
import OddsAnalyzer from "./services/odds-analyzer.js";
import { MultiSportAnalyzer } from "./services/multi-sport-analyzer.js";
import { startPrefetchScheduler } from "./tasks/prefetch-scheduler.js";
import { APIBootstrap } from "./tasks/api-bootstrap.js";
import { StatPalInit } from "./tasks/statpal-init.js";
import CacheService from "./services/cache.js";
import { AdvancedHandler } from "./advanced-handler.js";
import { PremiumService } from "./services/premium.js";
import { AdminDashboard } from "./admin/dashboard.js";
import { AnalyticsService } from "./services/analytics.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { ContextManager } from "./middleware/context-manager.js";
import v2Handler from "./handlers/telegram-handler-v2.js";
import SportMonksAPI from "./services/sportmonks-api.js";
import SportsDataAPI from "./services/sportsdata-api.js";

// ===== PREMIUM ENHANCEMENT MODULES =====
import premiumUI from "./utils/premium-ui-builder.js";
import advancedAnalysis from "./utils/advanced-match-analysis.js";
import fixturesManager from "./utils/fixtures-manager.js";
import intelligentMenus from "./utils/intelligent-menu-builder.js";
import brandingUtils from "./utils/betrix-branding.js";
import perfUtils from "./utils/performance-optimizer.js";

const logger = new Logger("FinalWorker");

try {
  validateConfig();
  logger.info("✅ Configuration validated (API_FOOTBALL_KEY or API_SPORTS_KEY required)");
} catch (err) {
  logger.error("Configuration failed", err);
  process.exit(1);
}

// If REDIS_URL is not provided in env, allow using an explicit fallback (use with caution)
if (!process.env.REDIS_URL && typeof process !== 'undefined') {
  // No-op: leave to env. You can set REDIS_URL externally to avoid embedding secrets in code.
}

const redis = new Redis(CONFIG.REDIS_URL);
redis.on("error", err => logger.error("Redis error", err));
redis.on("connect", () => logger.info("✅ Redis connected"));

// small sleep helper used in the main loop
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Worker heartbeat: update a small Redis key periodically so the web process can check worker health
setInterval(async () => {
  try {
    await redis.set("worker:heartbeat", Date.now());
    await redis.expire("worker:heartbeat", 30); // keep for 30s
  } catch (err) {
    logger.error("Heartbeat write failed", err);
  }
}, 10 * 1000);

// Initialize all services
const telegram = new TelegramService(CONFIG.TELEGRAM_TOKEN, CONFIG.TELEGRAM.SAFE_CHUNK);
const userService = new UserService(redis);
const apiFootball = new APIFootballService(redis);
const gemini = new GeminiService(CONFIG.GEMINI.API_KEY);
const hfModels = process.env.HUGGINGFACE_MODELS || process.env.HUGGINGFACE_MODEL || null;
const huggingface = new HuggingFaceService(hfModels, process.env.HUGGINGFACE_TOKEN);
const localAI = new LocalAIService();
const azure = new AzureAIService(
  process.env.AZURE_AI_ENDPOINT || process.env.AZURE_ENDPOINT || (CONFIG.AZURE && CONFIG.AZURE.ENDPOINT),
  process.env.AZURE_AI_KEY || process.env.AZURE_KEY || (CONFIG.AZURE && CONFIG.AZURE.KEY),
  process.env.AZURE_AI_DEPLOYMENT || process.env.AZURE_DEPLOYMENT || (CONFIG.AZURE && CONFIG.AZURE.DEPLOYMENT),
  process.env.AZURE_API_VERSION || (CONFIG.AZURE && CONFIG.AZURE.API_VERSION) || '2023-05-15'
);
const freeSports = new FreeSportsService(redis);
const cache = new CacheService(redis);
const openLiga = new OpenLigaDBService(undefined, cache, { ttlSeconds: 30 });
const rssAggregator = new RSSAggregator(cache, { ttlSeconds: 60 });
const footballDataService = new FootballDataService();
const scorebatService = new ScoreBatService(process.env.SCOREBAT_TOKEN || null, cache, { retries: Number(process.env.SCOREBAT_RETRIES || 3), cacheTtlSeconds: Number(process.env.SCOREBAT_CACHE_TTL || 60) });
const scrapers = new Scrapers(redis);
const sportsAggregator = new SportsAggregator(redis, { scorebat: scorebatService, rss: rssAggregator, openLiga });
const oddsAnalyzer = new OddsAnalyzer(redis, sportsAggregator, null);
const multiSportAnalyzer = new MultiSportAnalyzer(redis, sportsAggregator, null);
const sportMonksAPI = new SportMonksAPI();
const sportsDataAPI = new SportsDataAPI();

// Claude (Anthropic) - prefer if enabled in config
const claude = new ClaudeService(CONFIG.CLAUDE.API_KEY, CONFIG.CLAUDE.MODEL, CONFIG.CLAUDE.TIMEOUT_MS);

// Composite AI wrapper: try Gemini per-request, fall back to LocalAI on errors.
const ai = {
  name: "composite-ai",
  async chat(message, context) {
    // Prefer Claude when enabled
    if (CONFIG.CLAUDE && CONFIG.CLAUDE.ENABLED && claude && claude.enabled) {
      try {
        await redis.set("ai:active", "claude");
        await redis.expire("ai:active", 30);
        const out = await claude.chat(message, context);
        const len = String(out || "").length;
        if (len === 0) {
          logger.warn("Claude returned empty response, falling back to next provider");
        } else {
          logger.info("AI response", { provider: "claude", model: CONFIG.CLAUDE.MODEL, length: len });
          return out;
        }
      } catch (err) {
        logger.warn("Claude.chat failed, falling back", err?.message || String(err));
      }
    }

    // Try Gemini first
    if (gemini && gemini.enabled) {
      try {
        await redis.set("ai:active", "gemini");
        await redis.expire("ai:active", 30);
        const out = await gemini.chat(message, context);
        const len = String(out || "").length;
        if (len === 0) {
          logger.warn("Gemini returned empty response, falling back to next provider");
        } else {
          logger.info("AI response", { provider: "gemini", length: len });
          return out;
        }
      } catch (err) {
        logger.warn("Gemini.chat failed for message, falling back", err?.message || String(err));
      }
    }

    // Try Azure if configured
    if (azure && azure.isHealthy()) {
      try {
        await redis.set("ai:active", "azure");
        await redis.expire("ai:active", 30);
        const out = await azure.chat(message, context);
        logger.info("AI response", { provider: "azure", model: azure.lastUsed || null, length: String(out || "").length });
        return out;
      } catch (err) {
        logger.warn("Azure.chat failed, falling back to next provider", err?.message || String(err));
      }
    }

    // Try HuggingFace if configured
    if (huggingface && huggingface.isHealthy()) {
      try {
        await redis.set("ai:active", "huggingface");
        await redis.expire("ai:active", 30);
        const out = await huggingface.chat(message, context);
        logger.info("AI response", { provider: "huggingface", model: huggingface.lastUsed || null, length: String(out || "").length });
        return out;
      } catch (err) {
        logger.warn("HuggingFace.chat failed, falling back to LocalAI", err?.message || String(err));
      }
    }

    // Fallback to LocalAI
    try {
      await redis.set("ai:active", "local");
      await redis.expire("ai:active", 30);
      const out = await localAI.chat(message, context);
      logger.info("AI response", { provider: "local", length: String(out || "").length });
      return out;
    } catch (err) {
      logger.error("LocalAI fallback also failed", { err: err?.message || String(err) });
      if (gemini && typeof gemini.fallbackResponse === 'function') return gemini.fallbackResponse(message, context);
      return "I'm having trouble right now. Try again later.";
    }
  },
  async analyzeSport(sport, matchData, question) {
    if (gemini && gemini.enabled) {
      try {
        if (typeof gemini.analyzeSport === 'function') return await gemini.analyzeSport(sport, matchData, question);
      } catch (err) {
        logger.warn('Gemini.analyzeSport failed, falling back', err?.message || String(err));
      }
    }

    if (huggingface && huggingface.isHealthy()) {
      try {
        return await huggingface.analyzeSport(sport, matchData, question);
      } catch (err) {
        logger.warn('HuggingFace.analyzeSport failed, falling back', err?.message || String(err));
      }
    }

    return localAI.analyzeSport(sport, matchData, question);
  },
  isHealthy() {
    return (gemini && gemini.enabled) || (huggingface && huggingface.isHealthy()) || localAI.isHealthy();
  }
};
const analytics = new AnalyticsService(redis);
const rateLimiter = new RateLimiter(redis);
const contextManager = new ContextManager(redis);
const basicHandlers = new BotHandlers(telegram, userService, apiFootball, ai, redis, freeSports, {
  openLiga,
  rss: rssAggregator,
  scorebat: scorebatService,
  footballData: footballDataService,
  scrapers,
});

// ===== API BOOTSTRAP: Validate keys and immediately prefetch data =====
let apiBootstrapSuccess = false;
try {
  const apiBootstrap = new APIBootstrap(sportsAggregator, oddsAnalyzer, redis);
  const bootstrapResult = await apiBootstrap.initialize();
  apiBootstrapSuccess = bootstrapResult.success;
  
  if (bootstrapResult.success) {
    logger.info('✅ API Bootstrap successful', bootstrapResult.data);
    // Start continuous prefetch after initial success
    apiBootstrap.startContinuousPrefetch(Number(process.env.PREFETCH_INTERVAL_SECONDS || 60));
  } else {
    logger.warn('⚠️  API Bootstrap warning', bootstrapResult);
  }
} catch (e) {
  logger.warn('API Bootstrap initialization failed', e?.message || String(e));
}

// Start prefetch scheduler (runs in-worker). Interval controlled by PREFETCH_INTERVAL_SECONDS (default 60s).
try {
  startPrefetchScheduler({ redis, openLiga, rss: rssAggregator, scorebat: scorebatService, footballData: footballDataService, intervalSeconds: Number(process.env.PREFETCH_INTERVAL_SECONDS || 60) });
  logger.info('Prefetch scheduler started', { intervalSeconds: Number(process.env.PREFETCH_INTERVAL_SECONDS || 60) });
} catch (e) {
  logger.warn('Prefetch scheduler failed to start', e?.message || String(e));
}

// Subscribe to prefetch events for internal observability and reactive caching
try {
  const sub = new Redis(CONFIG.REDIS_URL);
  sub.subscribe('prefetch:updates', 'prefetch:error').then(() => logger.info('Subscribed to prefetch pub/sub channels')).catch(()=>{});
  sub.on('message', async (channel, message) => {
    let payload = message;
    try { payload = JSON.parse(message); } catch (e) { /* raw */ }
    logger.info('Prefetch event', { channel, payload });
    // Example reactive action: when openligadb updates, optionally warm specific caches
    try {
      if (channel === 'prefetch:updates' && payload && payload.type === 'openligadb') {
        // touch a short key indicating last openligadb update
        await redis.set('prefetch:last:openligadb', Date.now());
        await redis.expire('prefetch:last:openligadb', 300);
      }
    } catch (e) { logger.warn('Failed reactive prefetch action', e?.message || String(e)); }
  });
} catch (e) { logger.warn('Prefetch subscriber failed to start', e?.message || String(e)); }
// Inject Redis into v2 handler for telemetry wiring
if (typeof v2Handler.setTelemetryRedis === 'function') {
  v2Handler.setTelemetryRedis(redis);
  logger.info('✅ Telemetry Redis injected into v2Handler');
}

// ===== INITIALIZE PERFORMANCE OPTIMIZER =====
// perfUtils is a class (default export). Create an instance to access methods.
const perfInstance = new perfUtils(redis);
const perfOptimizer = {
  instance: perfInstance,
  prefetcher: perfInstance.prefetchData.bind(perfInstance),
  rateLimiterFactory: perfInstance.createRateLimiter.bind(perfInstance),
  getMetrics: perfInstance.getMetrics.bind(perfInstance)
};
logger.info('✅ Performance Optimizer instance created (PerformanceOptimizer)');

// Wrap sportsAggregator methods with caching
if (sportsAggregator) {
  const originalGetLiveMatches = sportsAggregator.getLiveMatches;
  sportsAggregator.getLiveMatches = async function(leagueId) {
    try {
          const cacheKey = `cache:live_matches:${leagueId || 'all'}`;
          // Use PerformanceOptimizer.smartCache to fetch-or-read cached value
          const result = await perfInstance.smartCache(cacheKey, async () => {
            return await originalGetLiveMatches.call(this, leagueId);
          }, 120);
          return result;
    } catch (e) {
      logger.warn('Cached getLiveMatches failed, falling back', e.message);
      return originalGetLiveMatches.call(this, leagueId);
    }
  };

  const originalGetLeagues = sportsAggregator.getLeagues;
  sportsAggregator.getLeagues = async function(sport) {
    try {
      const cacheKey = `cache:leagues:${sport || 'all'}`;
      const result = await perfInstance.smartCache(cacheKey, async () => {
        return await originalGetLeagues.call(this, sport);
      }, 600);
      return result;
    } catch (e) {
      logger.warn('Cached getLeagues failed, falling back', e.message);
      return originalGetLeagues.call(this, sport);
    }
  };
  
  logger.info('✅ Performance caching enabled on sportsAggregator');
}

// Setup callback telemetry alerts (sends admin message if truncation threshold exceeded)
setInterval(async () => {
  try {
    const truncCount = await redis.get('betrix:telemetry:callback_truncated_outgoing');
    const repOdds = await redis.get('betrix:telemetry:callback_repetition_odds');
    if ((Number(truncCount) || 0) > 10 || (Number(repOdds) || 0) > 5) {
      const adminId = CONFIG.TELEGRAM && CONFIG.TELEGRAM.ADMIN_ID ? Number(CONFIG.TELEGRAM.ADMIN_ID) : null;
      if (adminId && telegram) {
        const msg = `⚠️ *Callback Telemetry Alert*\n\nTruncated outgoing: ${truncCount || 0}\nRepetition (odds): ${repOdds || 0}\n\nCheck samples: betrix:telemetry:callback_truncated_samples`;
        await telegram.sendMessage(adminId, msg, { parse_mode: 'Markdown' }).catch(() => {});
      }
      await redis.set('betrix:telemetry:callback_truncated_outgoing', '0');
      await redis.set('betrix:telemetry:callback_repetition_odds', '0');
    }
  } catch (e) {
    logger.warn('Callback telemetry alert check failed', e?.message || String(e));
  }
}, 60 * 1000);

const advancedHandler = new AdvancedHandler(basicHandlers, redis, telegram, userService, ai);
const premiumService = new PremiumService(redis, ai);
const adminDashboard = new AdminDashboard(redis, telegram, analytics);

logger.info("🚀 BETRIX Final Worker - All Services Initialized");

let running = true; // flag used to gracefully stop the main loop on SIGTERM/SIGINT

async function main() {
  logger.info("🌟 BETRIX Worker started - waiting for Telegram updates");

  // On startup, move any items left in processing back to the main queue so they are retried
  try {
    let moved = 0;
    while (true) {
      const item = await redis.rpoplpush("telegram:processing", "telegram:updates");
      if (!item) break;
      moved += 1;
      // avoid busy looping
      if (moved % 100 === 0) await sleep(10);
    }
    if (moved > 0) logger.info(`Requeued ${moved} items from telegram:processing to telegram:updates`);
  } catch (err) {
    logger.warn("Failed to requeue processing list on startup", err?.message || String(err));
  }

  while (running) {
    try {
      // BRPOPLPUSH blocks until an item is available or timeout (5s)
      const raw = await redis.brpoplpush("telegram:updates", "telegram:processing", 5);
      if (!raw) {
        // timeout expired, loop again to check running flag
        continue;
      }

  // mark which AI is active for observability (set before processing)
  const preferred = (gemini && gemini.enabled)
    ? "gemini"
    : (azure && azure.isHealthy())
      ? "azure"
      : ((huggingface && huggingface.isHealthy()) ? "huggingface" : "local");
  await redis.set("ai:active", preferred);
  await redis.expire("ai:active", 30);

      const data = JSON.parse(raw);
      await handleUpdate(data);

      // remove the processed item from processing list
      await redis.lrem("telegram:processing", 1, raw).catch(() => {});
    } catch (err) {
      logger.error("Worker error", err?.message || String(err));
      // small backoff on error
      await sleep(1000);
    }
  }

  logger.info("Main loop exited (running=false)");
}

async function handleUpdate(update) {
  try {
    if (update.message) {
      const { chat, from, text } = update.message;
      const userId = from.id;
      const chatId = chat.id;

      // Check suspension
      if (await adminDashboard.isUserSuspended(userId)) {
        return await telegram.sendMessage(chatId, "⛔ Your account has been suspended.");
      }

      // Track engagement
      await analytics.trackEngagement(userId, "message");
      await contextManager.recordMessage(userId, text, "user");

      // Rate limit check
      const tier = (await userService.getUser(userId))?.role === "vvip" ? "premium" : "default";
      if (!(await advancedHandler.checkRateLimit(chatId, userId, tier))) {
        return;
      }

      // Check signup flow
      const signupState = await redis.get(`signup:${userId}:state`);
      if (signupState) {
        return await handleSignupFlow(chatId, userId, text, signupState);
      }

      // Parse and route
      const { cmd, args } = parseCommand(text);

      if (cmd.startsWith("/")) {
        await handleCommand(chatId, userId, cmd, args, text);
      } else {
        // Natural language - use composite AI (Gemini -> HuggingFace -> LocalAI)
        // Build a compact context object: minimal user info + recent messages
        const fullUser = (await userService.getUser(userId)) || {};
        // Ensure context is trimmed to model prompt budget before fetching recent messages
        try {
          await contextManager.trimContextToTokenBudget(userId, CONFIG.GEMINI.MAX_PROMPT_TOKENS || 1500);
        } catch (e) {
          logger.warn('Context trim failed', e?.message || String(e));
        }
        const recent = await contextManager.getContext(userId).catch(() => []);
        const recentTexts = recent.slice(-6).map(m => `${m.sender}: ${m.message}`);
        const compactContext = {
          id: userId,
          name: fullUser.name || null,
          role: fullUser.role || null,
          favoriteLeagues: fullUser.favoriteLeagues || fullUser.leagues || null,
          preferredLanguage: fullUser.preferredLanguage || fullUser.language || 'en',
          recentMessages: recentTexts,
        };

        const response = await ai.chat(text, compactContext);
        await contextManager.recordMessage(userId, response, "bot");
        await telegram.sendMessage(chatId, response);
      }
    }

    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const callbackId = callbackQuery.id;
      const userId = callbackQuery.from?.id;
      const chatId = callbackQuery.message?.chat?.id;

      // Avoid answering callback queries that are already too old (Telegram rejects if >60s)
      try {
        const cbMsgDate = callbackQuery.message && (callbackQuery.message.date || callbackQuery.message.edit_date) ? Number(callbackQuery.message.date || callbackQuery.message.edit_date) : null;
        const ageSec = cbMsgDate ? (Date.now() / 1000 - cbMsgDate) : 0;
        if (ageSec && ageSec > 55) {
          logger.info('Skipping initial answerCallback: callback appears too old', { ageSec });
        } else {
          await telegram.answerCallback(callbackId, "Processing...");
        }
      } catch (e) {
        // If initial answer fails (rare), continue without blocking the callback handling
        logger.warn('Initial answerCallback failed, continuing dispatch', e && e.message ? e.message : e);
      }

      try {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const res = await v2Handler.handleCallbackQuery(callbackQuery, redis, services);
        if (!res) return;

        // Normalize to array for uniform processing
        const actions = Array.isArray(res) ? res : [res];

        for (const action of actions) {
          try {
            if (!action || typeof action !== 'object') continue;

            const method = (action.method || '').toString();

            // Edit existing message
            if (method === 'editMessageText' || method === 'edit' || action.edit) {
              const messageId = action.message_id || callbackQuery.message?.message_id;
              const text = action.text || '';
              const reply_markup = action.reply_markup || null;
              await telegram.editMessage(chatId, messageId, text, reply_markup);
              logger.info('Dispatched editMessageText', { chatId, messageId });
              continue;
            }

            // Answer callback query (quick popup)
            if (method === 'answerCallback' || method === 'answerCallbackQuery' || action.answer) {
              try {
                await telegram.answerCallback(callbackId, action.text || '', !!action.show_alert);
                logger.info('Dispatched answerCallback', { callbackId });
              } catch (e) {
                const msg = (e && (e.message || String(e))) || '';
                // If Telegram rejects because the query is too old, fallback to sending a message to chat
                if (msg.includes('query is too old') || msg.includes('too old') || msg.includes('Query is too old')) {
                  logger.info('Callback query too old; falling back to sendMessage', { callbackId });
                  const target = action.chat_id || chatId;
                  try { await telegram.sendMessage(target, action.text || '', { parse_mode: action.parse_mode || 'HTML' }); } catch (e2) { logger.warn('Fallback sendMessage failed', e2 && e2.message ? e2.message : e2); }
                } else {
                  throw e;
                }
              }
              continue;
            }

            // Send a new message to chat or specific chat_id
            if (method === 'sendMessage' || action.chat_id || action.text) {
              const target = action.chat_id || chatId;
              const text = action.text || '';
              const opts = { reply_markup: action.reply_markup, parse_mode: action.parse_mode || 'HTML' };
              await telegram.sendMessage(target, text, opts);
              logger.info('Dispatched sendMessage', { target });
              continue;
            }

            // Unknown action: log for debugging
            logger.warn('Unknown callback action returned by v2 handler', { action });
          } catch (errAction) {
            const errMsg = errAction && (errAction.message || String(errAction));
            const benignPatterns = [
              'message is not modified',
              'message to edit not found',
              'message not found',
              'chat not found',
              'message can\'t be edited',
              'message cannot be edited',
              'Bad Request: message to edit not found',
              'Bad Request: message is not modified',
            ];

            const matched = typeof errMsg === 'string' && benignPatterns.some(p => errMsg.includes(p));
            if (matched) {
              const messageId = (action && (action.message_id || callbackQuery.message?.message_id)) || null;
              logger.info('Benign Telegram API response while dispatching callback action', { chatId, messageId, reason: errMsg });
            } else {
              logger.error('Error dispatching callback action', errMsg);
            }
          }
        }
      } catch (err) {
        const errMsg = err && (err.message || String(err));
        const benignPatterns = [
          'message is not modified',
          'message to edit not found',
          'message not found',
          'chat not found',
          'message can\'t be edited',
          'message cannot be edited',
          'Bad Request: message to edit not found',
          'Bad Request: message is not modified',
        ];
        const matched = typeof errMsg === 'string' && benignPatterns.some(p => errMsg.includes(p));
        if (matched) {
          logger.info('Callback handling: benign Telegram API response (non-fatal)', { reason: errMsg });
        } else {
          logger.error('Callback handling failed', err);
        }
      }
    }
  } catch (err) {
    logger.error("Update error", err);
  }
}

function parseCommand(text) {
  const normalized = String(text).trim().toLowerCase();
  const parts = normalized.split(/\s+/);
  const cmd = parts[0].replace(/@[\w_]+$/, "");
  const args = parts.slice(1);
  return { cmd, args };
}

async function handleCommand(chatId, userId, cmd, args, fullText) {
  try {
    const user = await userService.getUser(userId) || {};
    const isAdmin = userId === parseInt(CONFIG.TELEGRAM.ADMIN_ID);
    const isVVIP = userService.isVVIP(user);

    // Track command
    const start = Date.now();

    // Basic commands - most routed to v2Handler for unified branding and flow
    const basicCommands = {
      "/start": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const msg = await v2Handler.handleCommand('/start', chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/menu": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const text = '/menu';
        const msg = await v2Handler.handleCommand(text, chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/help": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const msg = await v2Handler.handleCommand('/help', chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        } else {
          await basicHandlers.help(chatId);
        }
      },
      "/about": () => basicHandlers.about(chatId),
      "/live": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const text = '/live';
        const msg = await v2Handler.handleCommand(text, chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/news": () => basicHandlers.news(chatId),
      "/highlights": () => basicHandlers.highlights(chatId),
      "/standings": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const text = '/standings ' + (args && args.length ? args.join(' ') : '');
        const msg = await v2Handler.handleCommand(text, chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/league": () => basicHandlers.league(chatId, args.join(" ")),
      "/predict": () => basicHandlers.predict(chatId, args.join(" ")),
      "/odds": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const text = '/odds ' + (args && args.length ? args.join(' ') : '');
        const msg = await v2Handler.handleCommand(text, chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/tips": () => basicHandlers.tips(chatId),
      "/pricing": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const msg = await v2Handler.handleCommand('/pricing', chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        } else {
          await basicHandlers.pricing(chatId);
        }
      },
      "/status": () => basicHandlers.status(chatId, userId),
      "/refer": () => basicHandlers.refer(chatId, userId),
      "/leaderboard": () => basicHandlers.leaderboard(chatId),
      "/signup": async () => {
        const services = { openLiga, footballData: footballDataService, rss: rssAggregator, scrapers, sportsAggregator, oddsAnalyzer, multiSportAnalyzer, cache, sportMonks: sportMonksAPI, sportsData: sportsDataAPI };
        const msg = await v2Handler.handleCommand('/signup', chatId, userId, redis, services);
        if (msg && msg.chat_id) {
          await telegram.sendMessage(chatId, msg.text || '', { reply_markup: msg.reply_markup, parse_mode: msg.parse_mode || 'Markdown' });
        }
      },
      "/analyze": () => basicHandlers.analyze(chatId, args.join(" ")),
    };

    // Advanced commands
    const advancedCommands = {
      "/stats": () => advancedHandler.handleStats(chatId, userId),
      "/predict": () => advancedHandler.handlePredictAdvanced(chatId, userId, args.join(" ")),
      "/insights": () => advancedHandler.handleInsights(chatId, userId),
      "/compete": () => advancedHandler.handleCompete(chatId, userId),
    };

    // Premium commands
    const premiumCommands = {
      "/dossier": () => premiumService.generateMatchDossier({ match: args.join(" ") }).then(d => 
        telegram.sendMessage(chatId, `📋 <b>Match Dossier</b>\n\n${d}`)
      ),
      "/coach": async () => {
        const stats = await analytics.getUserStats(userId);
        const advice = await premiumService.getCoachAdvice(stats);
        return telegram.sendMessage(chatId, `🏆 <b>Coaching</b>\n\n${advice}`);
      },
      "/trends": () => premiumService.analyzeSeasonalTrends(args[0] || "premier league").then(t =>
        telegram.sendMessage(chatId, `📊 <b>Seasonal Trends</b>\n\n${t}`)
      ),
      "/premium": () => basicHandlers.pricing(chatId),
    };

    // Admin commands
    const adminCommands = {
      "/admin_health": () => adminDashboard.sendHealthReport(chatId),
      "/admin_broadcast": () => adminDashboard.broadcastMessage(args.join(" ")).then(sent =>
        telegram.sendMessage(chatId, `📢 Broadcast sent to ${sent} users`)
      ),
      "/admin_users": async () => {
        const stats = await adminDashboard.getUserStats();
        return telegram.sendMessage(chatId, 
          `👥 Total: ${stats.total}, Active: ${stats.active}, Paid: ${stats.paid}`
        );
      },
      "/admin_suspend": async () => {
        const result = await adminDashboard.suspendUser(parseInt(args[0]), args.slice(1).join(" "));
        return telegram.sendMessage(chatId, result ? "✅ User suspended" : "❌ Failed");
      },
      "/admin_revenue": async () => {
        const rev = await adminDashboard.getRevenueMetrics();
        return telegram.sendMessage(chatId,
          `💰 Total: $${rev.total}, Today: $${rev.today}, Month: $${rev.month}`
        );
      },
    };

    // Route to handler
    if (basicCommands[cmd]) {
      await basicCommands[cmd]();
    } else if (advancedCommands[cmd] && user?.signupComplete) {
      await advancedCommands[cmd]();
    } else if (premiumCommands[cmd] && isVVIP) {
      await premiumCommands[cmd]();
    } else if (adminCommands[cmd] && isAdmin) {
      await adminCommands[cmd]();
    } else {
      // Unknown - use Gemini
      await basicHandlers.chat(chatId, userId, fullText);
    }

    // Track command
    const duration = Date.now() - start;
    await analytics.trackCommand(cmd, userId, duration);
  } catch (err) {
    logger.error(`Command ${cmd} failed`, err);
    await telegram.sendMessage(chatId, "❌ Error processing command. Try /menu");
  }
}

async function handleCallback(chatId, userId, data) {
  const [action, ...params] = data.split(":");
  try {
    const callbacks = {
      "CMD:live": () => basicHandlers.live(chatId, userId),
      "CMD:standings": () => basicHandlers.standings(chatId),
      "CMD:tips": () => basicHandlers.tips(chatId),
      "CMD:pricing": () => basicHandlers.pricing(chatId),
      "CMD:subscribe": () => basicHandlers.pricing(chatId),
      "CMD:signup": () => basicHandlers.signup(chatId, userId),
    };

    if (callbacks[data]) await callbacks[data]();
  } catch (err) {
    logger.error(`Callback ${data} failed`, err);
  }
}

async function handleSignupFlow(chatId, userId, text, state) {
  try {
    if (state === "name") {
      await userService.saveUser(userId, { name: text });
      await redis.set(`signup:${userId}:state`, "country", "EX", 300);
      return await telegram.sendMessage(chatId, `Nice to meet you, ${text}! 👋\n\nWhich country are you from?`);
    }

    if (state === "country") {
      const user = await userService.saveUser(userId, { country: text });
      await userService.getOrCreateReferralCode(userId);
      await userService.saveUser(userId, { signupComplete: true });
      await redis.del(`signup:${userId}:state`);
      await analytics.trackEngagement(userId, "signup");

      const welcome = `✅ Welcome to BETRIX, ${user.name}!\n\n` +
        `You're all set. Here's what's next:\n\n` +
        `💬 /menu - Explore all features\n` +
        `💵 /pricing - View our plans\n` +
        `👥 /refer - Earn rewards\n\n` +
        `💡 Or just chat with me naturally!`;

      return await telegram.sendMessage(chatId, welcome);
    }
  } catch (err) {
    logger.error("Signup error", err);
    await telegram.sendMessage(chatId, "Signup error. Try /signup again.");
  }
}

// Graceful shutdown
// Graceful shutdown helper used for SIGINT and SIGTERM
let mainPromise = null;
async function shutdown(signal) {
  try {
    logger.info(`${signal} received, shutting down gracefully...`);
    // flip flag to stop accepting new work
    running = false;

    // wait a short while for the main loop to finish current job
    if (mainPromise) {
      await Promise.race([mainPromise, sleep(5000)]);
    }

    logger.info("Closing Redis connection...");
    await redis.quit();
    logger.info("Shutdown complete, exiting");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
  process.exit(1);
});

main().catch(err => {
  logger.error("Fatal", err);
  process.exit(1);
});
