import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const MATCHES_FILE = path.join(ROOT, 'FOOTBALL_DATA_MATCHES.json');
let aggregator = null;

export function setAggregator(agg) {
  aggregator = agg;
}

async function loadMatches() {
  try {
    const raw = await fs.readFile(MATCHES_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Expect an array; if object, try common keys
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.matches)) return data.matches;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    console.warn('Could not load matches file', MATCHES_FILE, err?.message);
    return [];
  }
}

function isLiveMatch(m) {
  // Heuristics for common providers
  if (m.status) {
    const s = String(m.status).toLowerCase();
    if (s.includes('live') || s.includes('in play') || s.includes('started')) return true;
  }
  if (m.time_status) {
    const s = String(m.time_status).toLowerCase();
    if (s.includes('live') || s.includes('playing')) return true;
  }
  if (typeof m.is_live === 'boolean') return m.is_live === true;
  // fallback: check for current_score or minute
  if (m.score || m.home_score != null || m.away_score != null) return true;
  return false;
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false });
  } catch (e) { return String(ts); }
}

export async function getLiveMatches() {
  // Prefer live data from injected SportsAggregator if available
  try {
    if (aggregator && typeof aggregator.getAllLiveMatches === 'function') {
      const all = await aggregator.getAllLiveMatches();
      if (Array.isArray(all) && all.length > 0) return all;
    }
  } catch (e) {
    console.warn('football.js: sportsAggregator getAllLiveMatches failed', e?.message || e);
  }
  const matches = await loadMatches();
  return matches.filter(isLiveMatch);
}

export async function getUpcomingFixtures({ page = 1, perPage = 10 } = {}) {
  // Prefer fixtures from injected SportsAggregator if available
  try {
    if (aggregator && typeof aggregator.getFixtures === 'function') {
      const fixtures = await aggregator.getFixtures();
      if (Array.isArray(fixtures) && fixtures.length > 0) {
        const start = (page - 1) * perPage;
        return { items: fixtures.slice(start, start + perPage), total: fixtures.length };
      }
    }
  } catch (e) {
    console.warn('football.js: sportsAggregator getFixtures failed', e?.message || e);
  }

  const matches = await loadMatches();
  // Heuristic: treat non-live as upcoming; attempt to sort by kickoff if available
  const upcoming = matches.filter(m => !isLiveMatch(m));
  upcoming.sort((a, b) => {
    const ta = new Date(a.kickoff || a.date || a.match_time || a.datetime || a.timestamp || 0).getTime();
    const tb = new Date(b.kickoff || b.date || b.match_time || b.datetime || b.timestamp || 0).getTime();
    return (ta || 0) - (tb || 0);
  });
  const start = (page - 1) * perPage;
  return { items: upcoming.slice(start, start + perPage), total: upcoming.length };
}

export function formatMatchShort(m) {
  // Best-effort formatting using common fields
  const home = m.home?.name || m.home_team || m.home_team_name || m.team_home || (m.teams && m.teams.home && m.teams.home.name) || m.homeName || 'Home';
  const away = m.away?.name || m.away_team || m.away_team_name || m.team_away || (m.teams && m.teams.away && m.teams.away.name) || m.awayName || 'Away';
  const comp = m.competition?.name || m.league || m.competition || m.tournament || '';
  const score = (m.score && (m.score.fullTime || m.score.current)) || `${m.home_score ?? ''}${m.home_score != null ? ' - ' + (m.away_score ?? '') : ''}`;
  const time = m.minute || m.status || m.time || m.time_status || (m.kickoff ? formatTime(m.kickoff) : 'TBD');
  const scoreStr = score && String(score) !== 'undefined' && String(score) !== '' ? ` • Score: ${score}` : '';
  return `${home} vs ${away}${scoreStr} • ${time}${comp ? ' • ' + comp : ''}`;
}

export function formatMatchDetail(m) {
  const home = m.home?.name || m.home_team || 'Home';
  const away = m.away?.name || m.away_team || 'Away';
  const comp = m.competition?.name || m.league || '';
  const kickoff = m.kickoff || m.date || m.datetime || m.match_time || '';
  const time = kickoff ? formatTime(kickoff) : (m.minute || m.status || 'TBD');
  const score = (m.score && (m.score.fullTime || m.score.current)) || `${m.home_score ?? '-'} - ${m.away_score ?? '-'}`;
  const venue = m.venue || m.location || '';
  const refs = m.referee || '';
  const lines = [];
  lines.push(`⚽ BETRIX • Match Detail`);
  if (comp) lines.push(`Competition: ${comp}`);
  lines.push(`${home}  ${score}  ${away}`);
  lines.push(`Time: ${time}`);
  if (venue) lines.push(`Venue: ${venue}`);
  if (refs) lines.push(`Referee: ${refs}`);
  if (m.events && Array.isArray(m.events) && m.events.length) {
    lines.push('\nKey events:');
    for (const e of m.events.slice(0, 6)) {
      lines.push(`- ${e.minute || e.time || ''} ${e.team || ''} ${e.type || ''} ${e.player || ''}`.trim());
    }
  }
  return lines.join('\n');
}

export default {
  loadMatches,
  getLiveMatches,
  getUpcomingFixtures,
  formatMatchShort,
  formatMatchDetail
};
