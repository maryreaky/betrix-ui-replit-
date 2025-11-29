/**
 * Telegram API service
 * Modern, clean implementation with error handling
 */

import { Logger } from "../utils/logger.js";
import { HttpClient } from "./http-client.js";
import { chunkText } from "../utils/formatters.js";

const logger = new Logger("Telegram");

class TelegramService {
  constructor(botToken, safeChunkSize = 3000) {
    this.botToken = botToken;
    this.safeChunkSize = safeChunkSize;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Send message with auto-chunking
   */
  async sendMessage(chatId, text, options = {}) {
    const chunks = chunkText(text, this.safeChunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const suffix = chunks.length > 1 ? `\n\nPage ${i + 1}/${chunks.length}` : "";
      const payload = {
        chat_id: chatId,
        text: chunks[i] + suffix,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...options,
      };

      // Debug: log payload keys for troubleshooting reply_markup
      try {
        logger.debug('sendMessage payload keys', Object.keys(payload));
      } catch (e) {
        // ignore logging errors
      }
      try {
        await HttpClient.fetch(`${this.baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }, `sendMessage to ${chatId}`);
      } catch (err) {
        logger.error("Send message failed", err);
        throw err;
      }
    }
  }

  /**
   * Edit existing message
   */
  async editMessage(chatId, messageId, text, replyMarkup = null) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    };

    return HttpClient.fetch(`${this.baseUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, `editMessage ${messageId}`);
  }

  /**
   * Answer callback query (inline button response)
   */
  async answerCallback(callbackQueryId, text = "", showAlert = false) {
    return HttpClient.fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    }, `answerCallback ${callbackQueryId}`);
  }

  /**
   * Set webhook
   */
  /**
   * Set webhook with optional secret token
   * @param {string} url
   * @param {array} allowedUpdates
   * @param {string} secretToken
   */
  async setWebhook(url, allowedUpdates = ["message", "callback_query"], secretToken = null) {
    const body = { url, allowed_updates: allowedUpdates };
    if (secretToken) body.secret_token = secretToken;

    return HttpClient.fetch(`${this.baseUrl}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "setWebhook");
  }

  /**
   * Delete webhook
   */
  async deleteWebhook() {
    return HttpClient.fetch(`${this.baseUrl}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, "deleteWebhook");
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo() {
    return HttpClient.fetch(`${this.baseUrl}/getWebhookInfo`, {
      method: "POST",
    }, "getWebhookInfo");
  }
}

export { TelegramService };
