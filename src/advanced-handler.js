/**
 * Advanced Command Handlers with Intelligence
 * Leverages all advanced services for world-class responses
 */

import { Logger } from "./utils/logger.js";
import { ICONS } from "./utils/formatters.js";
import { PredictionEngine } from "./services/predictor.js";
import { AnalyticsService } from "./services/analytics.js";
import { AlertsService } from "./services/alerts.js";
import { ContextManager } from "./middleware/context-manager.js";
import { RateLimiter } from "./middleware/rate-limiter.js";

const logger = new Logger("AdvancedHandler");

class AdvancedHandler {
  constructor(handlers, redis, telegram, userService, gemini) {
    this.handlers = handlers;
    this.redis = redis;
    this.telegram = telegram;
    this.userService = userService;
    this.gemini = gemini;

    this.predictor = new PredictionEngine(redis, handlers.apiFootball, gemini);
    this.analytics = new AnalyticsService(redis);
    this.alerts = new AlertsService(redis, telegram);
    this.context = new ContextManager(redis);
    this.rateLimiter = new RateLimiter(redis);
  }

  /**
   * Intelligent /stats command
   * Show personalized analytics
   */
  async handleStats(chatId, userId) {
    try {
      const user = await this.userService.getUser(userId);
      const userStats = await this.analytics.getUserStats(userId);
      const topCommands = await this.analytics.getTopCommands(3);

      const text =
        `${ICONS.analysis} <b>Your Analytics</b>\n\n` +
        `👤 Profile: ${user?.name || "User"}\n` +
        `🎯 Predictions: ${userStats.totalPredictions}\n` +
        `📊 Accuracy: ${(await this.predictor.getPredictionAccuracy(userId))}%\n` +
        `⏰ Member since: ${new Date(user?.createdAt || Date.now()).toLocaleDateString()}\n` +
        `🏆 Points: ${user?.rewards_points || 0}\n\n` +
        `<b>Top Commands:</b>\n` +
        topCommands.map((c, i) => `${i + 1}. ${c.command} (${c.count}x)`).join("\n");

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Stats error", err);
      return this.telegram.sendMessage(chatId, "Unable to load stats. Try again later.");
    }
  }

  /**
   * Advanced /predict command with confidence
   */
  async handlePredictAdvanced(chatId, userId, matchQuery) {
    if (!matchQuery) {
      return this.telegram.sendMessage(
        chatId,
        `${ICONS.analysis} Usage: /predict [home] vs [away]\n\nExample: /predict Liverpool vs Man City`
      );
    }

    try {
      const [home, away] = matchQuery.split(/\s+vs\s+/i);
      if (!home || !away) {
        return this.telegram.sendMessage(
          chatId,
          `Format: /predict Home vs Away\n\nExample: /predict Liverpool vs Man City`
        );
      }

      const prediction = await this.predictor.predictMatch(home.trim(), away.trim());
      const confidence = Math.round(prediction.confidence * 100);

      const text =
        `${ICONS.analysis} <b>Match Prediction</b>\n\n` +
        `${home.trim()} vs ${away.trim()}\n\n` +
        `${prediction.prediction}\n\n` +
        `📊 Confidence: ${confidence}%\n` +
        `${confidence >= 75 ? "✅ High confidence" : confidence >= 60 ? "⚠️ Medium confidence" : "⚠️ Low confidence"}`;

      await this.analytics.trackPrediction(userId, `${home}-${away}`, prediction.prediction, prediction.confidence);
      await this.context.recordMessage(userId, `Predicted: ${matchQuery}`, "system");

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Predict error", err);
      return this.telegram.sendMessage(chatId, "Prediction service unavailable. Try /live instead.");
    }
  }

  /**
   * Smart /insights command
   * Personalized recommendations
   */
  async handleInsights(chatId, userId) {
    try {
      const prefs = await this.context.getPreferences(userId);
      const recommendation = await this.predictor.recommendMatch(userId);

      const aiInsight = await this.gemini.chat(
        `Generate 3 brief, actionable betting insights for a user interested in ${prefs.favoriteLeagues.join(", ") || "football"}. Keep under 200 chars total.`,
        {}
      );

      const text =
        `💡 <b>Personalized Insights</b>\n\n` +
        `Your interests: ${prefs.favoriteLeagues.length ? prefs.favoriteLeagues.join(", ") : "all leagues"}\n\n` +
        `${aiInsight}\n\n` +
        `${recommendation.recommendation}\n\n` +
        `Tip: Set preferences with /settings to get better recommendations.`;

      await this.context.recordMessage(userId, "Viewed insights", "system");

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Insights error", err);
      return this.telegram.sendMessage(chatId, "Insights unavailable. Try /tips for general advice.");
    }
  }

  /**
   * Watch match with alerts
   */
  async watchMatch(chatId, userId, fixtureId) {
    try {
      const subscribed = await this.alerts.subscribeToMatch(userId, fixtureId, {});

      if (subscribed) {
        return this.telegram.sendMessage(
          chatId,
          `🔔 Watching this match! You'll get alerts for goals and important moments.\n\nType /unwatch ${fixtureId} to unsubscribe.`
        );
      }
    } catch (err) {
      logger.error("Watch error", err);
    }
  }

  /**
   * Advanced /compete command
   * User predictions leaderboard
   */
  async handleCompete(chatId, userId) {
    try {
      const accuracy = await this.predictor.getPredictionAccuracy(userId);
      const topPredictors = await this.redis.zrevrange("user:accuracy", 0, 4, "WITHSCORES");

        let text =
        `🏆 <b>Prediction Leaderboard</b>\n\n` +
        `Your accuracy: ${accuracy}%\n\n` +
        `<b>Top Predictors:</b>\n`;

      for (let i = 0; i < topPredictors.length; i += 2) {
        const userIdTop = topPredictors[i];
        const score = topPredictors[i + 1];
        const userTop = await this.userService.getUser(userIdTop);
        text += `${i / 2 + 1}. ${userTop?.name || "User"} - ${score}%\n`;
      }

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Compete error", err);
      return this.telegram.sendMessage(chatId, "Leaderboard unavailable. Try /stats.");
    }
  }

  /**
   * Rate limiting check wrapper
   */
  async checkRateLimit(chatId, userId, tier = "default") {
    if (await this.rateLimiter.isRateLimited(userId, tier)) {
      const remaining = await this.rateLimiter.getRemainingRequests(userId, tier);
      await this.telegram.sendMessage(
        chatId,
        `⏱️ Rate limited. You have ${remaining} requests left this minute.`
      );
      return false;
    }
    return true;
  }
}

export { AdvancedHandler };
