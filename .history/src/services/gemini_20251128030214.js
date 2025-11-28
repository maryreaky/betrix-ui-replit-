/**
 * Gemini AI Service with comprehensive fallbacks
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Logger } from "../utils/logger.js";

const logger = new Logger("Gemini");

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.enabled = !!apiKey;
    if (this.enabled) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
      } catch (err) {
        logger.error('Failed to initialize GoogleGenerativeAI', err);
        // keep enabled flag as-is; we'll fallback per-request if needed
      }
    }
  }

  async chat(userMessage, context = {}) {
    if (!this.enabled) {
      return this.fallbackResponse(userMessage, context);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Minimal context to reduce token usage (only keep essential info)
      const minimalContext = (() => {
        try {
          if (!context || typeof context !== 'object') return '';
          const parts = [];
          if (context.name) parts.push(`User: ${context.name}`);
          if (context.favoriteLeagues && Array.isArray(context.favoriteLeagues)) {
            parts.push(`Leagues: ${context.favoriteLeagues.slice(0, 1).join(',')}`);
          }
          return parts.join(' | ');
        } catch (e) {
          return '';
        }
      })();

      // ULTRA-COMPACT system prompt (target <50 tokens total)
      const systemPrompt = `Be BETRIX: sports AI. Brief, direct, max 100 words. Football/odds. ${minimalContext}`;

      // First attempt: aggressive token limit
      let result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nQ: " + userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
      });

      let text = result.response?.text?.() || "";
      const finishReason = result.response?.candidates?.[0]?.finishReason || null;

      // If we got a response and it's not empty, return it
      if (text && text.trim().length > 0 && finishReason !== 'MAX_TOKENS') {
        logger.info("Gemini response generated successfully");
        return text;
      }

      // If we hit MAX_TOKENS or got empty, retry with extremely minimal prompt
      if (finishReason === 'MAX_TOKENS' || !text || text.trim().length === 0) {
        logger.warn("Gemini MAX_TOKENS or empty, retrying ultra-minimal", { finishReason });

        // Strip to absolute minimum
        const minimalPrompt = `Answer: ${userMessage.substring(0, 100)}`;
        try {
          result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: minimalPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 80 },
          });

          text = result.response?.text?.() || "";
          if (text && text.trim().length > 0) {
            logger.info("Gemini minimal retry succeeded");
            return text;
          }
        } catch (retryErr) {
          logger.warn("Gemini minimal retry failed", { error: String(retryErr?.message || retryErr) });
        }
      }

      // If all attempts failed, use fallback
      if (!text || text.trim().length === 0) {
        logger.warn("Gemini exhausted, using fallback response");
        return this.fallbackResponse(userMessage, context);
      }

      return text;
    } catch (error) {
      logger.error("Gemini error", { message: String(error?.message || "") });
      return this.fallbackResponse(userMessage, context);
    }
  }

  fallbackResponse(message, context = {}) {
    const msg = message.toLowerCase();

    // Check if user is asking about BETRIX identity
    if (msg.includes("who are you") || msg.includes("what are you") || msg.includes("your name")) {
      return `👋 I'm BETRIX - your autonomous AI sports analyst. I analyze football, odds, betting strategy, and match insights. Ask me anything about sports! Or use /menu to explore.`;
    }

    if (msg.includes("gemini") || msg.includes("chatgpt")) {
      return `I'm BETRIX, not Gemini or ChatGPT. I'm a specialized sports AI built for betting analysis and predictions. How can I help with football or betting?`;
    }

    const keywords = {
      live: "🔴 Use /live to see matches happening now.",
      odds: "🎲 Use /odds [fixture-id] to compare betting lines.",
      standing: "📊 Use /standings to view league tables.",
      predict: "🧠 I analyze form + odds. Ask about a specific match!",
      analysis: "🔍 Describe a match and I'll analyze it.",
      tip: "💡 Bankroll discipline beats luck every time.",
      price: "💵 Type /pricing to see our subscription plans.",
      refer: "👥 Share your code with /refer and earn rewards.",
      help: "📚 Use /menu to explore all features.",
      hi: "👋 Hi! I'm BETRIX. Ask me about football or use /menu.",
      hello: "👋 Hi! I'm BETRIX, your AI sports analyst. What can I help with?",
      hey: "👋 Hey! I'm BETRIX. Ask me about football, odds, or betting strategy!",
    };

    for (const [key, response] of Object.entries(keywords)) {
      if (msg.includes(key)) return response;
    }

    return `I'm BETRIX, your AI sports analyst. I can help with football analysis, odds comparison, and betting strategy. Try /menu or ask me about a specific match!`;
  }

  async analyzeSport(sport, matchData, question) {
    if (!this.enabled) {
      return `Unable to analyze. Try again or use /help.`;
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      // Compact prompt to avoid token bloat
      const compactData = {
        home: matchData.home || matchData.homeTeam || 'Team1',
        away: matchData.away || matchData.awayTeam || 'Team2',
        score: matchData.score || `${matchData.homeScore || 0}-${matchData.awayScore || 0}`,
        odds: matchData.odds || 'N/A',
      };
      
      const prompt = `${sport}: ${JSON.stringify(compactData)}\nQ: ${question}\nAnswer in <100 words. Include: insight, prediction, confidence %.`;
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150 },
      });

      let text = result.response?.text?.() || "";
      const finishReason = result.response?.candidates?.[0]?.finishReason || null;

      // Retry if MAX_TOKENS
      if ((!text || text.trim().length === 0) && finishReason === 'MAX_TOKENS') {
        logger.warn("Gemini analysis hit MAX_TOKENS, retrying compact");
        try {
          const result2 = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `${sport}: ${compactData.home} vs ${compactData.away}. ${question}` }] }],
            generationConfig: { maxOutputTokens: 100 },
          });
          text = result2.response?.text?.() || "";
        } catch (e) {
          logger.warn("Gemini analysis retry failed");
        }
      }

      if (!text || text.trim().length === 0) {
        logger.warn("Gemini analysis returned empty response");
        return `Unable to analyze right now. Try again later.`;
      }

      return text;
    } catch (err) {
      logger.error("Analysis error", { message: String(err?.message || "") });
      return `Unable to analyze right now. Try again later.`;
    }
  }

  isHealthy() {
    return this.enabled;
  }
}

export { GeminiService };
