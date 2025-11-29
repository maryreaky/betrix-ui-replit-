/**
 * Minimal Telegram handler implementation
 */

async function getLiveMatchesBySport(sport, redis, sportsAggregator) {
  try {
    const cacheKey = 'betrix:prefetch:live:by-sport';
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = tryParseJson(cached);
      if (data && data.sports && data.sports[sport] && Array.isArray(data.sports[sport].samples)) {
        logger.info(`📦 Got cached ${sport} matches from prefetch (${data.sports[sport].count || 0} total)`);
        return data.sports[sport].samples;
      }
    }

    if (sport === 'soccer') {
      const live39 = await redis.get('live:39').catch(() => null);
      const parsed = tryParseJson(live39);
      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.info('📦 Got cached soccer matches from live:39 fallback');
        return parsed;
      }
    }

    if (sportsAggregator && typeof sportsAggregator._getLiveFromStatPal === 'function') {
      try {
        const statpal = await sportsAggregator._getLiveFromStatPal(sport, 'v1');
        if (Array.isArray(statpal) && statpal.length > 0) return statpal;
      } catch (e) {
        logger.debug('StatPal fetch failed', e?.message || String(e));
      }
    }

    const demoEnabled = (process.env.DEMO_FALLBACK === 'true' || process.env.FORCE_DEMO_FALLBACK === '1');
    if (demoEnabled) {
      logger.info('Returning demo fallback matches');
      return [
        { id: 'demo-1', home: 'Demo FC', away: 'Sample United', status: "15'" },
        { id: 'demo-2', home: 'Example Town', away: 'Test Rovers', status: 'HT' }
      ];
    }

    return [];
  } catch (e) {
    logger.warn('getLiveMatchesBySport failed', e?.message || String(e));
    return [];
  }
}

export async function handleMessage(update, redis, services) {
  try {
    const message = update.message || update.edited_message;
    if (!message) return null;
    const chatId = message.chat.id;
    const text = message.text || '';

    if (text && text.startsWith('/live')) {
      const games = await getLiveMatchesBySport('soccer', redis, services && services.sportsAggregator);
      const payload = buildLiveMenuPayload(games, 'Soccer', 'FREE', 1, 6);
      return { method: 'sendMessage', chat_id: chatId, text: payload.text, reply_markup: payload.reply_markup, parse_mode: 'Markdown' };
    }

    return { method: 'sendMessage', chat_id: chatId, text: 'Send /live to view live soccer matches.' };
  } catch (e) {
    logger.warn('handleMessage error', e?.message || String(e));
    return null;
  }
}

export async function handleCallbackQuery(update, redis, services) {
  try {
    const cq = update.callback_query;
    if (!cq || !cq.data) return null;
    const data = cq.data;
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;

    if (data.startsWith('match:')) {
      const parts = data.split(':');
      const matchId = parts[1];
      const sport = parts[2] || 'soccer';
      const agg = services && services.sportsAggregator;
      if (!agg) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Service unavailable.' };
      try {
        const match = await agg.getMatchById(matchId, sport);
        if (!match) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Match not found.' };
        const home = match.home || match.home_team || match.homeName || 'Home';
        const away = match.away || match.away_team || match.awayName || 'Away';
        const score = (match.homeScore != null || match.awayScore != null) ? `${match.homeScore || 0}-${match.awayScore || 0}` : '';
        const text = `*${home}* vs *${away}*\n${score}\nProvider: ${match.provider || 'unknown'}`;
        return { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text, parse_mode: 'Markdown' };
      } catch (e) {
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Failed to load match details', show_alert: true };
      }
    }

    if (data.startsWith('odds:')) {
      const parts = data.split(':');
      const matchId = parts[1];
      const agg = services && services.sportsAggregator;
      if (!agg) return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Service unavailable.' };
      try {
        const odds = await agg.getOdds(matchId);
        const text = (odds && odds.length > 0) ? formatOdds(odds) : 'No odds available for this match.';
        return { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text, parse_mode: 'Markdown' };
      } catch (e) {
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Failed to load odds', show_alert: true };
      }
    }

    if (data.startsWith('menu_live_page') || data.startsWith('menu_live_refresh')) {
      try {
        const parts = data.split(':');
        const sport = parts[1] || 'soccer';
        const page = parseInt(parts[2], 10) || 1;
        const games = await getLiveMatchesBySport(sport, redis, services && services.sportsAggregator);
        const payload = buildLiveMenuPayload(games, sport.charAt(0).toUpperCase() + sport.slice(1), 'FREE', page, 6);
        if (cq && cq.message && typeof cq.message.message_id !== 'undefined') {
          return [
            { method: 'editMessageText', chat_id: chatId, message_id: cq.message.message_id, text: payload.text, reply_markup: payload.reply_markup, parse_mode: 'Markdown' },
            { method: 'answerCallbackQuery', callback_query_id: cq.id, text: '' }
          ];
        }
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unable to update message.' };
      } catch (e) {
        logger.warn('Failed to handle pagination', e?.message || String(e));
        return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unable to load page.' };
      }
    }

    return { method: 'answerCallbackQuery', callback_query_id: cq.id, text: 'Unknown action' };
  } catch (e) {
    logger.warn('handleCallbackQuery failed', e?.message || String(e));
    return null;
  }
}

export default {
  handleMessage,
  handleCallbackQuery
};

/**
 * Handle odds request
 */
