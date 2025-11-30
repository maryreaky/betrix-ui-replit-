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

    try {
      return await HttpClient.fetch(`${this.baseUrl}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, `editMessage ${messageId}`);
    } catch (err) {
      // Normalize error string
      const msg = String(err && (err.message || err) || '');
      // Common benign Telegram responses
      if (msg.includes('message is not modified') || msg.includes('Bad Request: message is not modified')) {
        logger.info('Telegram editMessage: message not modified (no-op)');
        return { ok: false, reason: 'not_modified' };
      }
      if (msg.includes("message to edit not found") || msg.includes("message can't be edited") || msg.includes("message to edit has no text")) {
        logger.info('Telegram editMessage: message not editable, falling back to sendMessage', { chatId, messageId });
        try {
          await this.sendMessage(chatId, text, { reply_markup: replyMarkup });
          return { ok: true, fallback: 'sent_new' };
        } catch (e2) {
          logger.warn('Fallback sendMessage after editMessage failure also failed', e2 && e2.message ? e2.message : e2);
          return { ok: false, reason: 'edit_and_send_failed' };
        }
      }
      // Unexpected: rethrow for upstream handling/logging
      throw err;
    }
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
