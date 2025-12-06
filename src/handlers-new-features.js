/**
 * BETRIX New Features Handlers
 * Meme, Crypto, News, Tips with full branding
 */

import { Logger } from "./utils/logger.js";
import { MemeService } from "./services/meme-service.js";
import { CryptoPredictionsService } from "./services/crypto-predictions-service.js";
import { NewsService } from "./services/news-service.js";
// AIFallbackService intentionally not used here yet; keep imports minimal
import { ContentGenerationService } from "./services/content-generation-service.js";
import { BrandingService } from "./services/branding-service.js";

const logger = new Logger("NewFeatures");

class NewFeaturesHandlers {
  constructor(telegram, userService, gemini) {
    this.telegram = telegram;
    this.userService = userService;
    this.gemini = gemini;
    this.cryptoService = new CryptoPredictionsService();
    this.newsService = new NewsService();
  }

  /**
   * /meme - Random betting meme
   */
  async handleMeme(chatId) {
    try {
      const meme = MemeService.generateTextMeme("Your Team", 2.5, "The Favorites");
      
      const text = `${BrandingService.ICONS.achievement} <b>BETRIX Meme of the Moment</b>

${MemeService.formatMeme(meme)}

😂 Too relatable? Share this with your betting crew!`;

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Meme handler error", err);
      return this.telegram.sendMessage(
        chatId,
        `${BrandingService.ICONS.error} Meme engine temporarily down. Try again!`
      );
    }
  }

  /**
   * /crypto [symbol] - Crypto prediction
   */
  async handleCrypto(chatId, symbol = "bitcoin") {
    try {
      const symbol_lower = (symbol || "bitcoin").toLowerCase();
      const prediction = await this.cryptoService.predictCryptoPrice(symbol_lower);

      if (!prediction) {
        return this.telegram.sendMessage(
          chatId,
          `${BrandingService.ICONS.error} <b>Crypto Not Found</b>\n\nTry: /crypto bitcoin or /crypto ethereum`
        );
      }

      const text = `${BrandingService.ICONS.special} <b>BETRIX Crypto Analysis</b>

${this.cryptoService.formatPrediction(prediction)}

💡 <i>Crypto predictions based on 24h momentum. Not financial advice.</i>`;

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Crypto handler error", err);
      return this.telegram.sendMessage(
        chatId,
        `${BrandingService.ICONS.error} Unable to fetch crypto data right now.`
      );
    }
  }

  /**
   * /news - Latest sports news
   */
  async handleNews(chatId, query = "football") {
    try {
      const articles = await this.newsService.getSportsNews(query || "football");

      const text = `${BrandingService.ICONS.info} <b>BETRIX Sports News</b>

${this.newsService.formatNews(articles)}

📖 Stay informed to make better betting decisions!`;

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("News handler error", err);
      return this.telegram.sendMessage(
        chatId,
        `${BrandingService.ICONS.error} News service temporarily unavailable.`
      );
    }
  }

  /**
   * /tip - Random betting strategy tip
   */
  async handleTip(chatId) {
    try {
      const tip = ContentGenerationService.generateBettingTip();

      const text = `${BrandingService.ICONS.tips} <b>BETRIX Strategy Tip</b>

${tip}

🎯 Apply this wisdom to your next bet!`;

      return this.telegram.sendMessage(chatId, text);
    } catch (err) {
      logger.error("Tip handler error", err);
      return this.telegram.sendMessage(
        chatId,
        `${BrandingService.ICONS.error} Tip service down. Check back later!`
      );
    }
  }

  /**
   * Enhanced /menu with modern design
   */
  async enhancedMenu(chatId) {
    const { ModernMenuService } = await import("./services/modern-menu-service.js");
    const menuData = ModernMenuService.mainMenu();
    
    return this.telegram.sendMessage(chatId, menuData.text, {
      reply_markup: { inline_keyboard: menuData.keyboard }
    });
  }

  /**
   * Enhanced /help with modern design
   */
  async enhancedHelp(chatId) {
    const { ModernMenuService } = await import("./services/modern-menu-service.js");
    const text = ModernMenuService.helpMenu();
    return this.telegram.sendMessage(chatId, text);
  }
  
  /**
   * Sports menu
   */
  async sportsMenu(chatId) {
    const { ModernMenuService } = await import("./services/modern-menu-service.js");
    const text = ModernMenuService.sportsMenu();
    return this.telegram.sendMessage(chatId, text);
  }

  /**
   * Free features menu
   */
  async freeFeaturesMenu(chatId) {
    const { ModernMenuService } = await import("./services/modern-menu-service.js");
    const text = ModernMenuService.freeFeaturesMenu();
    return this.telegram.sendMessage(chatId, text);
  }

  /**
   * Premium features menu
   */
  async premiumMenu(chatId) {
    const { ModernMenuService } = await import("./services/modern-menu-service.js");
    const text = ModernMenuService.premiumMenu();
    return this.telegram.sendMessage(chatId, text);
  }
}

export { NewFeaturesHandlers };