async function handleOdds(chatId, userId, redis, services, query = {}) {
  try {
    const subscription = await getUserSubscription(redis, userId);

    // Check tier access
    if (subscription.tier === 'FREE' && query.isFree === false) {
      return {
        chat_id: chatId,
        text: formatUpgradePrompt('Advanced odds analysis'),
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👑 Upgrade to VVIP', callback_data: 'sub_upgrade_vvip' }],
            [{ text: '🔙 Back', callback_data: 'menu_main' }]
          ]
        }
      };
    }

    // Fetch odds from SportMonks/SportsData APIs
    let matchesRaw = [];
    
    // Try SportMonks first for premium odds data
    if (services.sportMonks && services.sportMonks.enabled) {
      try {
        const sport = query.sport || 'football';
        const liveMatches = await services.sportMonks.getLiveMatches(sport, 12).catch(() => []);
        matchesRaw = matchesRaw.concat(liveMatches || []);
        logger.info(`Fetched ${liveMatches?.length || 0} matches with odds from SportMonks`);
      } catch (e) {
        logger.warn('Failed to fetch odds from SportMonks', e.message);
      }
    }

    // Try SportsData.io for betting odds
    if (services.sportsData && services.sportsData.enabled && matchesRaw.length === 0) {
      try {
        const sport = query.sport || 'soccer';
        const oddsData = await services.sportsData.getBettingOdds(sport).catch(() => []);
        matchesRaw = matchesRaw.concat(oddsData || []);
        logger.info(`Fetched ${oddsData?.length || 0} games with betting odds from SportsData`);
      } catch (e) {
        logger.warn('Failed to fetch odds from SportsData', e.message);
      }
    }

    // Fall back to footballData service
    if (services.footballData && matchesRaw.length === 0) {
      try {
        const fd = await services.footballData.fixturesFromCsv(query.comp || 'E0', query.season || String(new Date().getFullYear()));
        matchesRaw = (fd && fd.fixtures) ? fd.fixtures.slice(0, 12) : [];
      } catch (e) {
        logger.warn('Failed to fetch odds from footballData', e);
      }
    }

    const matches = matchesRaw.map(m => {
      if (!m) return { home: 'Home', away: 'Away', homeOdds: '-', drawOdds: '-', awayOdds: '-' };
      if (m.fixture || m.teams || m.league) return normalizeApiFootballFixture(m);
      if (m.homeTeam || m.homeTeamName || m.home_team || m.away_team || m.eventName) return normalizeAllSportsMatch(m);
      if (m.homeScore !== undefined || m.homeTeam || m.awayTeam || m.matchId || m.score) return normalizeSportsDataEvent(m);
      return normalizeFootballDataFixture(m);
    }).slice(0, 8);

    // Demo fallback only if no real data
    let finalMatches = matches;
    if ((finalMatches == null || finalMatches.length === 0)) {
      finalMatches = [
        { home: 'Arsenal', away: 'Chelsea', homeOdds: '1.85', drawOdds: '3.40', awayOdds: '4.20' },
        { home: 'Manchester United', away: 'Liverpool', homeOdds: '2.10', drawOdds: '3.10', awayOdds: '3.60' },
        { home: 'Tottenham', away: 'Newcastle', homeOdds: '1.65', drawOdds: '3.80', awayOdds: '5.50' },
        { home: 'Brighton', away: 'Fulham', homeOdds: '1.95', drawOdds: '3.30', awayOdds: '3.90' }
      ];
    }

    const response = formatOdds(finalMatches);
    const header = brandingUtils.generateBetrixHeader(subscription.tier);
    const footer = brandingUtils.generateBetrixFooter(false, 'Tap a match to place a bet');
    const fullText = `${header}\n\n📊 *Current Odds*\n\n${response}${footer}`;

    return {
      chat_id: chatId,
      text: fullText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚽ Live Games', callback_data: 'menu_live' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Odds handler error', err);
    const errorMsg = brandingUtils.formatBetrixError({ type: 'connection', message: err.message }, 'FREE');
    return {
      chat_id: chatId,
      text: errorMsg,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle standings request
 */
async function handleStandings(chatId, userId, redis, services, query = {}) {
  try {
    const { openLiga, sportMonks, sportsData } = services;

    let standingsRaw = [];
    
    // Try SportMonks for standings data
    if (sportMonks && sportMonks.enabled) {
      try {
        const leagueId = query.leagueId || 501; // Premier League default
        const standings = await sportMonks.getStandings(leagueId).catch(() => []);
        standingsRaw = standingsRaw.concat(standings || []);
        logger.info(`Fetched standings from SportMonks (league: ${leagueId})`);
      } catch (e) {
        logger.warn('Failed to fetch standings from SportMonks', e.message);
      }
    }

    // Try SportsData.io for alternative standings
    if (sportsData && sportsData.enabled && standingsRaw.length === 0) {
      try {
        const competitionId = query.competitionId || 1; // Default competition ID
        const standings = await sportsData.getStandings(competitionId).catch(() => []);
        standingsRaw = standingsRaw.concat(standings || []);
        logger.info(`Fetched standings from SportsData (competition: ${competitionId})`);
      } catch (e) {
        logger.warn('Failed to fetch standings from SportsData', e.message);
      }
    }

    // Fall back to OpenLiga
    if (openLiga && standingsRaw.length === 0) {
      try {
        const league = query.league || 'BL1';
        standingsRaw = await openLiga.getStandings(league) || [];
      } catch (e) {
        logger.warn('Failed to fetch standings from openLiga', e);
      }
    }

    const standings = normalizeStandingsOpenLiga(standingsRaw || []);
    
    // Only use demo if absolutely no data
    const finalStandings = (standings && standings.length) ? standings : [
      { name: 'Manchester City', played: 30, won: 24, drawn: 4, lost: 2, goalDiff: 58, points: 76 },
      { name: 'Arsenal', played: 30, won: 22, drawn: 4, lost: 4, goalDiff: 48, points: 70 },
      { name: 'Liverpool', played: 30, won: 20, drawn: 6, lost: 4, goalDiff: 42, points: 66 },
      { name: 'Manchester United', played: 30, won: 18, drawn: 5, lost: 7, goalDiff: 28, points: 59 },
      { name: 'Newcastle United', played: 30, won: 17, drawn: 6, lost: 7, goalDiff: 25, points: 57 }
    ];

    const response = formatStandings(query.league || 'Premier League', finalStandings);
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    const header = brandingUtils.generateBetrixHeader(subscription.tier);
    const footer = brandingUtils.generateBetrixFooter(false, 'Current season standings');
    const fullText = `${header}\n\n🏆 *League Standings*\n\n${response}${footer}`;

    return {
      chat_id: chatId,
      text: fullText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Odds', callback_data: 'menu_odds' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Standings handler error', err);
    const errorMsg = brandingUtils.formatBetrixError({ type: 'connection', message: err.message }, 'FREE');
    return {
      chat_id: chatId,
      text: errorMsg,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle news request
 */
async function handleNews(chatId, userId, redis, services, query = {}) {
  try {
    const { rss } = services;

    let articles = [];
    if (rss) {
      try {
        const feeds = [
          'https://feeds.bbci.co.uk/sport/football/rss.xml',
          'https://www.theguardian.com/football/rss'
        ];
        const result = await rss.fetchMultiple(feeds);
        articles = result.slice(0, 8);
      } catch (e) {
        logger.warn('Failed to fetch news', e);
      }
    }

    // Get subscription for branding
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    const header = brandingUtils.generateBetrixHeader(subscription.tier);

    // Build rich article display with branding
    let newsText = `${header}\n\n📰 *Latest Football News*\n`;
    
    if (articles && articles.length > 0) {
      newsText += articles.slice(0, 5).map((article, i) => {
        const title = (article.title || 'Untitled').substring(0, 60);
        const summary = (article.description || article.summary || '').substring(0, 100).trim();
        const source = article.source || article.author || 'News Source';
        const date = article.pubDate || article.published || 'Recently';
        return `${i + 1}. *${title}*\n_${source}_ • ${date}\n${summary}${summary ? '...' : ''}`;
      }).join('\n\n');
    } else {
      newsText += '_Loading latest headlines..._';
    }

    const footer = brandingUtils.generateBetrixFooter(false, 'Tap to read full article');
    const fullText = `${newsText}${footer}`;

    // Build keyboard with article links or refresh button
    const keyboard = [];
    if (articles && articles.length > 0) {
      articles.slice(0, 3).forEach((article, i) => {
        if (article.link) {
          keyboard.push([
            { text: `📖 Read Article ${i + 1}`, url: article.link }
          ]);
        }
      });
    }
    
    keyboard.push([
      { text: '🔄 Refresh', callback_data: 'menu_news' },
      { text: '🔙 Back', callback_data: 'menu_main' }
    ]);

    return {
      chat_id: chatId,
      text: fullText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    };
  } catch (err) {
    logger.error('News handler error', err);
    const errorMsg = brandingUtils.formatBetrixError({ type: 'connection', message: err.message }, 'FREE');
    return {
      chat_id: chatId,
      text: errorMsg,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle profile request
 */
async function handleProfile(chatId, userId, redis, services) {
  try {
    const user = await safeGetUserData(redis, `user:${userId}`);
    const subscription = await getUserSubscription(redis, userId);

    const profileData = {
      name: (user && user.name) || 'BETRIX User',
      tier: subscription.tier,
      joinDate: (user && user.joinDate) || new Date().toLocaleDateString(),
      predictions: (user && user.predictions) || 0,
      winRate: (user && user.winRate) || 0,
      points: (user && user.points) || 0,
      referralCode: userId.toString(36).toUpperCase(),
      referrals: (user && user.referrals) || 0,
      bonusPoints: (user && user.bonusPoints) || 0,
      nextTier: subscription.tier === 'FREE' ? 'PRO' : 'VVIP'
    };

    const response = formatProfile(profileData);

    return {
      chat_id: chatId,
      text: response + `\n\n${formatSubscriptionDetails(subscription)}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👑 Upgrade', callback_data: 'sub_upgrade_vvip' }],
          [{ text: '🔙 Main Menu', callback_data: 'menu_main' }]
        ]
      }
    };
  } catch (err) {
    logger.error('Profile handler error', err);
    return {
      chat_id: chatId,
      text: '🌀 *BETRIX* - Unable to load profile.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle generic AI response
 */
async function handleGenericAI(text, chatId, userId, redis, services) {
  try {
    const { aiChain } = services;

    if (!aiChain) {
      return {
        chat_id: chatId,
        text: `🌀 *BETRIX* - Sorry, I couldn't understand that. Try:\n/live\n/odds\n/standings\n/news`,
        parse_mode: 'Markdown'
      };
    }

    // Get AI response
    const response = await aiChain.analyze({
      userId,
      query: text,
      context: 'sports_betting'
    });

    return {
      chat_id: chatId,
      text: formatNaturalResponse(response || 'Unable to analyze this request.'),
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('AI handler error', err);
    return {
      chat_id: chatId,
      text: `🌀 *BETRIX* - ${err.message || 'Unable to process your request.'}`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle callback queries (button clicks)
 */
export async function handleCallbackQuery(callbackQuery, redis, services) {
  try {
    const { id: cbId, from: { id: userId }, data } = callbackQuery;
    const chatId = callbackQuery.message.chat.id;

    logger.info('Callback query', { userId, data });

    // Telemetry: incoming callback_data length / suspicious patterns
    try {
      if (data && data.length > 64) {
        if (redis && typeof redis.incr === 'function') {
          await redis.incr('betrix:telemetry:callback_incoming_too_long');
          await redis.lpush('betrix:telemetry:callback_incoming_samples', data.substring(0, 256)).catch(() => {});
          await redis.ltrim('betrix:telemetry:callback_incoming_samples', 0, 200).catch(() => {});
          await redis.expire('betrix:telemetry:callback_incoming_samples', 60 * 60 * 24).catch(() => {});
        }
      }
      // detect repeated 'odds_' pattern which previously caused corruption
      const repOdds = /(odds_){3,}/i.test(data || '');
      if (repOdds && redis && typeof redis.incr === 'function') {
        await redis.incr('betrix:telemetry:callback_repetition_odds');
      }
    } catch (e) {
      logger.warn('Callback telemetry write failed', e?.message || e);
    }

    // Route callback
    if (data === 'menu_live') {
      // Special case: menu_live should show live matches, not sport selection
      return handleLiveMenuCallback(chatId, userId, redis, services);
    }

    if (data.startsWith('menu_')) {
      return handleMenuCallback(data, chatId, userId, redis);
    }

    if (data === 'signup_start') {
      return startOnboarding(chatId, userId, redis);
    }

    if (data.startsWith('sport_')) {
      return handleSportCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('sub_')) {
      return handleSubscriptionCallback(data, chatId, userId, redis, services);
    }

    if (data === 'vvip_fixed') {
      return handleVvipFixedMatches(chatId, userId, redis, services);
    }

    if (data === 'vvip_advanced') {
      return handleVvipAdvancedInfo(chatId, userId, redis, services);
    }

    if (data.startsWith('profile_')) {
      return handleProfileCallback(data, chatId, userId, redis);
    }

    if (data.startsWith('help_')) {
      return handleHelpCallback(data, chatId, userId, redis);
    }

    // Check more specific patterns BEFORE generic ones to avoid prefix collision
    if (data.startsWith('league_live_')) {
      return handleLeagueLiveCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('league_odds_')) {
      return handleLeagueOddsCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('league_standings_')) {
      return handleLeagueStandingsCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('league_')) {
      return handleLeagueCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('analyze_match_')) {
      return handleAnalyzeMatch(data, chatId, userId, redis, services);
    }

    if (data.startsWith('match_')) {
      return handleMatchCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('fav_view_')) {
      return handleFavoriteView(data, chatId, userId, redis, services);
    }
    // signup country selection
    if (data.startsWith('signup_country_')) {
      return handleSignupCountry(data, chatId, userId, redis, services);
    }

    // signup payment method selection
    if (data.startsWith('signup_paymethod_')) {
      return handleSignupPaymentMethodSelection(data, chatId, userId, redis, services);
    }

    if (data.startsWith('signup_pay_')) {
      return handleSignupPaymentCallback(data, chatId, userId, redis, services);
    }

    if (data.startsWith('fav_')) {
      return handleFavoriteCallback(data, chatId, userId, redis);
    }

    // Handle payment verification
    if (data.startsWith('verify_payment_')) {
      return handlePaymentVerification(data, chatId, userId, redis);
    }

    // Handle payment help/guide request
    if (data.startsWith('payment_help_')) {
      return handlePaymentHelp(data, chatId, userId, redis);
    }

    // Handle payment method selection with tier
    if (data.startsWith('pay_')) {
      return handlePaymentMethodSelection(data, chatId, userId, redis, services);
    }

    // Handle quick bet start
    if (data.startsWith('bet_fixture_')) {
      return handleBetCreate(data, chatId, userId, redis, services);
    }

    // Handle bet placement confirmation
    if (data.startsWith('place_bet_')) {
      return handlePlaceBet(data, chatId, userId, redis, services);
    }
    
    // Handle bet stake edit selection
    if (data.startsWith('edit_bet_')) {
      return handleEditBet(data, chatId, userId, redis);
    }

    // Handle stake set callbacks: set_bet_{betId}_{amount}
    if (data.startsWith('set_bet_')) {
      return handleSetBetStake(data, chatId, userId, redis);
    }

    // Acknowledge callback
    return {
      method: 'answerCallbackQuery',
      callback_query_id: cbId
    };
  } catch (err) {
    logger.error('Callback query error', err);
    return null;
  }
}

/**
 * Handle menu callbacks
 */
async function handleMenuCallback(data, chatId, userId, redis) {
  // 🎯 USE INTELLIGENT MENU BUILDER FOR DYNAMIC MENUS
  try {
    // Get user's subscription tier and data
    const userSubscription = await getUserSubscription(redis, userId);
    const userData = await safeGetUserData(redis, `user:${userId}`) || {};
    const tier = userSubscription.tier || 'FREE';
    
    // Instantiate intelligent menu builder
    const menuBuilder = new intelligentMenus(redis);
    
    // Build contextual menu based on data type
    let menu = mainMenu; // Default fallback
    
    if (data === 'menu_main') {
      const mainMenuResult = await menuBuilder.buildContextualMainMenu(userId, userData);
      menu = mainMenuResult || mainMenu;
    } else if (data === 'menu_live') {
      const liveMenu = await menuBuilder.buildMatchDetailMenu(userId);
      menu = liveMenu || { text: 'Select a sport for live games:', reply_markup: sportsMenu.reply_markup };
    } else if (data === 'menu_odds') {
      menu = { text: '📊 *Quick Odds*\n\nSelect a league to view current odds:', reply_markup: sportsMenu.reply_markup };
    } else if (data === 'menu_standings') {
      menu = { text: '🏆 *League Standings*\n\nSelect a league to view standings:', reply_markup: sportsMenu.reply_markup };
    } else if (data === 'menu_news') {
      menu = { text: '📰 *Latest News*\n\nLoading latest sports news...', reply_markup: mainMenu.reply_markup };
    } else if (data === 'menu_profile') {
      menu = { text: `👤 *Your Profile*\n\n*Name:* ${userData.name || 'BETRIX User'}\n*Tier:* ${tier}\n*Points:* ${userData.points || 0}`, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]] } };
    } else if (data === 'menu_vvip') {
      menu = subscriptionMenu;
    } else if (data === 'menu_help') {
      menu = helpMenu;
    }

    if (!menu) return null;

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: menu.text || menu,
      reply_markup: menu.reply_markup,
      parse_mode: 'Markdown'
    };
  } catch (e) {
    logger.warn('Premium menu builder failed, using fallback', e.message);
    
    // Fallback to original menu system
    const menuMap = {
      'menu_main': mainMenu,
      'menu_live': { text: 'Select a sport for live games:', reply_markup: sportsMenu.reply_markup },
      'menu_odds': { text: 'Loading odds...', reply_markup: sportsMenu.reply_markup },
      'menu_standings': { text: 'Select a league for standings:', reply_markup: sportsMenu.reply_markup },
      'menu_news': { text: 'Loading latest news...', reply_markup: mainMenu.reply_markup },
      'menu_profile': profileMenu,
      'menu_vvip': subscriptionMenu,
      'menu_help': helpMenu
    };

    const menu = menuMap[data];
    if (!menu) return null;

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: menu.text,
      reply_markup: menu.reply_markup,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle "Live Games" menu - show live matches across popular leagues
 */
async function handleLiveMenuCallback(chatId, userId, redis, services) {
  try {
    let allLiveMatches = [];
    const popularLeagues = ['39', '140', '135', '61', '78', '2', '3']; // Popular football leagues

    // Fetch live matches from popular leagues in parallel
    if (services && services.sportsAggregator) {
      try {
        const matchesPerLeague = await Promise.all(
          popularLeagues.map(lid => 
            services.sportsAggregator.getLiveMatches(lid).catch(() => [])
          )
        );
        allLiveMatches = matchesPerLeague.flat();
      } catch (e) {
        logger.warn('Failed to fetch live matches across leagues', e);
      }

      // Also try to fetch from prefetch cache for all sports (not just soccer/football)
      if (!allLiveMatches || allLiveMatches.length === 0) {
        try {
          logger.info('Trying prefetch cache for live matches across sports...');
          const cachedData = await redis.get('betrix:prefetch:live:by-sport').catch(() => null);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            // Combine samples from all sports
            allLiveMatches = Object.values(parsed.sports || {})
              .flatMap(s => s.samples || [])
              .filter(m => m && m.home && m.away);
            logger.info(`Found ${allLiveMatches.length} matches from prefetch cache`);
          }
        } catch (e) {
          logger.debug('Prefetch cache fetch failed', e?.message);
        }
      }
    }

    // If no live matches found, show message with fallback to league selection
    if (!allLiveMatches || allLiveMatches.length === 0) {
      const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
      const header = brandingUtils.generateBetrixHeader(subscription.tier);
      const noMatchText = `${header}\n\n🔴 *No Live Matches Right Now*\n\nNo games are currently live. Would you like to browse by league instead?`;
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: noMatchText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⚽ Browse by League', callback_data: 'sport_football' },
              { text: '🔙 Back', callback_data: 'menu_main' }
            ]
          ]
        }
      };
    }

    // Get subscription for branding
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    const header = brandingUtils.generateBetrixHeader(subscription.tier);
    const footer = brandingUtils.generateBetrixFooter(false, 'Click a match to view odds and analysis');

    // Limit to top 10 live matches and build a safer, branded display
    const limited = allLiveMatches.slice(0, 10);

    const matchText = limited.map((m, i) => {
      let home = teamNameOf(m.home);
      let away = teamNameOf(m.away);
      
      // Extra fallback: if home/away are still "Unknown" or defaults, try to extract from raw data
      if ((home === 'Home' || home === 'Unknown' || !home) && m.raw) {
        home = teamNameOf(m.raw.homeTeam) || teamNameOf(m.raw.home_team) || 
               teamNameOf(m.raw.teams?.home) || teamNameOf(m.raw.main_team) || 'Home';
      }
      if ((away === 'Away' || away === 'Unknown' || !away) && m.raw) {
        away = teamNameOf(m.raw.awayTeam) || teamNameOf(m.raw.away_team) || 
               teamNameOf(m.raw.teams?.away) || teamNameOf(m.raw.visitor_team) || 'Away';
      }
      
      const score = (typeof m.homeScore === 'number' && typeof m.awayScore === 'number') ? `${m.homeScore}-${m.awayScore}` : '─';
      const status = (String(m.status || '').toUpperCase() === 'LIVE') ? `🔴 ${m.time || 'LIVE'}` : `⏱ ${m.time || m.status || 'TBD'}`;
      const league = m.league || m.competition || '';
      return `${i + 1}. *${home}* vs *${away}*\n   ${score} ${status} ${league ? `[${league}]` : ''}`;
    }).join('\n\n');

    // Build keyboard - one button per match for quick viewing with safe callback ids
    const keyboard = limited.map((m, i) => {
      let home = teamNameOf(m.home);
      let away = teamNameOf(m.away);
      
      // Same fallback for keyboard labels
      if ((home === 'Home' || home === 'Unknown' || !home) && m.raw) {
        home = teamNameOf(m.raw.homeTeam) || teamNameOf(m.raw.home_team) || 
               teamNameOf(m.raw.teams?.home) || teamNameOf(m.raw.main_team) || 'Home';
      }
      if ((away === 'Away' || away === 'Unknown' || !away) && m.raw) {
        away = teamNameOf(m.raw.awayTeam) || teamNameOf(m.raw.away_team) || 
               teamNameOf(m.raw.teams?.away) || teamNameOf(m.raw.visitor_team) || 'Away';
      }
      
      const label = `${i + 1}. ${home} vs ${away}`.substring(0, 64);
      const provider = (m.provider || 'p').toString().replace(/[^a-zA-Z0-9_-]/g, '');
      const mid = m.id || m.fixture?.id || i;
      const cb = validateCallbackData(`match_live_${provider}_${mid}`);
      return [{ text: label, callback_data: cb }];
    });

    keyboard.push([
      { text: '⚽ Browse by League', callback_data: 'sport_football' },
      { text: '🔙 Back', callback_data: 'menu_main' }
    ]);

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `${header}\n\n🏟️ *Live Matches Now*\n\n${matchText}${footer}`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.error('Live menu handler error', err);
    const errorMsg = brandingUtils.formatBetrixError({ type: 'connection', message: err.message }, 'FREE');
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: errorMsg,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]]
      }
    };
  }
}

