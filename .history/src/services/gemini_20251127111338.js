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

      // Compact context summary
      const ctxSummary = (() => {
        try {
          if (!context || typeof context !== 'object') return {};
          return {
            id: context.id || context.userId || null,
            name: context.name || null,
            role: context.role || null,
            lang: context.preferredLanguage || context.language || 'en',
            leagues: Array.isArray(context.favoriteLeagues) ? context.favoriteLeagues.slice(0, 2) : null,
          };
        } catch (e) {
          return {};
        }
      })();

      // ULTRA-COMPACT system prompt to minimize token usage (target <100 tokens)
      const systemPrompt = `You are BETRIX, a concise AI sports analyst. Be brief, helpful, and direct. Respond in under 150 words. Focus on football, odds, betting strategy. Identify as BETRIX, not Gemini. User context: ${JSON.stringify(ctxSummary)}`;

      // First attempt: very conservative token limit
      let result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nUser: " + userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      });

      let text = result.response?.text?.() || "";
      const finishReason = result.response?.candidates?.[0]?.finishReason || null;

      // If we got a response and it's not empty, return it
      if (text && text.trim().length > 0 && finishReason !== 'MAX_TOKENS') {
        logger.info("Gemini response generated");
        return text;
      }

      // If we hit MAX_TOKENS or got empty, retry with even shorter prompt and lower tokens
      if (finishReason === 'MAX_TOKENS' || !text || text.trim().length === 0) {
        logger.warn("Gemini MAX_TOKENS or empty response, retrying with ultra-compact prompt", {
          finishReason,
          prevLength: (text || "").length,
        });

        // Minimal system prompt
        const minimalSystem = `Answer briefly: sports/betting. Max 100 words.`;
        try {
          result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: minimalSystem + "\nUser: " + userMessage }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
          });

          text = result.response?.text?.() || "";
          if (text && text.trim().length > 0) {
            logger.info("Gemini retry succeeded with minimal prompt");
            return text;
          }
        } catch (retryErr) {
          logger.warn("Gemini minimal retry failed", { error: retryErr?.message || String(retryErr) });
        }
      }

      // If all attempts failed, fall back to local response
      if (!text || text.trim().length === 0) {
        logger.warn("Gemini all attempts exhausted, using fallback");
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
