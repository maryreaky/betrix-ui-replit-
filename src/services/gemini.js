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

      // Build a compact context summary to avoid huge prompts
      const ctxSummary = (() => {
        try {
          if (!context || typeof context !== 'object') return {};
          return {
            id: context.id || context.userId || null,
            name: context.name || null,
            role: context.role || null,
            preferredLanguage: context.preferredLanguage || context.language || 'en',
            favoriteLeagues: context.favoriteLeagues || context.leagues || null,
            recentMessages: Array.isArray(context.recentMessages) ? context.recentMessages.slice(-6) : [],
          };
        } catch (e) {
          return {};
        }
      })();

      const systemPrompt = `You are BETRIX - a world-class autonomous sports AI assistant.

IDENTITY:
- Your name is BETRIX (not Gemini, not ChatGPT)
- You are an independent AI sports analyst
- You have a personality: witty, knowledgeable, confident

PERSONALITY:
- Honest, data-driven, helpful, no hype
- Conversational and friendly
- Explain things clearly to both beginners and experts
- Use sports metaphors when appropriate
- Be encouraging about smart betting practices

SPECIALTY:
- Football (soccer) - leagues, teams, players, odds, predictions
- Betting analysis - value finding, odds comparison, risk management
- Match insights - team form, head-to-head, tactical analysis
- Betting strategy - bankroll management, unit sizing, Kelly Criterion

STYLE:
- Concise but informative (keep responses under 500 chars when natural)
- Professional but friendly (not robotic)
- Use emojis sparingly for emphasis
- Provide data-backed insights
- Ask clarifying questions if needed

USER CONTEXT: ${JSON.stringify(ctxSummary)}

IMPORTANT:
- Always identify yourself as BETRIX when asked
- Never pretend to be a human or another AI
- Be honest about your capabilities and limitations
- Guide users to /menu or specific commands when appropriate
- Encourage responsible betting practices

Now respond to the user's message with intelligence and personality.`;

      // Primary generation attempt (conservative output size)
      let result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nUser: " + userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      });

      let text = result.response?.text?.() || "";

      // If model hit token limits, retry with a much shorter system prompt and lower max tokens
      const finishReason = result.response?.candidates?.[0]?.finishReason || null;
      if ((!text || text.trim().length === 0) && finishReason === 'MAX_TOKENS') {
        logger.warn("Gemini returned empty response due to MAX_TOKENS, retrying with trimmed prompt", {
          finishReason,
          usage: result.response?.usageMetadata || null,
          responseId: result.response?.responseId || null,
        });

        // Build a compact fallback system prompt to reduce token usage
        const shortSystem = `You are BETRIX — concise sports analyst. Answer briefly and directly.`;
        try {
          result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: shortSystem + "\nUser: " + userMessage }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 180 },
          });

          text = result.response?.text?.() || "";
          if (text && text.trim().length > 0) {
            logger.info("Gemini retry succeeded with trimmed prompt");
            return text;
          }
        } catch (retryErr) {
          logger.warn("Gemini retry failed", retryErr?.message || String(retryErr));
        }
      }

      if (!text || text.trim().length === 0) {
        logger.warn("Gemini returned empty response", {
          status: finishReason,
          fullResponse: JSON.stringify(result.response)
        });
        return this.fallbackResponse(userMessage, context);
      }

      logger.info("Gemini response generated");
      return text;
    } catch (error) {
      // Log error minimally and return a fallback response for this request.
      const msg = String(error?.message || "");
      logger.error("Gemini error (per-request)", { message: msg });
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
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze this ${sport}: ${JSON.stringify(matchData)}\nQuestion: ${question}\nProvide: insights, prediction, confidence.`,
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 300 },
      });

      const text = result.response?.text?.() || "";
      if (!text || text.trim().length === 0) {
        logger.warn("Gemini analysis returned empty response");
        return `Unable to analyze right now. Try again later.`;
      }

      return text;
    } catch (err) {
      logger.error("Analysis error", err);
      return `Unable to analyze right now. Try again later.`;
    }
  }

  isHealthy() {
    return this.enabled;
  }
}

export { GeminiService };
