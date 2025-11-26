/**
 * BETRIX Natural Language Message Handler v3
 * Routes user messages to commands/states based on intent
 * Handles signup profile collection, fallbacks, and context awareness
 */

import logger from '../utils/logger.js';
import { getUserState, setUserState, getStateData, setStateData, setUserState as updateUserStateData, StateTypes } from './data-models.js';
import { createUserProfile, getUserProfile, updateUserProfile } from './data-models.js';

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

const IntentPatterns = {
  // Signup flow
  signup: /^(sign\s*up|join|register|create.*account|i.*want.*join|lets.*start)/i,
  name_input: /^[a-z\s]{2,}$/i, // Simple name detection

  // Feature access
  odds: /^(show\s*odds|today.*match|fixtures|live\s*odds|what.*today)/i,
  analyze: /^(analyz|explain|breakdown|what.*happen|predict)/i,
  news: /^(news|update|latest|what.*new|injury|lineup|transfer)/i,
  help: /^(help|faq|how.*work|support|contact|troubleshoot)/i,
  payment: /^(pay|payment|subscribe|vvip|upgrade|premium|checkout)/i,
  sites: /^(betting\s*site|bookmaker|bet.*site|where.*bet|open.*site)/i,
  menu: /^(menu|main|home|dashboard|back)/i,

  // Betting actions
  bet: /^(bet|place.*bet|add.*slip|stake)/i,
  quick_bet: /^(quick|rapid|fast|instant)/i
};

/**
 * Classify user message intent
 */
function classifyIntent(text) {
  const msg = text.trim().toLowerCase();

  for (const [intent, pattern] of Object.entries(IntentPatterns)) {
    if (pattern.test(msg)) {
      return intent;
    }
  }

  return 'unknown';
}

/**
 * Extract parameters from message
 * E.g., "/odds football" → { command: 'odds', params: ['football'] }
 */
function parseMessage(text) {
  const trimmed = text.trim();

  // Handle commands: /command param1 param2
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    return {
      command: parts[0].toLowerCase(),
      params: parts.slice(1)
    };
  }

  // Natural language: classify intent and extract entities
  return {
    intent: classifyIntent(trimmed),
    text: trimmed
  };
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

