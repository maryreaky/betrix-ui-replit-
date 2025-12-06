import axios from 'axios';
import SportsAggregator from '../../services/sports-aggregator.js';

export async function analyse_match(ctx, matchId) {
  try {
    const agg = new SportsAggregator();

    // Step 1: get live matches from Football-Data (normalized)
    const liveMatches = await agg._getLiveFromFootballData();
    const match = (liveMatches || []).find(m => String(m.id) === String(matchId));

    if (!match) {
      await ctx.editMessageText('⚠️ Match not found or not live.');
      return;
    }

    // Derive team identifiers for SportMonks where possible
    const homeId = match.raw && (match.raw.homeTeam && (match.raw.homeTeam.id || match.raw.homeTeam.name)) || match.home;
    const awayId = match.raw && (match.raw.awayTeam && (match.raw.awayTeam.id || match.raw.awayTeam.name)) || match.away;

    // Step 2: Head-to-head (SportMonks)
    let h2h = [];
    try {
      h2h = await agg.getHeadToHead(homeId, awayId);
    } catch (e) {
      console.warn('Head-to-head fetch failed:', e?.message || e);
    }

    // Step 3: Recent form (SportMonks)
    let recentFormHome = [];
    let recentFormAway = [];
    try {
      recentFormHome = await agg.getRecentForm(homeId, 5);
      recentFormAway = await agg.getRecentForm(awayId, 5);
    } catch (e) {
      console.warn('Recent form fetch failed:', e?.message || e);
    }

    // Step 4: Standings (Football-Data) - try to infer competition code
    let standings = [];
    try {
      const comp = match.raw && (match.raw.competition && (match.raw.competition.id || match.raw.competition.code)) || match.competition || null;
      if (comp) standings = await agg.getStandings(comp);
    } catch (e) {
      console.warn('Standings fetch failed:', e?.message || e);
    }

    // Step 5: Odds (SportMonks)
    let odds = [];
    try {
      odds = await agg.getOdds(match.id);
    } catch (e) {
      console.warn('Odds fetch failed:', e?.message || e);
    }

    // Format analysis text
    let analysisText = `*Match Analysis: ${match.home} vs ${match.away}*\n\n`;
    analysisText += `Status: ${match.status}\n`;
    analysisText += `Score: ${match.homeScore ?? '-'}-${match.awayScore ?? '-'}\n`;
    analysisText += `Competition: ${match.competition || (match.raw && match.raw.competition && match.raw.competition.name) || 'Unknown'}\n`;
    analysisText += `Kickoff: ${match.time || match.kickoff || 'TBA'}\n`;
    analysisText += `Venue: ${match.venue || 'TBA'}\n`;
    analysisText += `Provider: Football-Data.org\n\n`;

    if (h2h && h2h.totalMatches !== undefined) {
      analysisText += `*Head-to-Head:*
Total: ${h2h.totalMatches} | Home wins: ${h2h.homeWins} | Away wins: ${h2h.awayWins} | Draws: ${h2h.draws}\n\n`;
    }

    if (recentFormHome && recentFormHome.length > 0) {
      analysisText += `*Recent Form (${match.home}):*\n`;
      analysisText += recentFormHome.slice(0,5).map(m => `${m.starting_at || m.date || m.date_time || m.utcDate || ''}: ${m.result || (m.score ? JSON.stringify(m.score) : '')}`).join('\n') + '\n\n';
    }

    if (recentFormAway && recentFormAway.length > 0) {
      analysisText += `*Recent Form (${match.away}):*\n`;
      analysisText += recentFormAway.slice(0,5).map(m => `${m.starting_at || m.date || m.date_time || m.utcDate || ''}: ${m.result || (m.score ? JSON.stringify(m.score) : '')}`).join('\n') + '\n\n';
    }

    if (standings && standings.length > 0) {
      const homeStanding = standings.find(t => t.team && (t.team.name === match.home || t.team.id === match.homeId || t.team.id === match.raw?.homeTeam?.id));
      const awayStanding = standings.find(t => t.team && (t.team.name === match.away || t.team.id === match.awayId || t.team.id === match.raw?.awayTeam?.id));
      if (homeStanding || awayStanding) {
        analysisText += `*League Standings:*\n`;
        if (homeStanding) analysisText += `${match.home}: ${homeStanding.position} (${homeStanding.points} pts)\n`;
        if (awayStanding) analysisText += `${match.away}: ${awayStanding.position} (${awayStanding.points} pts)\n`;
        analysisText += '\n';
      }
    }

    if (odds && odds.length > 0) {
      analysisText += `*Odds (sample):*\n`;
      const o = odds[0];
      if (o && o.bookmakers) {
        const markets = o.bookmakers[0] && o.bookmakers[0].markets ? o.bookmakers[0].markets : [];
        analysisText += markets.slice(0,1).map(m => `${m.key}: ${JSON.stringify(m.selections || m.outcomes || m.odds)}`).join('\n') + '\n\n';
      }
    }

    await ctx.editMessageText(analysisText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('analyse_match handler failed', err);
    try { await ctx.editMessageText('⚠️ Analysis failed.'); } catch(_) {}
  }
}
