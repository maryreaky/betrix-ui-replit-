/**
 * BETRIX Betting Sites Directory - Kenya & Regional
 * Provides curated links, bonuses, and direct access to major bookmakers
 */

import logger from '../utils/logger.js';

export const BETTING_SITES = {
  KE: [
    {
      id: 'betika',
      name: 'Betika',
      url: 'https://www.betika.co.ke',
      logo: '🎲',
      description: 'Kenya\'s leading online sportsbook',
      bonus: 'Welcome bonus up to 10,000 KES',
      popular: true,
      rating: 4.7
    },
    {
      id: 'sportpesa',
      name: 'SportPesa',
      url: 'https://www.sportpesa.co.ke',
      logo: '⚽',
      description: 'Fast payouts, live betting',
      bonus: 'Up to 15,000 KES welcome offer',
      popular: true,
      rating: 4.6
    },
    {
      id: 'odibets',
      name: 'Odibets',
      url: 'https://www.odibets.com',
      logo: '🏆',
      description: 'Mobile-first platform, great odds',
      bonus: '100% match on first deposit',
      popular: true,
      rating: 4.5
    },
    {
      id: 'betway',
      name: 'Betway Kenya',
      url: 'https://www.betway.co.ke',
      logo: '🎯',
      description: 'Global brand, trusted & secure',
      bonus: 'Up to 5,000 KES first bet credit',
      popular: true,
      rating: 4.6
    },
    {
      id: '1xbet',
      name: '1xBet',
      url: 'https://1xbet.co.ke',
      logo: '🌟',
      description: 'High odds, live streaming',
      bonus: '100% bonus up to 50,000 KES',
      popular: false,
      rating: 4.4
    },
    {
      id: 'betkwatro',
      name: 'Betkwatro',
      url: 'https://www.betkwatro.co.ke',
      logo: '💰',
      description: 'Local favorite, instant payouts',
      bonus: 'Loyalty rewards program',
      popular: false,
      rating: 4.3
    }
  ],
  UG: [
    {
      id: 'betking',
      name: 'BetKing',
      url: 'https://www.betking.com',
      logo: '👑',
      description: 'Uganda\'s premium sportsbook',
      bonus: 'Welcome bonus available',
      popular: true,
      rating: 4.5
    },
    {
      id: 'mozzart',
      name: 'Mozzart Bet',
      url: 'https://www.mozzartbet.com',
      logo: '🎮',
      description: 'Live betting, casino games',
      bonus: 'First bet offer',
      popular: true,
      rating: 4.4
    }
  ],
  TZ: [
    {
      id: 'betpawa',
      name: 'BetPawa',
      url: 'https://www.betpawa.tz',
      logo: '🔥',
      description: 'Tanzania\'s fast-growing platform',
      bonus: 'Welcome offer available',
      popular: true,
      rating: 4.3
    }
  ]
};

/**
 * Get betting sites for a user's country
 */
export async function getBettingSitesForCountry(countryCode = 'KE') {
  const sites = BETTING_SITES[countryCode] || BETTING_SITES.KE;
  return sites.sort((a, b) => {
    if (a.popular && !b.popular) return -1;
    if (!a.popular && b.popular) return 1;
    return b.rating - a.rating;
  });
}

/**
 * Format betting sites for Telegram display
 */
export function formatBettingSites(sites) {
  let text = `🔗 *Recommended Betting Sites*\n\n`;
  text += `Your trusted partners for placing bets. All secure, licensed, and fast.\n\n`;

  sites.forEach((site, idx) => {
    const popular = site.popular ? ' ⭐ POPULAR' : '';
    text += `*${idx + 1}. ${site.logo} ${site.name}*${popular}\n`;
    text += `${site.description}\n`;
    text += `📢 ${site.bonus}\n`;
    text += `⭐ ${site.rating}/5\n\n`;
  });

  return text;
}

/**
 * Create inline keyboard for betting sites
 */
export function createBettingSitesKeyboard(sites, selectedSiteId = null) {
  const buttons = sites.map(site => [{
    text: `${site.logo} ${site.name}`,
    url: site.url
  }]);

  // Add action buttons
  buttons.push([
    { text: '🔄 Compare Odds', callback_data: 'sites_compare' },
    { text: '⭐ Set Preferred', callback_data: 'sites_preferred' }
  ]);
  buttons.push([
    { text: '💡 Learn Bonuses', callback_data: 'sites_bonuses' },
    { text: '⬅️ Back', callback_data: 'menu_main' }
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Handle betting sites callback
 */
export async function handleBettingSitesCallback(data, chatId, userId, redis) {
  logger.info('handleBettingSitesCallback', { data, userId });

  try {
    // Get user's country
    const user = await redis.hgetall(`user:${userId}`);
    const country = user?.country || 'KE';
    const sites = await getBettingSitesForCountry(country);

    if (data === 'sites_main') {
      const text = formatBettingSites(sites);
      return {
        method: 'editMessageText',
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: createBettingSitesKeyboard(sites)
      };
    }

    if (data === 'sites_compare') {
      const text = `📊 *Compare Odds Across Sites*\n\nBETRIX Premium members get automated odds aggregation.\n\nTap the site links above to compare odds in real-time.`;
      return {
        method: 'editMessageText',
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'sites_main' }]] }
      };
    }

    if (data === 'sites_bonuses') {
      let text = `💡 *Understanding Betting Site Bonuses*\n\n`;
      text += `*Welcome Bonus:* Free bet credit on first deposit\n`;
      text += `*Free Bets:* Stand-alone betting credits\n`;
      text += `*Boost Odds:* Enhanced odds on selected matches\n`;
      text += `*Loyalty Rewards:* Points redeemable for bets\n\n`;
      text += `💬 Tap the site links to check current offers!`;

      return {
        method: 'editMessageText',
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'sites_main' }]] }
      };
    }

    if (data === 'sites_preferred') {
      const text = `⭐ *Set Your Preferred Betting Site*\n\nWhich site would you like to set as your default?`;
      const keyboard = {
        inline_keyboard: [
          ...sites.slice(0, 5).map(site => [
            { text: `${site.logo} ${site.name}`, callback_data: `pref_site_${site.id}` }
          ]),
          [{ text: '⬅️ Back', callback_data: 'sites_main' }]
        ]
      };

      return {
        method: 'editMessageText',
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      };
    }

    if (data.startsWith('pref_site_')) {
      const siteId = data.replace('pref_site_', '');
      const site = sites.find(s => s.id === siteId);

      if (site) {
        await redis.hset(`user:${userId}`, 'preferred_site', siteId);
        return {
          chat_id: chatId,
          text: `✅ *Preferred site set!*\n\n${site.logo} ${site.name} is now your default.`,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'menu_main' }]] }
        };
      }
    }

    return {
      chat_id: chatId,
      text: '❌ Unknown action.',
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('handleBettingSitesCallback error', err);
    return {
      chat_id: chatId,
      text: '❌ Error loading betting sites.',
      parse_mode: 'Markdown'
    };
  }
}

export default { BETTING_SITES, getBettingSitesForCountry, formatBettingSites, createBettingSitesKeyboard, handleBettingSitesCallback };