async function handleLeagueCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_', '') || null;
  
  try {
    // Get league name from mapping
    const leagueMap = {
      '39': 'Premier League',
      '140': 'La Liga',
      '135': 'Serie A',
      '61': 'Ligue 1',
      '78': 'Bundesliga',
      '2': 'Champions League',
      '3': 'Europa League'
    };
    const leagueName = leagueMap[leagueId] || `League ${leagueId}`;

    // 🎯 USE INTELLIGENT MENU BUILDER FOR LEAGUE MENU
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    // IntelligentMenuBuilder is exported as a class - instantiate with Redis
    const menuBuilder = new intelligentMenus(redis);
    const leagueMenu = await menuBuilder.buildMatchDetailMenu(leagueName, subscription.tier, leagueId);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: leagueMenu.text || `📊 *${leagueName}*\n\nWhat would you like to see?`,
      parse_mode: 'Markdown',
      reply_markup: leagueMenu.reply_markup || {
        inline_keyboard: [
          [
            { text: '🔴 Live Now', callback_data: validateCallbackData(`league_live_${leagueId}`) },
            { text: '📈 Odds', callback_data: validateCallbackData(`league_odds_${leagueId}`) }
          ],
          [
            { text: '📊 Table', callback_data: validateCallbackData(`league_standings_${leagueId}`) }
          ],
          [
            { text: '🔙 Back', callback_data: 'menu_live' }
          ]
        ]
      }
    };
  } catch (err) {
    logger.error('League callback error', err);
    return null;
  }
}

/**
 * Handle live matches for a league
 */
