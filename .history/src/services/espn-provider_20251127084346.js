import fetch from 'node-fetch';

export async function getEspnLiveMatches({ sport = 'football' } = {}) {
  // ESPN public scoreboard API (no API key required)
  // Try multiple sport slugs if provided one fails
  const sportSlugs = sport === 'soccer' ? ['soccer', 'football_world_cup', 'football_uefa_champ_league'] 
                    : sport === 'football' ? ['football', 'nfl']
                    : [sport];
  
  let lastError = null;
  for (const slug of sportSlugs) {
    try {
      const base = `https://site.api.espn.com/apis/site/v2/sports/${encodeURIComponent(slug)}/scoreboard`;
  const res = await fetch(base, { timeout: 15000 });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ESPN fetch failed: ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
  }
  const json = await res.json();

  // Normalize events
  const events = (json.events || []).map(ev => {
    const competition = ev.competition || {};
    const competitors = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || [];
    const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};

    return {
      id: ev.id,
      league: competition.displayName || competition.abbreviation || (json.sport && json.sport.slug),
      name: ev.fullName || ev.shortName || `${(home.team && (home.team.displayName || home.team.name)) || home.displayName || ''} vs ${(away.team && (away.team.displayName || away.team.name)) || away.displayName || ''}`,
      status: (ev.status && ev.status.type && ev.status.type.description) || (ev.status && ev.status.type && ev.status.type.name) || 'unknown',
      startTime: ev.date,
      home: {
        id: home.team?.id || null,
        name: home.team?.displayName || home.team?.name || home.displayName || null,
        score: home.score != null ? Number(home.score) : null,
      },
      away: {
        id: away.team?.id || null,
        name: away.team?.displayName || away.team?.name || away.displayName || null,
        score: away.score != null ? Number(away.score) : null,
      },
    };
  });

  return events;
}
