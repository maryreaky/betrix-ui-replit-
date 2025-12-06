/**
 * Branded Handlers - All responses use BETRIX branding
 */

import { BrandingService } from "./services/branding-service.js";
import { Logger } from "./utils/logger.js";

const logger = new Logger("BrandedHandlers");
void logger;

class BrandedHandlers {
  constructor(telegram, userService, gemini) {
    this.telegram = telegram;
    this.userService = userService;
    this.gemini = gemini;
  }

  /**
   * Send branded welcome
   */
  async sendBrandedWelcome(chatId, userName) {
    const welcome = BrandingService.getWelcome(userName);
    await this.telegram.sendMessage(chatId, welcome);
  }

  /**
   * Send branded menu
   */
  async sendBrandedMenu(chatId) {
    const menu = BrandingService.getMenu();
    await this.telegram.sendMessage(chatId, menu);
  }

  /**
   * Send branded success
   */
  async sendSuccess(chatId, message) {
    const branded = BrandingService.success(message);
    await this.telegram.sendMessage(chatId, branded);
  }

  /**
   * Send branded error
   */
  async sendError(chatId, message) {
    const branded = BrandingService.error(message);
    await this.telegram.sendMessage(chatId, branded);
  }

  /**
   * Send branded warning
   */
  async sendWarning(chatId, message) {
    const branded = BrandingService.warning(message);
    await this.telegram.sendMessage(chatId, branded);
  }

  /**
   * Send branded info
   */
  async sendInfo(chatId, message) {
    const branded = BrandingService.info(message);
    await this.telegram.sendMessage(chatId, branded);
  }

  /**
   * Send branded help
   */
  async sendBrandedHelp(chatId) {
    const help = `${BrandingService.ICONS.help} <b>BETRIX HELP</b>

${BrandingService.menuItem("/start", "Welcome message", BrandingService.ICONS.betrix)}
${BrandingService.menuItem("/menu", "All commands", BrandingService.ICONS.menu)}
${BrandingService.menuItem("/live", "Live matches", BrandingService.ICONS.live)}
${BrandingService.menuItem("/odds", "Betting odds", BrandingService.ICONS.odds)}
${BrandingService.menuItem("/analyze", "AI analysis", BrandingService.ICONS.analyze)}
${BrandingService.menuItem("/predict", "Predictions", BrandingService.ICONS.predict)}
${BrandingService.menuItem("/coach", "Betting coach", BrandingService.ICONS.coach)}
${BrandingService.menuItem("/leaderboard", "Rankings", BrandingService.ICONS.leaderboard)}
${BrandingService.menuItem("/achievements", "Badges", BrandingService.ICONS.achievement)}
${BrandingService.menuItem("/pricing", "Plans", BrandingService.ICONS.pricing)}
${BrandingService.menuItem("/refer", "Referrals", BrandingService.ICONS.refer)}

${BrandingService.getFooter()}`;

    await this.telegram.sendMessage(chatId, help);
  }

  /**
   * Send branded feature showcase
   */
  async sendBrandedFeatureShowcase(chatId) {
    const showcase = `💎 <b>BETRIX FEATURES</b>

${BrandingService.getFeatureDescription("leaderboard")}

${BrandingService.getFeatureDescription("coach")}

${BrandingService.getFeatureDescription("notifications")}

${BrandingService.getFeatureDescription("achievements")}

${BrandingService.getFeatureDescription("betslips")}

${BrandingService.getFooter()}`;

    await this.telegram.sendMessage(chatId, showcase);
  }

  /**
   * Send branded live matches
   */
  async sendBrandedLiveMatches(chatId, matches) {
    let text = `${BrandingService.ICONS.live} <b>LIVE MATCHES NOW</b>\n\n`;

    if (!matches || matches.length === 0) {
      text += `No matches currently live.\nCheck again in a few minutes!`;
    } else {
      matches.forEach((m, i) => {
        text += `${i + 1}. ${m.homeTeam} vs ${m.awayTeam}\n`;
        text += `   Score: ${m.score || "TBA"}\n`;
        text += `   Time: ${m.status}\n\n`;
      });
    }

    text += BrandingService.getFooter();
    await this.telegram.sendMessage(chatId, text);
  }

  /**
   * Send branded standings
   */
  async sendBrandedStandings(chatId, standings, league) {
    let text = `${BrandingService.ICONS.standings} <b>${league} STANDINGS</b>\n\n`;

    standings.forEach((team, i) => {
      text += `${i + 1}. ${team.name} - ${team.points}pts\n`;
    });

    text += BrandingService.getFooter();
    await this.telegram.sendMessage(chatId, text);
  }

  /**
   * Send branded prediction
   */
  async sendBrandedPrediction(chatId, prediction) {
    const text = `${BrandingService.ICONS.predict} <b>AI PREDICTION</b>

${prediction.analysis}

${BrandingService.ICONS.pro} Confidence: ${prediction.confidence}%
${BrandingService.ICONS.stats} Based on form analysis and historical data

${BrandingService.getFooter()}`;

    await this.telegram.sendMessage(chatId, text);
  }

  /**
   * Send branded pricing
   */
  async sendBrandedPricing(chatId) {
    const pricing = `${BrandingService.ICONS.pricing} <b>BETRIX PLANS</b>

${BrandingService.ICONS.brand} <b>Free</b>
• Basic match info
• Live odds
• Community leaderboard

${BrandingService.ICONS.member} <b>Member - KES 150</b>
• AI predictions
• Personal stats
• Member-only tips

${BrandingService.ICONS.pro} <b>VVIP - KES 200-2,500</b>
• Professional dossiers
• AI Betting Coach
• Premium notifications
• Early betslips
• Seasonal analysis

/upgrade to get started!${BrandingService.getFooter()}`;

    await this.telegram.sendMessage(chatId, pricing);
  }

  /**
   * Send branded achievement
   */
  async sendBrandedAchievement(chatId, achievement) {
    const text = `🎉 <b>ACHIEVEMENT UNLOCKED</b>

${achievement.emoji} ${achievement.name}
${achievement.desc}

Great job! Keep up the momentum!${BrandingService.getFooter()}`;

    await this.telegram.sendMessage(chatId, text);
  }

  /**
   * Send branded leaderboard
   */
  async sendBrandedLeaderboard(chatId, leaderboard) {
    let text = `${BrandingService.ICONS.leaderboard} <b>TOP PLAYERS TODAY</b>\n\n`;

    leaderboard.forEach((player, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      text += `${medal} ${player.name} - ${player.points}pts (${player.accuracy}%)\n`;
    });

    text += BrandingService.getFooter();
    await this.telegram.sendMessage(chatId, text);
  }
}

export { BrandedHandlers };