async function handleLeagueLiveCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_live_', '');
  
  try {
    let matches = [];
    if (services && services.sportsAggregator) {
      try {
        // 🎯 USE FIXTURES MANAGER TO GET LEAGUE FIXTURES
        try {
          const fm = new fixturesManager(redis);
          matches = await fm.getLeagueFixtures(leagueId);
        } catch (e) {
          logger.warn('Fixtures manager failed, using aggregator', e.message);
          matches = await services.sportsAggregator.getLiveMatches(leagueId);
        }
      } catch (e) {
        logger.warn('Failed to fetch live matches', e);
      }
    }

    if (!matches || matches.length === 0) {
      const errorText = formatBetrixError('no_matches', 'No live matches right now');
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: errorText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: `league_${leagueId}` }]]
        }
      };
    }

    // 🎯 USE PREMIUM UI BUILDER FOR MATCH CARDS
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    const limited = matches.slice(0, 5);
    
    // Build match cards with premium formatting
    const matchCards = limited.map((m, i) => premiumUI.buildMatchCard(m, subscription.tier, leagueId, i)).join('\n\n');
    
    const header = brandingUtils.generateBetrixHeader(subscription.tier);
    const matchText = `${header}\n\n🏟️ *Live Matches*\n\n${matchCards}`;

    // Build keyboard with analysis and favorite buttons
    const keyboard = limited.map((m, i) => {
      const homeLabel = teamNameOf(m.home);
      const awayLabel = teamNameOf(m.away);
      const homeKey = encodeURIComponent(homeLabel);
      return [
        { text: `🔎 Analyze ${i + 1}`, callback_data: validateCallbackData(`analyze_match_${leagueId}_${i}`) },
        { text: `⭐ ${homeLabel.split(' ')[0]}`, callback_data: validateCallbackData(`fav_add_${homeKey}`) }
      ];
    });

    // also allow favoriting away team
    limited.forEach((m, i) => {
      const awayLabel = teamNameOf(m.away);
      const awayKey = encodeURIComponent(awayLabel);
      keyboard.push([
        { text: `⭐ Fav ${awayLabel.split(' ')[0]}`, callback_data: validateCallbackData(`fav_add_${awayKey}`) },
        { text: `🔁 Odds ${i + 1}`, callback_data: validateCallbackData(`league_odds_${leagueId}`) }
      ]);
    });

    keyboard.push([{ text: '🔙 Back', callback_data: validateCallbackData(`league_${leagueId}`) }]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🏟️ *Live Matches*\n\n${matchText}\n\n_Tap Details or add teams to your favorites for quick access._`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.error('Live matches handler error', err);
    return null;
  }
}

/**
 * Show match details and actions for a specific live match index
 * Supports two formats:
 * - match_{leagueId}_{index}: for league-specific live matches
 * - match_live_{index}: for global live matches from handleLiveMenuCallback
 */
async function handleMatchCallback(data, chatId, userId, redis, services) {
  try {
    const parts = data.split('_');
    let leagueId = null;
    let idx = 0;
    let allLiveMatches = [];

    // Determine format: match_live_X or match_leagueId_X
    if (parts[1] === 'live') {
      // Format: match_live_{index}
      idx = Number(parts[2] || 0);
      // Fetch all live matches from popular leagues
      const popularLeagues = ['39', '140', '135', '61', '78', '2', '3'];
      if (services && services.sportsAggregator) {
        try {
          const matchesPerLeague = await Promise.all(
            popularLeagues.map(lid => 
              services.sportsAggregator.getLiveMatches(lid).catch(() => [])
            )
          );
          allLiveMatches = matchesPerLeague.flat();
        } catch (e) {
          logger.warn('Failed to fetch all live matches', e);
        }
      }
    } else {
      // Format: match_{leagueId}_{index}
      leagueId = parts[1] || null;
      idx = Number(parts[2] || 0);
      if (services && services.sportsAggregator) {
        try {
          allLiveMatches = await services.sportsAggregator.getLiveMatches(leagueId);
        } catch (e) {
          logger.warn('Failed to fetch live matches for match details', e);
        }
      }
    }

    if (!allLiveMatches || allLiveMatches.length === 0 || !allLiveMatches[idx]) {
      return { method: 'answerCallbackQuery', callback_query_id: undefined, text: 'Match details unavailable', show_alert: true };
    }

    const m = allLiveMatches[idx];
    const score = (m.homeScore != null && m.awayScore != null) ? `${m.homeScore}-${m.awayScore}` : (m.score || 'N/A');
    const live = m.liveStats || {};
    const time = m.time || m.minute || live.minute || m.status || live.status || 'N/A';
    const homeOdds = m.homeOdds || m.odds?.home || '-';
    const awayOdds = m.awayOdds || m.odds?.away || '-';
    const drawOdds = m.drawOdds || m.odds?.draw || '-';

    let text = `🏟️ *Match Details*\n\n*${m.home}* vs *${m.away}*\n`;
    text += `• Score: ${score}\n• Time: ${time}\n`;
    text += `• Odds: Home ${homeOdds} • Draw ${drawOdds} • Away ${awayOdds}\n`;
    // prefer liveStats where available
    if (m.possession) {
      text += `• Possession: ${m.possession}\n`;
    } else if (live.stats) {
      // try to find possession-like stat
      try {
        const poss = Object.values(live.stats).map(a => a.find(s => /possess/i.test(s.label))).filter(Boolean)[0];
        if (poss && poss.value) text += `• Possession: ${poss.value}\n`;
      } catch (e) { /* ignore */ }
    }

    if (m.stats && Array.isArray(m.stats)) {
      text += `• Key: ${m.stats.join(' • ')}\n`;
    } else if (live.stats) {
      // flatten some key stats if available
      try {
        const all = [];
        Object.keys(live.stats).forEach(k => {
          const arr = live.stats[k] || [];
          arr.slice(0,3).forEach(s => all.push(`${s.label}: ${s.value}`));
        });
        if (all.length > 0) text += `• Key: ${all.join(' • ')}\n`;
      } catch (e) { /* ignore */ }
    }

    // Build back button based on format
    let backData = 'menu_live';
    if (leagueId) {
      backData = validateCallbackData(`league_live_${leagueId}`);
    }

    const homeLabel = teamNameOf(m.home);
    const awayLabel = teamNameOf(m.away);
    const homeKey = encodeURIComponent(homeLabel);
    const awayKey = encodeURIComponent(awayLabel);

    const keyboard = [
      [{ text: '🤖 Analyze Match', callback_data: validateCallbackData(`analyze_match_${leagueId || 'live'}_${idx}`) }],
      [{ text: `⭐ Fav ${homeLabel.split(' ')[0]}`, callback_data: validateCallbackData(`fav_add_${homeKey}`) }, { text: `⭐ Fav ${awayLabel.split(' ')[0]}`, callback_data: validateCallbackData(`fav_add_${awayKey}`) }],
      [{ text: '📊 View Odds', callback_data: validateCallbackData(leagueId ? `league_odds_${leagueId}` : 'menu_odds') }],
      [{ text: '🔙 Back', callback_data: backData }]
    ];

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (e) {
    logger.error('handleMatchCallback error', e);
    return { method: 'answerCallbackQuery', callback_query_id: undefined, text: 'Failed to load match details', show_alert: true };
  }
}

/**
 * Analyze a match using premium analysis and UI modules
 * callback: analyze_match_{leagueId}_{index}
 */
async function handleAnalyzeMatch(data, chatId, userId, redis, services) {
  try {
    const parts = data.split('_');
    const leagueId = parts[2] || null;
    const idx = Number(parts[3] || 0);

    if (!services || !services.sportsAggregator) {
      const errorText = brandingUtils.formatBetrixError('service_error', 'Analysis service unavailable');
      return { method: 'sendMessage', chat_id: chatId, text: errorText, parse_mode: 'Markdown' };
    }

    const matches = await services.sportsAggregator.getLiveMatches(leagueId).catch(() => []);
    const m = matches && matches[idx] ? matches[idx] : null;
    if (!m) {
      const errorText = brandingUtils.formatBetrixError('not_found', 'Match not found for analysis');
      return { method: 'sendMessage', chat_id: chatId, text: errorText, parse_mode: 'Markdown' };
    }

    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    
    try {
      const home = m.home || m.homeTeam || m.home_name || m.teams?.home || 'Home';
      const away = m.away || m.awayTeam || m.away_name || m.teams?.away || 'Away';

      // 🎯 USE PREMIUM ANALYSIS MODULE
      const analysis = await advancedAnalysis.analyzeMatch(m, {}, {});
      
      // Build header with BETRIX branding
      const header = brandingUtils.generateBetrixHeader(subscription.tier);
      
      // 🎯 USE PREMIUM UI BUILDER
      const betAnalysis = premiumUI.buildBetAnalysis(analysis, subscription.tier);
      
      // Build action buttons based on subscription
      const actionButtons = premiumUI.buildMatchActionButtons(subscription.tier, leagueId, idx);
      
      // Build complete response with branding
      let formatted = `${header}\n\n`;
      formatted += `⚽ *${home}* vs *${away}*\n`;
      formatted += `Score: ${m.score || 'N/A'} | Time: ${m.time || 'N/A'}\n\n`;
      formatted += betAnalysis;
      formatted += `\n\n${actionButtons}`;
      formatted += `\n\n${brandingUtils.generateBetrixFooter()}`;

      // Upgrade prompt for FREE tier if analysis is premium
      if (subscription.tier === 'FREE' && analysis.confidence > 75) {
        formatted += `\n\n_💎 Premium predictions limited. Upgrade to PRO for full analysis._`;
      }

      return { method: 'sendMessage', chat_id: chatId, text: formatted, parse_mode: 'Markdown' };
    } catch (e) {
      logger.warn('Premium analysis failed, using multiSportAnalyzer fallback', e.message);
      
      // Fallback to existing multiSportAnalyzer if available
      if (services.multiSportAnalyzer && typeof services.multiSportAnalyzer.analyzeMatch === 'function') {
        try {
          const sport = m.sport || m.sportKey || 'football';
          const home = m.home || m.homeTeam || m.home_name || m.teams?.home || 'Home';
          const away = m.away || m.awayTeam || m.away_name || m.teams?.away || 'Away';
          
          const analysis = await services.multiSportAnalyzer.analyzeMatch(sport, home, away, leagueId);
          let formatted = services.multiSportAnalyzer.formatForTelegram ? 
            services.multiSportAnalyzer.formatForTelegram(analysis) : 
            JSON.stringify(analysis, null, 2);
          
          return { method: 'sendMessage', chat_id: chatId, text: formatted, parse_mode: 'Markdown' };
        } catch (innerE) {
          logger.warn('MultiSportAnalyzer also failed', innerE.message);
        }
      }
      
      // Last resort fallback
      const summary = `🤖 *Match Analysis*\n\n*${m.home}* vs *${m.away}*\nScore: ${m.score || 'N/A'}\nTime: ${m.time || 'N/A'}\n\n_Analysis service temporarily unavailable._`;
      return { method: 'sendMessage', chat_id: chatId, text: summary, parse_mode: 'Markdown' };
    }
  } catch (e) {
    logger.error('handleAnalyzeMatch error', e);
    const errorText = formatBetrixError('unexpected', 'Failed to analyze match');
    return { method: 'sendMessage', chat_id: chatId, text: errorText, parse_mode: 'Markdown' };
  }
}

/**
 * Show fixtures or quick info for a favorite team (fav_view_{team})
 */
async function handleFavoriteView(data, chatId, userId, redis, services) {
  try {
    const team = decodeURIComponent(data.replace('fav_view_', ''));

    // Try to fetch upcoming fixtures from sportsAggregator if available
    if (services && services.sportsAggregator && typeof services.sportsAggregator.getTeamFixtures === 'function') {
      try {
        const fixtures = await services.sportsAggregator.getTeamFixtures(team);
        if (fixtures && fixtures.length > 0) {
          const list = fixtures.slice(0, 6).map((f, i) => `• ${f.home} vs ${f.away} — ${f.date || f.time || 'TBD'}`).join('\n');
          return {
            method: 'sendMessage',
            chat_id: chatId,
            text: `📌 *Upcoming for ${team}*\n\n${list}`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'profile_favorites' }]] }
          };
        }
      } catch (e) {
        logger.warn('Failed to fetch team fixtures', { team, e });
      }
    }

    // Fallback: search live matches for team name
    if (services && services.sportsAggregator && typeof services.sportsAggregator.getLiveMatches === 'function') {
      try {
        const allLive = await services.sportsAggregator.getLiveMatches();
        const matches = (allLive || []).filter(m => (m.home && m.home.toLowerCase().includes(team.toLowerCase())) || (m.away && m.away.toLowerCase().includes(team.toLowerCase()))).slice(0, 6);
        if (matches.length > 0) {
          const list = matches.map((m, i) => `• ${m.home} vs ${m.away} — ${m.time || m.status || 'LIVE'}`).join('\n');
          return {
            method: 'sendMessage',
            chat_id: chatId,
            text: `🔴 *Live / Recent for ${team}*\n\n${list}`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'profile_favorites' }]] }
          };
        }
      } catch (e) {
        logger.warn('Failed to search live matches for team', { team, e });
      }
    }

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `📌 No fixtures or live matches found for *${team}* right now.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'profile_favorites' }]] }
    };
  } catch (e) {
    logger.error('handleFavoriteView error', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to fetch team info.', parse_mode: 'Markdown' };
  }
}

