/**
 * Subscription Gatekeeper
 * Controls feature access based on user tier
 */

import { UIBuilder, EMOJIS } from "../utils/ui-builder.js";

class SubscriptionGatekeeper {
  constructor(userService, telegram) {
    this.userService = userService;
    this.telegram = telegram;
  }

  /**
   * Get user tier with fallback
   */
  async getUserTier(userId) {
    try {
      const user = await this.userService.getUser(userId);
      if (!user?.signupComplete) return "free";
      if (this.userService.isVVIP(user)) return "vvip";
      if (this.userService.isPaid(user)) return "member";
      return "free";
    } catch {
      return "free";
    }
  }

  /**
   * Check if user can access feature
   */
  async canAccess(userId, feature) {
    const tier = await this.getUserTier(userId);
    const requirements = {
      // Free features
      live: "free",
      standings: "free",
      odds: "free",
      tips: "free",
      help: "free",
      pricing: "free",
      refer: "free",
      
      // Member features
      analysis: "member",
      predictions: "member",
      stats: "member",
      insights: "member",
      compete: "member",
      watch: "member",
      
      // VVIP features
      dossier: "vvip",
      coach: "vvip",
      trends: "vvip",
      premium: "vvip",
      alerts: "vvip",
      live_commentary: "vvip",
      advanced_metrics: "vvip",
    };

    const required = requirements[feature] || "free";
    const tierLevels = { free: 0, member: 1, vvip: 2 };
    return tierLevels[tier] >= tierLevels[required];
  }

  /**
   * Enforce access or show upsell
   */
  async enforceAccess(chatId, userId, feature) {
    const hasAccess = await this.canAccess(userId, feature);

    if (!hasAccess) {
      const tier = await this.getUserTier(userId);
      const requirement = this.getFeatureRequirement(feature);

      let message = `${EMOJIS.locked} <b>Premium Feature</b>\n\n`;
      message += `This feature requires ${requirement} membership.\n\n`;

      if (tier === "free") {
        message += `💡 <b>Available Plans:</b>\n`;
        message += `👤 Member: KES 150 / USD 1\n`;
        message += `💎 VVIP: KES 200/day • KES 800/week • KES 2,500/month`;
      } else if (tier === "member") {
        message += `💡 Upgrade to VVIP for premium analysis and live alerts`;
      }

      const kb = UIBuilder.buildSubscriptionMenu();
      await this.telegram.sendMessage(chatId, message, { reply_markup: kb });
      return false;
    }

    return true;
  }

  /**
   * Get feature requirement
   */
  getFeatureRequirement(feature) {
    const map = {
      analysis: "Member",
      predictions: "Member",
      dossier: "VVIP",
      coach: "VVIP",
      premium: "VVIP",
    };
    return map[feature] || "Member";
  }

  /**
   * Decorate response based on tier
   */
  async decorateResponse(chatId, userId, feature, baseResponse) {
    const tier = await this.getUserTier(userId);
    let response = baseResponse;

    // Add tier indicator
    if (tier === "vvip") {
      response += `\n\n💎 <i>Premium content • VVIP exclusive</i>`;
    } else if (tier === "member" && ["analysis", "predictions"].includes(feature)) {
      response += `\n\n👤 <i>Member content</i>`;
    }

    // Add upsell for free users
    if (tier === "free" && feature !== "live" && feature !== "standings" && feature !== "odds") {
      response += `\n\n💡 <i>Upgrade to unlock full analysis</i>`;
    }

    return response;
  }

  /**
   * Check rate limits by tier
   */
  async checkRateLimit(userId, action) {
    void action;
    const tier = await this.getUserTier(userId);
    const limits = {
      free: 30,     // 30 requests per minute
      member: 100,  // 100 requests per minute
      vvip: 500,    // 500 requests per minute
    };

    return limits[tier] || 30;
  }

  /**
   * Get feature description by tier
   */
  getFeatureDescription(feature, tier) {
    const descriptions = {
      analysis: {
        free: "🔒 Match analysis available for members",
        member: "Match analysis with key statistics",
        vvip: "🔥 Advanced match analysis with tactical breakdown",
      },
      predictions: {
        free: "🔒 Predictions available for members",
        member: "AI predictions with confidence scoring",
        vvip: "🔥 Elite predictions with expected value analysis",
      },
      dossier: {
        free: "🔒 Professional dossier for VVIP",
        member: "🔒 Professional dossier for VVIP",
        vvip: "📋 500+ word professional match analysis",
      },
      coach: {
        free: "🔒 Coaching available for VVIP",
        member: "🔒 Coaching available for VVIP",
        vvip: "🏆 Personal betting strategy coaching",
      },
    };

    return (descriptions[feature]?.[tier] || "Feature unavailable").trim();
  }

  /**
   * Log feature access for analytics
   */
  async logAccess(userId, feature, allowed) {
    try {
      const tier = await this.getUserTier(userId);
      const key = `access:${feature}:${tier}`;
      const field = allowed ? "allowed" : "blocked";
      await this.redis?.hincrby(key, field, 1);
    } catch (e) { void e; }
  }
}

export { SubscriptionGatekeeper };
