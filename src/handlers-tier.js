/**
 * Tier-Aware Handlers
 * Subscription-aware command responses with gating
 */

import { UIBuilder, EMOJIS } from "./utils/ui-builder.js";

class TierAwareHandlers {
  constructor(handlers, gatekeeper, userService) {
    this.handlers = handlers;
    this.gatekeeper = gatekeeper;
    this.userService = userService;
  }

  /**
   * Tier-aware /live command
   */
  async liveWithTier(chatId, userId) {
    const tier = await this.gatekeeper.getUserTier(userId);
    void tier;
    return this.handlers.live(chatId, userId);
  }

  /**
   * Tier-aware /odds command
   */
  async oddsWithTier(chatId, userId, fixtureId) {
    const tier = await this.gatekeeper.getUserTier(userId);

    if (!fixtureId) {
      return this.handlers.telegram.sendMessage(
        chatId,
        `${EMOJIS.odds} <b>Betting Odds</b>\n\nUsage: /odds [fixture-id]`
      );
    }

    try {
      const data = await this.handlers.apiFootball.getOdds(fixtureId);
      const text = UIBuilder.formatOdds(data.response?.[0], tier);
      return this.handlers.telegram.sendMessage(chatId, text);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Unable to fetch odds");
    }
  }

  /**
   * Tier-aware /analysis command
   */
  async analysisWithTier(chatId, userId, matchQuery) {
    if (!(await this.gatekeeper.enforceAccess(chatId, userId, "analysis"))) {
      return;
    }

    const tier = await this.gatekeeper.getUserTier(userId);
    void tier;

    if (!matchQuery) {
      return this.handlers.telegram.sendMessage(
        chatId,
        `${EMOJIS.analyze} Match Analysis\n\nUsage: /analyze [home] vs [away]`
      );
    }

    try {
      let analysis = await this.handlers.gemini.chat(
        `Analyze ${matchQuery} with form, odds, and key factors.`,
        {}
      );

      analysis = await this.gatekeeper.decorateResponse(chatId, userId, "analysis", analysis);
      return this.handlers.telegram.sendMessage(chatId, analysis);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Analysis unavailable");
    }
  }

  /**
   * Tier-aware /predictions command
   */
  async predictionsWithTier(chatId, userId, matchQuery) {
    if (!(await this.gatekeeper.enforceAccess(chatId, userId, "predictions"))) {
      return;
    }

    const tier = await this.gatekeeper.getUserTier(userId);

    if (!matchQuery) {
      return this.handlers.telegram.sendMessage(
        chatId,
        `${EMOJIS.predict} Predictions\n\nUsage: /predict [home] vs [away]`
      );
    }

    try {
      const prediction = await this.handlers.predictor?.predictMatch(
        matchQuery.split(" vs ")[0],
        matchQuery.split(" vs ")[1]
      );

      let text = UIBuilder.formatPrediction(prediction, tier);
      return this.handlers.telegram.sendMessage(chatId, text);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Predictions unavailable");
    }
  }

  /**
   * Tier-aware /dossier command
   */
  async dossierWithTier(chatId, userId, matchQuery) {
    if (!(await this.gatekeeper.enforceAccess(chatId, userId, "dossier"))) {
      return;
    }

    if (!matchQuery) {
      return this.handlers.telegram.sendMessage(
        chatId,
        `📋 Match Dossier\n\nUsage: /dossier [home] vs [away]`
      );
    }

    try {
      const dossier = await this.handlers.premium?.generateMatchDossier(matchQuery);
      const header = UIBuilder.formatDossierHeader({ teams: { home: { name: matchQuery } } }, "vvip");
      return this.handlers.telegram.sendMessage(chatId, `${header}\n${dossier}`);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Dossier unavailable");
    }
  }

  /**
   * Tier-aware /coach command
   */
  async coachWithTier(chatId, userId) {
    if (!(await this.gatekeeper.enforceAccess(chatId, userId, "coach"))) {
      return;
    }

    try {
      const stats = await this.handlers.analytics?.getUserStats(userId);
      const advice = await this.handlers.premium?.getCoachAdvice(stats);
      return this.handlers.telegram.sendMessage(chatId, `🏆 <b>Betting Coach</b>\n\n${advice}`);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Coaching unavailable");
    }
  }

  /**
   * Tier-aware /trends command
   */
  async trendsWithTier(chatId, userId, league = "premier league") {
    if (!(await this.gatekeeper.enforceAccess(chatId, userId, "trends"))) {
      return;
    }

    try {
      const trends = await this.handlers.premium?.analyzeSeasonalTrends(league);
      return this.handlers.telegram.sendMessage(chatId, `📊 <b>Seasonal Trends: ${league}</b>\n\n${trends}`);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Trends unavailable");
    }
  }

  /**
   * Show features by tier
   */
  async showFeatures(chatId, userId) {
    const tier = await this.gatekeeper.getUserTier(userId);
    const text = UIBuilder.buildFeaturesList(tier);
    return this.handlers.telegram.sendMessage(chatId, text);
  }

  /**
   * Show tier menu
   */
  async showTierMenu(chatId, userId) {
    const tier = await this.gatekeeper.getUserTier(userId);
    const user = await this.userService.getUser(userId);

    let text = `${EMOJIS.premium} <b>Your Account</b>\n\n`;
    text += `📊 Tier: ${tier === "vvip" ? "💎 VVIP" : tier === "member" ? "👤 Member" : "🎁 Free"}\n`;
    text += `👤 Name: ${user?.name || "—"}\n`;
    text += `🌍 Country: ${user?.country || "—"}\n`;

    if (tier === "vvip" && user?.vvip_expires_at) {
      text += `⏰ Expires: ${new Date(user.vvip_expires_at).toLocaleDateString()}\n`;
    }

    text += `\n<b>Available Features:</b>\n`;
    text += UIBuilder.buildFeaturesList(tier).split("<b>Feature Access</b>\n\n")[1];

    const kb = {
      inline_keyboard: [
        [{ text: "💳 Upgrade Plan", callback_data: "show:subscription" }],
        [{ text: "📋 Features", callback_data: "show:features" }],
        [{ text: `${EMOJIS.back} Back`, callback_data: "menu:main" }],
      ],
    };

    return this.handlers.telegram.sendMessage(chatId, text, { reply_markup: kb });
  }

  /**
   * Tier-aware standings
   */
  async standingsWithTier(chatId, userId, league = "39") {
    const tier = await this.gatekeeper.getUserTier(userId);

    try {
      const data = await this.handlers.apiFootball?.getStandings(league, new Date().getFullYear());
      const standings = data.response?.[0]?.league?.standings?.[0] || [];
      const text = UIBuilder.formatStandings(standings, tier);
      return this.handlers.telegram.sendMessage(chatId, text);
    } catch (err) {
      return this.handlers.telegram.sendMessage(chatId, "Standings unavailable");
    }
  }
}

export { TierAwareHandlers };