/**
 * Return VVIP fixed matches (requires VVIP access)
 */
async function handleVvipFixedMatches(chatId, userId, redis, services) {
  try {
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    if (!subscription || (subscription.tier !== 'VVIP' && subscription.tier !== 'PLUS')) {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: '🔒 Fixed Matches are available for VVIP subscribers only. Upgrade to access.',
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '👑 Upgrade to VVIP', callback_data: 'menu_vvip' }, { text: '🔙 Back', callback_data: 'menu_main' }]] }
      };
    }

    if (!services || !services.multiSportAnalyzer || typeof services.multiSportAnalyzer.getFixedMatches !== 'function') {
      return { method: 'sendMessage', chat_id: chatId, text: 'Fixed matches service unavailable.', parse_mode: 'Markdown' };
    }

    const fixed = await services.multiSportAnalyzer.getFixedMatches().catch(() => []);
    if (!fixed || fixed.length === 0) {
      return { method: 'sendMessage', chat_id: chatId, text: 'No fixed matches available at the moment.', parse_mode: 'Markdown' };
    }

    let text = `👑 *VVIP Fixed Matches*\n\n`;
    fixed.slice(0, 8).forEach((f, i) => {
      text += `${i + 1}. *${f.home}* vs *${f.away}* — ${f.market} ${f.pick} (Confidence: ${f.confidence}% | Odds: ${f.odds})\n`;
      if (f.reason) text += `   • ${f.reason}\n`;
    });

    text += `\n⚠️ Fixed matches are curated for VVIP users. Bet responsibly.`;

    return { method: 'sendMessage', chat_id: chatId, text, parse_mode: 'Markdown' };
  } catch (e) {
    logger.error('handleVvipFixedMatches error', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to load fixed matches.', parse_mode: 'Markdown' };
  }
}

/**
 * Show info about advanced VVIP prediction markets and a CTA
 */
async function handleVvipAdvancedInfo(chatId, userId, redis, services) {
  try {
    const subscription = await getUserSubscription(redis, userId).catch(() => ({ tier: 'FREE' }));
    if (!subscription || (subscription.tier !== 'VVIP' && subscription.tier !== 'PLUS')) {
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: '🔒 Advanced HT/FT and Correct Score predictions are for VVIP users. Upgrade to access these markets.',
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '👑 Upgrade to VVIP', callback_data: 'menu_vvip' }, { text: '🔙 Back', callback_data: 'menu_main' }]] }
      };
    }

    const text = `👑 *VVIP Advanced Predictions*\n\nAs a VVIP member you get:\n• Half-time / Full-time probability lines (e.g., 1/X, X/1)\n• Correct score suggestions with confidence and implied odds\n• Curated fixed matches and high-confidence value bets\n\nTap *Fixed Matches* to view current curated picks or analyze a live match for HT/FT & correct score predictions.`;

    return { method: 'sendMessage', chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '👑 View Fixed Matches', callback_data: 'vvip_fixed' }, { text: '🔙 Back', callback_data: 'menu_main' }]] } };
  } catch (e) {
    logger.error('handleVvipAdvancedInfo error', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to load VVIP info.', parse_mode: 'Markdown' };
  }
}

/**
 * Handle odds for a league
 */
async function handleLeagueOddsCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_odds_', '');
  
  try {
    let odds = [];
    if (services && services.sportsAggregator) {
      try {
        odds = await services.sportsAggregator.getOdds(leagueId);
      } catch (e) {
        logger.warn('Failed to fetch odds', e);
      }
    }

    if (!odds || odds.length === 0) {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: '⏳ Odds not available.\n\nCheck back soon!',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: validateCallbackData(`league_${leagueId}`) }]]
        }
      };
    }

    // Format odds beautifully
    const oddsText = odds.slice(0, 5).map((m, i) => {
      const h = m.homeOdds || m.odds?.home || '─';
      const d = m.drawOdds || m.odds?.draw || '─';
      const a = m.awayOdds || m.odds?.away || '─';
      return `${i+1}. ${m.home} vs ${m.away}\n   🏠 ${h} • 🤝 ${d} • ✈️ ${a}`;
    }).join('\n\n');

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `💰 *Best Odds*\n\n${oddsText}\n\n_Compare bookmakers_`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: validateCallbackData(`league_${leagueId}`) }]]
      }
    };
  } catch (err) {
    logger.error('Odds handler error', err);
    return null;
  }
}

/**
 * Handle standings/table for a league
 */
async function handleLeagueStandingsCallback(data, chatId, userId, redis, services) {
  const leagueId = data.replace('league_standings_', '');
  
  try {
    let standings = [];
    if (services && services.sportsAggregator) {
      try {
        standings = await services.sportsAggregator.getStandings(leagueId);
      } catch (e) {
        logger.warn('Failed to fetch standings', e);
      }
    }

    if (!standings || standings.length === 0) {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: '⏳ Standings not available.\n\nCheck back soon!',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: validateCallbackData(`league_${leagueId}`) }]]
        }
      };
    }

    // Format standings beautifully (top 10)
    const tableText = standings.slice(0, 10).map((row, i) => {
      const pos = String(i + 1).padStart(2, ' ');
      const team = (row.team || row.Team || row.name || '?').substring(0, 15).padEnd(15);
      const pts = String(row.points || row.goalDifference || 0).padStart(3);
      return `${pos}. ${team} ${pts}`;
    }).join('\n');

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `📊 *League Table*\n\n\`\`\`\nPos Team           Pts\n${tableText}\n\`\`\``,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Back', callback_data: validateCallbackData(`league_${leagueId}`) }]]
      }
    };
  } catch (err) {
    logger.error('Standings handler error', err);
    return null;
  }
}

// Betslip helpers
// ----------------------
/**
 * Handle favorite add/remove callbacks
 */
async function handleFavoriteCallback(data, chatId, userId, redis) {
  try {
    if (data.startsWith('fav_add_')) {
      const teamName = decodeURIComponent(data.replace('fav_add_', ''));
      await redis.sadd(`user:${userId}:favorites`, teamName);
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: `⭐ Added ${teamName} to your favorites!`,
        show_alert: false
      };
    }

    if (data.startsWith('fav_remove_')) {
      const teamName = decodeURIComponent(data.replace('fav_remove_', ''));
      await redis.srem(`user:${userId}:favorites`, teamName);
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: `🗑 Removed ${teamName} from your favorites.`,
        show_alert: false
      };
    }

    return { method: 'answerCallbackQuery', callback_query_id: undefined, text: 'Unknown favorite action' };
  } catch (e) {
    logger.error('Favorite callback error', e);
    return { method: 'answerCallbackQuery', callback_query_id: undefined, text: 'Failed to update favorites', show_alert: true };
  }
}
async function createBetslip(redis, userId, fixtureId, fixtureText) {
  const id = `BETS${userId}${Date.now()}`;
  const bet = {
    id,
    userId,
    fixtureId,
    fixtureText,
    stake: 100,
    selection: 'home',
    createdAt: new Date().toISOString()
  };
  // store for 1 hour
  await redis.setex(`betslip:${id}`, 3600, JSON.stringify(bet));
  return bet;
}

async function handleBetCreate(data, chatId, userId, redis, services) {
  try {
    const fixtureId = data.replace('bet_fixture_', '');

    // Try to resolve fixture info via apiFootball if available
    let fixtureText = `Fixture ${fixtureId}`;
    try {
      if (services && services.apiFootball && typeof services.apiFootball.getFixture === 'function') {
        const res = await services.apiFootball.getFixture(fixtureId);
        const f = res?.response?.[0];
        if (f) fixtureText = `${f.teams?.home?.name || 'Home'} vs ${f.teams?.away?.name || 'Away'}`;
      }
    } catch (e) {
      logger.warn('Could not resolve fixture details', e);
    }

    const bet = await createBetslip(redis, userId, fixtureId, fixtureText);

    const text = `🧾 *Betslip*\n\nFixture: *${bet.fixtureText}*\nStake: KES ${bet.stake}\nSelection: *${bet.selection}*\n\nTap to confirm your bet.`;

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Place Bet', callback_data: `place_bet_${bet.id}` }],
          [{ text: '✏️ Change Stake', callback_data: `edit_bet_${bet.id}` }],
          [{ text: '🔙 Back', callback_data: 'menu_live' }]
        ]
      }
    };
  } catch (err) {
    logger.error('handleBetCreate error', err);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '❌ Failed to create betslip. Try again later.',
      parse_mode: 'Markdown'
    };
  }
}

async function handlePlaceBet(data, chatId, userId, redis) {
  try {
    const betId = data.replace('place_bet_', '');
    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) {
      return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip expired or not found.', parse_mode: 'Markdown' };
    }
    const bet = JSON.parse(raw);

    // For free users, we mock placement and store in user's bets history
    const txId = `BTX${Date.now()}`;
    await redis.rpush(`user:${userId}:bets`, JSON.stringify({ ...bet, placedAt: new Date().toISOString(), txId }));
    // remove betslip
    await redis.del(`betslip:${betId}`);

    const text = '✅ Bet placed!\n\nFixture: *' + bet.fixtureText + '*\nStake: KES ' + bet.stake + '\nSelection: *' + bet.selection + '*\nTransaction: `' + txId + '`\n\nGood luck!';

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🎯 My Bets', callback_data: 'profile_bets' }, { text: '🔙 Main Menu', callback_data: 'menu_main' }]] }
    };
  } catch (err) {
    logger.error('handlePlaceBet error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Failed to place bet.', parse_mode: 'Markdown' };
  }
}

