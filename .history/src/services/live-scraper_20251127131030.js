import fetch from 'node-fetch';
import { load as cheerioLoad } from 'cheerio';
import { Logger } from '../utils/logger.js';

const logger = new Logger('LiveScraper');

async function fetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, { timeout: 8000, ...opts });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return await res.json();
  } catch (e) {
    logger.warn(`fetchJson failed for ${url}: ${e.message || e}`);
    return null;
  }
}

// Try to enrich a single ESPN match using the public ESPN summary endpoint
export async function getEspnMatchStats(eventId, sport = 'soccer') {
  if (!eventId) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${encodeURIComponent(sport)}/summary?event=${encodeURIComponent(eventId)}`;
  const json = await fetchJson(url);
  if (!json || !json.competitions || !json.competitions[0]) return null;

  try {
    const comp = json.competitions[0];
    const status = comp.status && comp.status.type ? comp.status.type : {};
    const competitors = (comp.competitors || []).map(c => ({
      id: c.team?.id || null,
      name: c.team?.displayName || c.team?.name || c.displayName || c.name,
      homeAway: c.homeAway,
      score: c.score != null ? Number(c.score) : null
    }));

    // boxscore statistics (may be missing on some events)
    const box = comp.boxscore || {};
    const stats = {};
    if (box.teams && Array.isArray(box.teams)) {
      box.teams.forEach(t => {
        const teamId = t.team?.id || t.id || null;
        stats[teamId || t.team?.displayName || t.team?.name || t.name || t.team] = (t.statistics || []).map(s => ({ label: s.displayName || s.name, value: s.value }));
      });
    }

    // extract possession & minute if available
    let minute = null;
    try {
      minute = (status && (status.detail || status.shortDetail)) || (comp.status && comp.status.type && comp.status.type.name) || null;
    } catch (e) { minute = null; }

    return { eventId, status: status.description || status.detail || null, minute, competitors, stats };
  } catch (e) {
    logger.warn('Failed to parse ESPN summary', e.message || e);
    return null;
  }
}

// Try to fetch extra info from a ScoreBat URL (video embed pages)
export async function getScorebatMatchDetails(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`ScoreBat fetch failed ${res.status}`);
    const html = await res.text();
    const $ = cheerioLoad(html);
    // ScoreBat pages often include JSON inside a script tag with match info
    const scripts = $('script').toArray();
    for (const s of scripts) {
      const txt = $(s).html() || '';
      const m = txt.match(/var matchData\s*=\s*(\{[\s\S]*?\});/);
      if (m && m[1]) {
        try {
          const j = JSON.parse(m[1]);
          return { title: j.title || null, date: j.date || null, videos: j.videos || null };
        } catch (e) { /* ignore parse errors */ }
      }
    }
    // Fallback: try to pick page title
    const title = $('title').text() || null;
    return { title };
  } catch (e) {
    logger.warn('ScoreBat details fetch failed', e.message || e);
    return null;
  }
}

// Enrich an array of match objects with available live stats asynchronously
export async function enrichMatchesWithLiveStats(matches = [], opts = {}) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const enriched = await Promise.all(matches.map(async (m) => {
    try {
      // If provider espn and id exists, attempt ESPN summary enrichment
      if (m.provider === 'espn' && m.id) {
        const stats = await getEspnMatchStats(m.id, opts.sport || 'football');
        if (stats) return { ...m, liveStats: stats };
      }

      // If provider scorebat and url exists, attempt to scrape details
      if (m.provider === 'scorebat' && m.url) {
        const details = await getScorebatMatchDetails(m.url);
        if (details) return { ...m, liveStats: details };
      }

      // generic best-effort: if title contains ' vs ' try to tag it
      if (!m.liveStats && (m.title || (m.home && m.away))) {
        return { ...m, liveStats: { note: 'No detailed live stats available', title: m.title || `${m.home} vs ${m.away}` } };
      }
      return m;
    } catch (e) {
      logger.warn('enrichMatchesWithLiveStats failed for match', e.message || e);
      return m;
    }
  }));
  return enriched;
}

export default { getEspnMatchStats, getScorebatMatchDetails, enrichMatchesWithLiveStats };