export async function handleMessage(message, userId, chatId, redis, services) {
  logger.info('handleMessage', { userId, chatId, text: message.substring(0, 50) });

  try {
    // Parse message
    const parsed = parseMessage(message);

    // Check if user is in a specific state (e.g., signup)
    const currentState = await getUserState(redis, userId);
    const stateData = await getStateData(redis, userId);

    // Handle state-specific inputs
    if (currentState !== StateTypes.IDLE) {
      return await handleStateSpecificInput(currentState, message, userId, chatId, redis, services, stateData);
    }

    // Handle explicit commands
    if (parsed.command) {
      const { handleCommand } = await import('./commands-v3.js');
      return await handleCommand(parsed.command, parsed.params, userId, chatId, redis, services);
    }

    // Handle intent-based routing
    if (parsed.intent && parsed.intent !== 'unknown') {
      return await handleIntent(parsed.intent, parsed.text, userId, chatId, redis, services);
    }

    // Fallback: show help
    return {
      chat_id: chatId,
      text: `❓ I didn't quite understand that.\n\nTry:\n• /menu for main options\n• /odds to see today's matches\n• /help for FAQs\n• /signup to join`,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleMessage error', err);
    return {
      chat_id: chatId,
      text: '❌ Error processing message. Try again.',
      parse_mode: 'Markdown'
    };
  }
}

// ============================================================================
// STATE-SPECIFIC INPUT HANDLERS
// ============================================================================

async function handleStateSpecificInput(state, message, userId, chatId, redis, services, stateData) {
  logger.info('handleStateSpecificInput', { state, userId });

  switch (state) {
    case StateTypes.SIGNUP_NAME:
      return await handleSignupName(message, userId, chatId, redis);

    case StateTypes.SIGNUP_COUNTRY:
      return await handleSignupCountry(message, userId, chatId, redis);

    case StateTypes.SIGNUP_AGE:
      return await handleSignupAge(message, userId, chatId, redis);

    case StateTypes.PAYMENT_PENDING:
      return {
        chat_id: chatId,
        text: '⏳ Your payment is still processing. Please wait or check /pay for status.',
        parse_mode: 'Markdown'
      };

    case StateTypes.BETTING_SLIP_ACTIVE:
      return {
        chat_id: chatId,
        text: '🎯 You have an active betting slip. Finalize with /bet or type /cancel to start over.',
        parse_mode: 'Markdown'
      };

    default:
      await setUserState(redis, userId, StateTypes.IDLE);
      return await handleMessage(message, userId, chatId, redis, services);
  }
}

/**
 * Handle signup name collection
 */
async function handleSignupName(message, userId, chatId, redis) {
  const name = message.trim();

  if (!name || name.length < 2) {
    return {
      chat_id: chatId,
      text: '📝 Please provide a valid name (at least 2 characters).',
      parse_mode: 'Markdown'
    };
  }

  // Save name and move to country
  await setStateData(redis, userId, { name, step: 'country' }, 3600);
  await setUserState(redis, userId, StateTypes.SIGNUP_COUNTRY, 3600);

  return {
    chat_id: chatId,
    text: `✅ Nice to meet you, *${name}*!\n\n🌍 Which country are you in?\n\nExamples: Kenya, Uganda, Tanzania, or use country code (KE, UG, TZ)`,
    parse_mode: 'Markdown'
  };
}

/**
 * Handle signup country collection
 */
async function handleSignupCountry(message, userId, chatId, redis) {
  const country = message.trim().toUpperCase();
  const validCountries = ['KE', 'UG', 'TZ', 'KENYA', 'UGANDA', 'TANZANIA'];

  if (!validCountries.includes(country)) {
    return {
      chat_id: chatId,
      text: '🌍 Please enter a valid country (KE, UG, TZ) or full name (Kenya, Uganda, Tanzania).',
      parse_mode: 'Markdown'
    };
  }

  // Normalize country code
  const countryCode = country === 'KENYA' ? 'KE' : country === 'UGANDA' ? 'UG' : country === 'TANZANIA' ? 'TZ' : country;

  // Save country and move to age
  const current = await getStateData(redis, userId);
  await setStateData(redis, userId, { ...current, country: countryCode, step: 'age' }, 3600);
  await setUserState(redis, userId, StateTypes.SIGNUP_AGE, 3600);

  return {
    chat_id: chatId,
    text: `✅ Got it, *${countryCode}*!\n\n🎂 How old are you? (Enter a number, e.g., 25)`,
    parse_mode: 'Markdown'
  };
}

/**
 * Handle signup age collection
 */
async function handleSignupAge(message, userId, chatId, redis) {
  const age = parseInt(message.trim(), 10);

  if (isNaN(age) || age < 18 || age > 120) {
    return {
      chat_id: chatId,
      text: '🎂 Please enter a valid age (18-120).',
      parse_mode: 'Markdown'
    };
  }

  // Complete signup profile creation
  const current = await getStateData(redis, userId);
  const profileData = {
    name: current.name,
    country: current.country,
    age,
    signup_paid: false
  };

  await createUserProfile(redis, userId, profileData);
  await setUserState(redis, userId, StateTypes.IDLE);
  await redis.del(`user:${userId}:state_data`);

  // Show payment prompt
  const text = `✨ *Profile Complete!*\n\nHello, *${profileData.name}*! Welcome to BETRIX.\n\n💰 To unlock all features, pay a one-time signup fee of *150 KES* or *$1 USD*.\n\nReady to pay?`;

  return {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Pay Now', callback_data: 'pay_signup_select' }],
        [{ text: '⏭️ Later', callback_data: 'menu_main' }]
      ]
    }
  };
}

// ============================================================================
// INTENT HANDLERS
// ============================================================================

async function handleIntent(intent, text, userId, chatId, redis, services) {
  logger.info('handleIntent', { intent, userId });

  switch (intent) {
    case 'signup':
      const { handleSignup } = await import('./commands-v3.js');
      return await handleSignup(userId, chatId, redis);

    case 'odds':
      const { handleOdds } = await import('./commands-v3.js');
      return await handleOdds(userId, chatId, redis, services);

    case 'analyze':
      const { handleAnalyze } = await import('./commands-v3.js');
      return await handleAnalyze(userId, chatId, redis, services);

    case 'news':
      const { handleNews } = await import('./commands-v3.js');
      return await handleNews(userId, chatId, redis, services);

    case 'help':
      const { handleHelp } = await import('./commands-v3.js');
      return await handleHelp(chatId);

    case 'payment':
      const { handlePay } = await import('./commands-v3.js');
      return await handlePay(userId, chatId, redis);

    case 'sites':
      const { handleBettingSitesCallback } = await import('./betting-sites.js');
      return await handleBettingSitesCallback('sites_main', chatId, userId, redis);

    case 'menu':
      const { handleMenu } = await import('./commands-v3.js');
      return await handleMenu(userId, chatId, redis);

    default:
      return {
        chat_id: chatId,
        text: `❓ Not sure what you mean by "*${text}*".\n\nTry:\n• Show odds\n• Analyze match\n• Latest news\n• Help`,
        parse_mode: 'Markdown'
      };
  }
}

export default {
  handleMessage,
  handleStateSpecificInput,
  handleSignupName,
  handleSignupCountry,
  handleSignupAge,
  handleIntent,
  classifyIntent,
  parseMessage
};