// Present stake options to user
async function handleEditBet(data, chatId, userId, redis) {
  try {
    const betId = data.replace('edit_bet_', '');
    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip not found or expired.', parse_mode: 'Markdown' };
    const bet = JSON.parse(raw);

    const keyboard = [
      [ { text: 'KES 50', callback_data: `set_bet_${bet.id}_50` }, { text: 'KES 100', callback_data: `set_bet_${bet.id}_100` } ],
      [ { text: 'KES 200', callback_data: `set_bet_${bet.id}_200` }, { text: 'KES 500', callback_data: `set_bet_${bet.id}_500` } ],
      [ { text: '🔙 Cancel', callback_data: `bet_fixture_${bet.fixtureId}` } ]
    ];

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `✏️ *Edit Stake*\n\nCurrent stake: KES ${bet.stake}\nChoose a new stake:`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.error('handleEditBet error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Error editing bet.', parse_mode: 'Markdown' };
  }
}

// Handle stake selection and update betslip
async function handleSetBetStake(data, chatId, userId, redis) {
  try {
    // format set_bet_{betId}_{amount}
    const parts = data.split('_');
    const betId = parts[2];
    const amount = Number(parts[3] || 0);
    if (!betId || !amount) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Invalid stake selection.', parse_mode: 'Markdown' };

    const raw = await redis.get(`betslip:${betId}`);
    if (!raw) return { method: 'sendMessage', chat_id: chatId, text: '⚠️ Betslip expired or not found.', parse_mode: 'Markdown' };
    const bet = JSON.parse(raw);
    bet.stake = amount;
    await redis.setex(`betslip:${betId}`, 3600, JSON.stringify(bet));

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🧾 *Betslip Updated*\n\nFixture: *${bet.fixtureText}*\nNew stake: KES ${bet.stake}\n\nTap to place the bet.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ Place Bet', callback_data: `place_bet_${bet.id}` }, { text: '🔙 Back', callback_data: 'menu_live' }]] }
    };
  } catch (err) {
    logger.error('handleSetBetStake error', err);
    return { method: 'sendMessage', chat_id: chatId, text: '❌ Error setting stake.', parse_mode: 'Markdown' };
  }
}

/**
 * Start onboarding flow for new user
 */
async function startOnboarding(chatId, userId, redis) {
  try {
    // seed onboarding state
    const state = { step: 'name', createdAt: Date.now() };
    await redis.setex(`user:${userId}:onboarding`, 1800, JSON.stringify(state));
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '📝 Welcome to BETRIX! Let\'s set up your account. What is your full name?\n\n_Reply with your full name to continue._',
      parse_mode: 'Markdown'
    };
  } catch (e) {
    logger.error('startOnboarding failed', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to start signup. Try again later.' };
  }
}

/**
 * Handle onboarding messages (name, age, country, payment method)
 */
async function handleOnboardingMessage(text, chatId, userId, redis, services) {
  try {
    const raw = await redis.get(`user:${userId}:onboarding`);
    if (!raw) return null;
    const state = JSON.parse(raw);

    if (state.step === 'name') {
      const name = String(text || '').trim();
      if (!name || name.length < 2) {
        return { method: 'sendMessage', chat_id: chatId, text: 'Please send a valid full name (at least 2 characters).' };
      }
      await redis.hset(`user:${userId}:profile`, 'name', name);
      state.step = 'age';
      await redis.setex(`user:${userId}:onboarding`, 1800, JSON.stringify(state));
      return { method: 'sendMessage', chat_id: chatId, text: `Thanks *${name}*! How old are you?`, parse_mode: 'Markdown' };
    }

    if (state.step === 'age') {
      const age = parseInt((text || '').replace(/\D/g, ''), 10);
      if (!age || age < 13) {
        return { method: 'sendMessage', chat_id: chatId, text: 'Please enter a valid age (13+).' };
      }
      await redis.hset(`user:${userId}:profile`, 'age', String(age));
      state.step = 'country';
      await redis.setex(`user:${userId}:onboarding`, 1800, JSON.stringify(state));

      // present country options
      const keyboard = [
        [ { text: '🇰🇪 Kenya', callback_data: 'signup_country_KE' }, { text: '🇳🇬 Nigeria', callback_data: 'signup_country_NG' } ],
        [ { text: '🇺🇸 USA', callback_data: 'signup_country_US' }, { text: '🇬🇧 UK', callback_data: 'signup_country_UK' } ],
        [ { text: '🌍 Other', callback_data: 'signup_country_OTHER' } ]
      ];

      return { method: 'sendMessage', chat_id: chatId, text: 'Great — which country are you in? (choose below)', parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
    }

    // default fallback
    return { method: 'sendMessage', chat_id: chatId, text: 'Onboarding in progress. Please follow the instructions.' };
  } catch (e) {
    logger.error('handleOnboardingMessage failed', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Signup failed. Please try again.' };
  }
}

/**
 * Handle signup country callback
 */
async function handleSignupCountry(data, chatId, userId, redis, services) {
  try {
    const code = data.replace('signup_country_', '') || 'OTHER';
    await redis.hset(`user:${userId}:profile`, 'country', code);
    
    // Move to payment method selection
    const state = { step: 'payment_method' };
    await redis.setex(`user:${userId}:onboarding`, 1800, JSON.stringify(state));

    // Get available methods for this country and build buttons
    const methods = getAvailablePaymentMethods(code);
    const keyboard = methods.map(m => ([{ 
      text: `${m.emoji || '💳'} ${m.name}`, 
      callback_data: validateCallbackData(`signup_paymethod_${m.id}`) 
    }]));
    keyboard.push([{ text: '🔙 Cancel', callback_data: 'menu_main' }]);

    const text = `🌍 Great choice! Now, what's your preferred payment method?\n\n(These are available in your region)`;

    return { method: 'sendMessage', chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
  } catch (e) {
    logger.error('handleSignupCountry failed', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to select country. Try again.' };
  }
}

/**
 * Handle signup payment method selection: signup_paymethod_{METHOD_ID}
 */
async function handleSignupPaymentMethodSelection(data, chatId, userId, redis, services) {
  try {
    const methodId = data.replace('signup_paymethod_', '');
    const profile = await redis.hgetall(`user:${userId}:profile`) || {};
    
    // Store payment method preference
    await redis.hset(`user:${userId}:profile`, 'paymentMethod', methodId);

    // Mark onboarding as complete, prepare signup confirmation
    const state = { step: 'confirm' };
    await redis.setex(`user:${userId}:onboarding`, 1800, JSON.stringify(state));

    const name = profile.name || 'New User';
    const age = profile.age || 'N/A';
    const country = profile.country || 'Unknown';

    // Compute signup fee based on country
    const feeMap = { KE: 150, NG: 500, US: 1, UK: 1, OTHER: 1 };
    const amount = feeMap[country] || feeMap.OTHER;
    const currency = { KE: 'KES', NG: 'NGN', US: 'USD', UK: 'GBP', OTHER: 'USD' }[country] || 'USD';

    const text = `✅ *Signup Summary*\n\nName: ${name}\nAge: ${age} years\nCountry: ${country}\nPayment Method: ${methodId}\n\n💳 One-time signup fee: *${amount} ${currency}*\n\nClick the button below to complete payment and activate your account.`;

    return { 
      method: 'sendMessage', 
      chat_id: chatId, 
      text, 
      parse_mode: 'Markdown', 
      reply_markup: { 
        inline_keyboard: [[
          { text: '✅ Pay & Activate', callback_data: validateCallbackData(`signup_pay_${methodId}_${amount}_${currency}`) }
        ], [
          { text: '🔙 Back', callback_data: 'menu_main' }
        ]] 
      } 
    };
  } catch (e) {
    logger.error('handleSignupPaymentMethodSelection failed', e);
    return { method: 'sendMessage', chat_id: chatId, text: 'Failed to select payment method. Try again.' };
  }
}

/**
 * Handle signup payment callback: signup_pay_{METHOD}_{AMOUNT}_{CURRENCY}
 */
async function handleSignupPaymentCallback(data, chatId, userId, redis, services) {
  try {
    const parts = data.split('_');
    // parts: ['signup','pay','METHOD','AMOUNT'] or ['signup','pay','METHOD','AMOUNT','CURRENCY']
    let method = parts[2];
    const amount = Number(parts[3] || 0);
    const currency = parts[4] || 'KES';
    
    // Normalize payment method to canonical key
    method = normalizePaymentMethod(method) || method;
    
    const profile = await redis.hgetall(`user:${userId}:profile`) || {};
    const country = profile.country || 'KE';

    // Validate payment method is available in country
    const availableMethods = getAvailablePaymentMethods(country);
    const methodAvailable = availableMethods.some(m => m.id === method);
    if (!methodAvailable) {
      return { method: 'sendMessage', chat_id: chatId, text: `❌ Payment method "${method}" is not available in ${country}. Please select another.`, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]]} };
    }

    // Create custom payment order
    const { createCustomPaymentOrder, getPaymentInstructions } = await import('./payment-router.js');
    const order = await createCustomPaymentOrder(redis, userId, amount, method, country, { signup: true });
    const instructions = await getPaymentInstructions(redis, order.orderId, method).catch(() => null);

    let instrText = `💳 *BETRIX PAYMENT*\n\n`;
    instrText += `Order ID: \`${order.orderId}\`\n`;
    instrText += `Amount: *${amount} ${currency}*\n`;
    instrText += `Method: *${method.replace('_', ' ').toUpperCase()}*\n`;
    instrText += `Status: ⏳ Awaiting Payment\n\n`;
    
    // Display detailed payment instructions from instructions object
    if (instructions && instructions.manualSteps && Array.isArray(instructions.manualSteps)) {
      instrText += instructions.manualSteps.join('\n');
    } else if (instructions && instructions.description) {
      instrText += `📝 ${instructions.description}\n`;
    }

    const keyboard = [];
    if (instructions && instructions.checkoutUrl) {
      keyboard.push([{ text: '🔗 Open Payment Link', url: instructions.checkoutUrl }]);
    }
    
    keyboard.push([
      { text: '✅ Verify Payment', callback_data: validateCallbackData(`verify_payment_${order.orderId}`) },
      { text: '❓ Help', callback_data: validateCallbackData(`payment_help_${method}`) }
    ]);
    
    keyboard.push([{ text: '🔙 Cancel Payment', callback_data: 'menu_main' }]);

    instrText += `\n\n💡 *Quick Tip:* After making payment, paste your transaction confirmation message here for instant verification!`;

    return { method: 'sendMessage', chat_id: chatId, text: instrText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
  } catch (e) {
    logger.error('handleSignupPaymentCallback failed', e);
    return { method: 'sendMessage', chat_id: chatId, text: `❌ Payment setup failed: ${e.message || 'Unknown error'}. Please try again.`, reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]]} };
  }
}

/**
 * Handle payment help/guide request: payment_help_{METHOD}
 * Display step-by-step guide for a specific payment method
 */
async function handlePaymentHelp(data, chatId, userId, redis) {
  try {
    const method = data.replace('payment_help_', '');
    const guide = getPaymentGuide(method);

    if (!guide) {
      return { 
        method: 'sendMessage', 
        chat_id: chatId, 
        text: `❌ Payment method "${method}" guide not found.`, 
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]]} 
      };
    }

    let guideText = `📖 *${guide.title} - Step-by-Step Guide*\n\n`;
    guideText += `${guide.description}\n\n`;
    guideText += `*Steps:*\n`;
    guideText += guide.steps.map((step, i) => `${i + 1}️⃣ ${step}`).join('\n');
    guideText += `\n\n💡 *Have questions?* Contact support for assistance.`;

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: guideText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Payment', callback_data: 'menu_main' }]]} 
    };
  } catch (e) {
    logger.error('handlePaymentHelp failed', e);
    return { 
      method: 'sendMessage', 
      chat_id: chatId, 
      text: `❌ Failed to load payment guide: ${e.message || 'Unknown error'}`, 
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]]} 
    };
  }
}

/**
 * Handle sport selection with fixtures-manager integration
 */
async function handleSportCallback(data, chatId, userId, redis, services) {
  const sportKey = data.replace('sport_', '');
  const sportName = sportKey.charAt(0).toUpperCase() + sportKey.slice(1);

  try {
    // 🎯 TRY FIXTURES MANAGER FIRST
    let leagues = [];
    try {
      // FixturesManager is a class (default export) - instantiate with Redis
      const fm = new fixturesManager(redis);
      leagues = await fm.getLeagueFixtures(sportKey);
      if (leagues && leagues.length > 0) {
        leagues = leagues.slice(0, 8).map(l => ({
          id: l.id || l.league?.id || '0',
          name: l.name || l.league?.name || 'Unknown',
          matches: l.matches || 0
        }));
      }
    } catch (e) {
      logger.warn('Fixtures manager failed, trying sportsAggregator', e.message);
    }
    
    // 🎯 FALLBACK TO SPORTSAGGREGATOR IF NEEDED
    if (!leagues || leagues.length === 0 && services && services.sportsAggregator) {
      try {
        const allLeagues = await services.sportsAggregator.getLeagues(sportKey);
        leagues = allLeagues.slice(0, 8).map(l => ({
          id: l.id || l.league?.id || l.competition?.id || '0',
          name: l.name || l.league?.name || l.competition?.name || 'Unknown'
        }));
      } catch (e) {
        logger.warn('Failed to fetch leagues from aggregator', e);
      }
    }

    // Fallback to popular leagues if none fetched
    if (!leagues || leagues.length === 0) {
      leagues = [
        { id: '39', name: '⚽ Premier League (England)' },
        { id: '140', name: '⚽ La Liga (Spain)' },
        { id: '135', name: '⚽ Serie A (Italy)' },
        { id: '61', name: '⚽ Ligue 1 (France)' },
        { id: '78', name: '⚽ Bundesliga (Germany)' },
        { id: '2', name: '🏆 UEFA Champions League' },
        { id: '3', name: '🏆 UEFA Europa League' },
        { id: '39', name: '📺 Other Leagues' }
      ];
    }

    const keyboard = leagues.map(l => [{
      text: l.name.includes('⚽') || l.name.includes('🏆') ? l.name : `⚽ ${l.name}`,
      callback_data: `league_${l.id}`
    }]);
    keyboard.push([{ text: '🔙 Back to Sports', callback_data: 'menu_live' }]);

    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `🏟️ *${sportName}* - Select a league\n\nChoose your favorite league to see live matches, odds, and standings.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (err) {
    logger.warn('handleSportCallback failed', err);
    return {
      method: 'editMessageText',
      chat_id: chatId,
      message_id: undefined,
      text: `Loading ${sportName} leagues...`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle subscription callbacks
 */
async function handleSubscriptionCallback(data, chatId, userId, redis, services) {
  try {
    // Handle manage subscription
    if (data === 'sub_manage') {
      const subscription = await getUserSubscription(redis, userId);
      // 🎯 USE BETRIX BRANDING FOR SUBSCRIPTION DISPLAY
      const header = brandingUtils.generateBetrixHeader(subscription.tier);
      const comparison = premiumUI.buildSubscriptionComparison(subscription.tier);
      const text = `${header}\n\n${comparison}`;
      
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'menu_vvip' }]
          ]
        }
      };
    }

    // Handle tier selection (sub_free, sub_pro, sub_vvip, sub_plus)
    if (data.startsWith('sub_')) {
      const tier = data.replace('sub_', '').toUpperCase();
      const tierConfig = TIERS[tier];
      
      if (!tierConfig) {
        return {
          method: 'answerCallbackQuery',
          callback_query_id: undefined,
          text: '❌ Invalid tier selection',
          show_alert: false
        };
      }

      // Get user's region (default KE for now)
      const userRegion = await redis.hget(`user:${userId}:profile`, 'region') || 'KE';
      
      // Get available payment methods for region
      const paymentMethodObjects = getAvailablePaymentMethods(userRegion);
      const paymentMethodIds = paymentMethodObjects.map(m => m.id);
      
      // Handle case where no payment methods are available
      if (!paymentMethodIds || paymentMethodIds.length === 0) {
        return {
          method: 'answerCallbackQuery',
          callback_query_id: undefined,
          text: `❌ No payment methods available in your region (${userRegion}). Please contact support.`,
          show_alert: true
        };
      }

      // Persist selected tier for this user for 15 minutes so payment callbacks can reference it
      try {
        await redis.setex(`user:${userId}:pending_payment`, 900, JSON.stringify({ tier, region: userRegion, createdAt: Date.now() }));
      } catch (e) {
        logger.warn('Failed to persist pending payment', e);
      }
      
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `🌀 *${tierConfig.name}* - KES ${tierConfig.price}/month\n\n✨ *Features:*\n${tierConfig.features.map(f => `• ${f}`).join('\n')}\n\n*Select payment method:*`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buildPaymentMethodButtons(paymentMethodIds, tier)
        }
      };
    }

    // Handle subscription tier selection from main menu
    const tier = data.replace('sub_', '').toUpperCase();
    const tierConfig = TIERS[tier];

    if (!tierConfig) {
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid tier selection',
        show_alert: false
      };
    }

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `💳 Ready to upgrade to ${tierConfig.name}?\n\nKES ${tierConfig.price}/month\n\nClick Pay to continue.`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Proceed to Payment', callback_data: `pay_${tier}` }],
          [{ text: '🔙 Back', callback_data: 'menu_vvip' }]
        ]
      }
    };
  } catch (error) {
    logger.error('Subscription callback error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: '❌ An error occurred. Please try again.',
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Build payment method buttons based on available methods
 * methodIds: array of method ID strings like ['SAFARICOM_TILL', 'MPESA', 'BINANCE']
 */
function buildPaymentMethodButtons(methodIds, tier) {
  const buttons = [];
  
  if (!methodIds || methodIds.length === 0) return buttons;
  
  // Safaricom Till (high priority for KE)
  if (methodIds.includes('SAFARICOM_TILL')) {
    const TILL_NUMBER = process.env.MPESA_TILL || process.env.SAFARICOM_TILL_NUMBER || '606215';
    buttons.push([{
      text: `🏪 Safaricom Till #${TILL_NUMBER} (Recommended)`,
      callback_data: `pay_safaricom_till_${tier}`
    }]);
  }
  
  // M-Pesa
  if (methodIds.includes('MPESA')) {
    buttons.push([{
      text: '📱 M-Pesa STK Push',
      callback_data: `pay_mpesa_${tier}`
    }]);
  }
  
  // PayPal
  if (methodIds.includes('PAYPAL')) {
    buttons.push([{
      text: '💳 PayPal',
      callback_data: `pay_paypal_${tier}`
    }]);
  }
  
  // Binance
  if (methodIds.includes('BINANCE')) {
    buttons.push([{
      text: '₿ Binance Pay',
      callback_data: `pay_binance_${tier}`
    }]);
  }
  
  // SWIFT
  if (methodIds.includes('SWIFT')) {
    buttons.push([{
      text: '🏦 Bank Transfer (SWIFT)',
      callback_data: `pay_swift_${tier}`
    }]);
  }
  
  // Back button
  buttons.push([{
    text: '🔙 Back',
    callback_data: 'menu_vvip'
  }]);
  
  return buttons;
}

/**
 * Handle profile callbacks
 */
async function handleProfileCallback(data, chatId, userId, redis) {
  try {
    if (data === 'profile_stats') {
      const user = await safeGetUserData(redis, `user:${userId}`) || {};
      const sub = await getUserSubscription(redis, userId);
      
      // 🎯 USE BETRIX BRANDING FOR PROFILE
      const header = brandingUtils.generateBetrixHeader(sub.tier);
      const profileText = formatProfile({
        name: (user && user.name) || 'BETRIX User',
        tier: sub.tier || 'FREE',
        joinDate: (user && user.joinDate) || new Date().toLocaleDateString(),
        predictions: (user && user.predictions) || 0,
        winRate: (user && user.winRate) || '0',
        points: user.points || 0,
        referralCode: user.referralCode || `USER${userId}`,
        referrals: user.referrals || 0,
        bonusPoints: user.bonusPoints || 0
      });
      
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `${header}\n\n${profileText}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_bets') {
      const bets = await redis.lrange(`user:${userId}:bets`, 0, 4) || [];
      const betList = bets.length > 0 
        ? `Recent bets:\n${bets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
        : 'No bets placed yet. Start by selecting a match!';
      
      const header = brandingUtils.generateBetrixHeader('FREE');
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `${header}\n\n💰 *My Bets*\n\n${betList}\n\n_Tap a bet to view details_`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_favorites') {
      const favs = await redis.smembers(`user:${userId}:favorites`) || [];
      const favList = favs.length > 0
        ? `Your favorite teams:\n${favs.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
        : 'No favorites yet. Add teams to track them!';
      
      const header = brandingUtils.generateBetrixHeader('FREE');
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `${header}\n\n⭐ *My Favorites*\n\n${favList}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    if (data === 'profile_settings') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `🔧 *Account Settings*\n\n• Notifications: ✅ Enabled\n• Language: 🌐 English\n• Timezone: 🕐 UTC+3\n\n_Settings panel coming soon!_`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_profile' }]] }
      };
    }

    // Fallback
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `🌀 *BETRIX* - Profile Feature`,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('Profile callback error', err);
    return null;
  }
}

/**
 * Handle help callbacks
 */
async function handleHelpCallback(data, chatId, userId, redis) {
  try {
    if (data === 'help_faq') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `❓ *Frequently Asked Questions*

*Q: How do I place a bet?*
A: Tap ⚽ Live Games → Select sport → Choose a match → Tap "Quick Bet"

*Q: What are the subscription tiers?*
A: Free (basic), Pro (KES 899/mo), VVIP (KES 2,699/mo), Plus (KES 8,999/mo)

*Q: How do I make a payment?*
A: Go to 💰 Subscribe → Pick your plan → Choose payment method

*Q: What's the referral code for?*
A: Share your code with friends. When they sign up, you both earn bonuses!

*Q: Is BETRIX available 24/7?*
A: Yes! Bet anytime, live analysis every day.

*Need more help?*
Contact: support@betrix.app`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    if (data === 'help_demo') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `🎮 *Try the Demo*

Let's walk through a real example:

*Step 1:* Tap ⚽ Live Games
*Step 2:* Select ⚽ Football
*Step 3:* Choose Premier League
*Step 4:* You'll see live matches
*Step 5:* Tap a match → "Quick Bet"
*Step 6:* Enter your stake
*Step 7:* Confirm bet

💡 *Pro Tip:* Use VVIP for advanced predictions with 85%+ accuracy!

Ready? Tap "Back" and start! 🚀`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    if (data === 'help_contact') {
      return {
        method: 'editMessageText',
        chat_id: chatId,
        message_id: undefined,
        text: `📧 *Contact Support*

We're here to help! Reach out:

📧 *Email:* support@betrix.app
💬 *WhatsApp:* +254 700 123456
🐦 *Twitter:* @BETRIXApp
📱 *Telegram:* @BETRIXSupport

*Response time:* Usually within 2 hours

*For billing issues:* billing@betrix.app
*For technical support:* tech@betrix.app`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_help' }]] }
      };
    }

    // Fallback
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `📚 *Help & Support*\n\n${data}`,
      parse_mode: 'Markdown'
    };
  } catch (err) {
    logger.error('Help callback error', err);
    return null;
  }
}

/**
 * Handle payment method selection with tier extraction
 */
async function handlePaymentMethodSelection(data, chatId, userId, redis, services) {
  try {
    // Format: pay_METHOD or pay_METHOD_TIER (e.g., pay_mpesa, pay_till, pay_mpesa_PRO, pay_safaricom_till_VVIP)
    // Strip 'pay_' prefix to get the rest
    const afterPay = data.replace('pay_', '');
    const parts = afterPay.split('_');
    
    if (parts.length < 1) {
      logger.error('Invalid payment callback format', { data, parts });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid payment selection. Please try again.',
        show_alert: true
      };
    }
    
    // Extract payment method from first part(s) and tier from last part
    // Handle both 'pay_mpesa' and 'pay_mpesa_PRO' formats
    let callbackMethod, tierFromCallback;
    
    // Check if last part looks like a tier (all caps, single word, matches known tier)
    const lastPart = parts[parts.length - 1].toUpperCase();
    if (['FREE', 'PRO', 'VVIP', 'PLUS'].includes(lastPart)) {
      tierFromCallback = lastPart;
      // Join remaining parts for method name (e.g., 'safaricom_till' from ['safaricom', 'till'])
      callbackMethod = parts.slice(0, -1).join('_').toUpperCase();
    } else {
      callbackMethod = afterPay.toUpperCase();
      tierFromCallback = null;
    }
    
    // Map callback names to provider keys
    const methodMap = {
      'TILL': 'SAFARICOM_TILL',
      'SAFARICOM_TILL': 'SAFARICOM_TILL',
      'MPESA': 'MPESA',
      'PAYPAL': 'PAYPAL',
      'BINANCE': 'BINANCE',
      'SWIFT': 'SWIFT',
      'BITCOIN': 'BITCOIN',
      'QUICK_VVIP': 'SAFARICOM_TILL' // Quick VVIP uses Safaricom Till
    };
    
    let paymentMethod = methodMap[callbackMethod] || callbackMethod;
    
    // Further normalize in case methodMap doesn't cover all aliases
    const normalized = normalizePaymentMethod(paymentMethod);
    if (normalized) paymentMethod = normalized;
    
    // Get tier: prefer tier from callback, then from pending_payment in Redis (should have been set by sub_* callback)
    let tier = tierFromCallback || 'VVIP'; // default fallback
    try {
      const pending = await redis.get(`user:${userId}:pending_payment`);
      if (pending) {
        const pendingObj = JSON.parse(pending);
        tier = tierFromCallback || pendingObj.tier || tier;
      } else {
        logger.warn('No pending payment found for user', { userId, data });
      }
    } catch (e) {
      logger.warn('Failed to read pending tier from redis', { userId, error: e.message });
    }
    
    // Validate tier
    if (!TIERS[tier]) {
      logger.error('Invalid tier from pending payment', { data, tier });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: '❌ Invalid tier. Please select tier again.',
        show_alert: true
      };
    }
    
    // Validate payment method exists in PAYMENT_PROVIDERS
    if (!PAYMENT_PROVIDERS[paymentMethod]) {
      logger.error('Unknown payment method', { data, paymentMethod, callbackMethod });
      return {
        method: 'answerCallbackQuery',
        callback_query_id: undefined,
        text: `❌ Payment method '${callbackMethod}' not recognized. Please try again.`,
        show_alert: true
      };
    }

    // Read region from pending payment record (set when tier was selected) or from user profile
    let userRegion = 'KE';
    try {
      const pending = await redis.get(`user:${userId}:pending_payment`);
      if (pending) {
        const pendingObj = JSON.parse(pending);
        userRegion = pendingObj.region || userRegion;
      }
    } catch (e) {
      logger.warn('Failed to read pending region from redis', e);
    }
    
    // Fallback to profile region
    if (userRegion === 'KE') {
      const profileRegion = await redis.hget(`user:${userId}:profile`, 'region').catch(() => null);
      if (profileRegion) userRegion = profileRegion;
    }

    // Validate payment method is available for user's region
    // NOTE: Allow all providers globally — log if provider not listed but proceed.
    try {
      const available = getAvailablePaymentMethods(userRegion);
      if (!available.find(m => m.id === paymentMethod)) {
        const availableNames = available.map(m => m.name).join(', ');
        logger.warn('Payment method not listed for region, proceeding anyway', { paymentMethod, userRegion, available: availableNames });
        // do not return; allow user to proceed with selected method
      }
    } catch (e) {
      logger.warn('Failed to check available payment methods, proceeding', e?.message || e);
    }

    // Create payment order
    const order = await createPaymentOrder(
      redis,
      userId,
      tier,
      paymentMethod,
      userRegion
    );

    // Get payment instructions
    const instructions = await getPaymentInstructions(redis, order.orderId, paymentMethod);

    // Build step-by-step text
    let instrText = '';
    if (instructions) {
      // Use provided descriptive text if available
      if (instructions.description) instrText += `*${instructions.description}*\n\n`;

      // Steps may be in .steps or .manualSteps
      const steps = instructions.steps || instructions.manualSteps || [];
      if (Array.isArray(steps) && steps.length > 0) {
        instrText += 'Follow these steps:\n';
        for (let i = 0; i < steps.length; i++) {
          instrText += `${i + 1}. ${steps[i]}\n`;
        }
        instrText += '\n';
      }

      // Additional helper fields
      if (instructions.tillNumber) instrText += 'Till: *' + instructions.tillNumber + '*\n';
      if (instructions.reference) instrText += 'Reference: `' + instructions.reference + '`\n';
      if (instructions.checkoutUrl) instrText += 'Open the payment link to continue.';
    } else {
      instrText = 'Please follow the provider instructions to complete payment for order ' + order.orderId + '.';
    }

    // Build buttons: provider-specific CTAs and common verification
    const keyboard = [];

    if (instructions && instructions.checkoutUrl) {
      keyboard.push([{ text: `${PAYMENT_PROVIDERS[paymentMethod]?.symbol || '💳'} Pay with ${PAYMENT_PROVIDERS[paymentMethod]?.name || paymentMethod}`, url: instructions.checkoutUrl }]);
    }

    if (instructions && instructions.qrCode) {
      keyboard.push([{ text: '🔎 View QR', url: instructions.qrCode }]);
    }

    // Always include verify and change method
    keyboard.push([{ text: '✅ I have paid', callback_data: `verify_payment_${order.orderId}` }]);
    keyboard.push([{ text: '🔙 Change method', callback_data: 'menu_vvip' }]);

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: instrText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    };
  } catch (error) {
    logger.error('Payment method selection error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `❌ Payment setup failed: ${error.message}`,
      parse_mode: 'Markdown'
    };
  }
}

/**
 * Handle payment verification when user confirms payment
 */
async function handlePaymentVerification(data, chatId, userId, redis) {
  try {
    const orderId = data.replace('verify_payment_', '');
    // Use payment-router's verification to ensure consistent activation
    try {
      const verification = await verifyAndActivatePayment(redis, orderId, `manual_${Date.now()}`);
      const tier = verification.tier;
      const tierConfig = TIERS[tier] || { name: tier, features: [] };

      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `✅ *Payment Confirmed!*\n\n🎉 Welcome to ${tierConfig.name}!\n\n✨ *Features unlocked:*\n${(tierConfig.features || []).map(f => `• ${f}`).join('\n')}\n\nEnjoy your premium experience with 🌀 BETRIX!`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 Back to Main Menu', callback_data: 'menu_main' }]
          ]
        }
      };
    } catch (e) {
      logger.error('Payment verification failed', e);
      return {
        method: 'sendMessage',
        chat_id: chatId,
        text: `❌ Verification failed: ${e.message || 'unknown error'}`,
        parse_mode: 'Markdown'
      };
    }
  } catch (error) {
    logger.error('Payment verification error:', error);
    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `❌ Verification failed: ${error.message}\n\nPlease contact support or try again.`,
      parse_mode: 'Markdown'
    };
  }
}

export default {
  handleMessage,
  handleCallbackQuery,
  handleCommand,
  handleNaturalLanguage
};

