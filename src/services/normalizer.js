// Normalize match and standings data from multiple sources and provide confidence score

const sourcePriority = ['openligadb', 'footballdata', 'scorebat'];

function normalizeMatch(raw, source) {
  // raw is source specific; try to extract common fields
  const out = { source, home: raw.HomeTeam || raw.home || raw.Home || raw.hometeam || raw.home_team || raw.home_name || null, away: raw.AwayTeam || raw.away || raw.Away || raw.awayteam || raw.away_name || null, date: raw.MatchDate || raw.Date || raw.date || raw.match_date || raw.datetime || null, score: null };
  if (raw.FTHG != null || raw.fthg != null) out.score = `${raw.FTHG || raw.fthg}-${raw.FTAG || raw.ftag || raw.ftag || ''}`;
  out.confidence = 0.7; // baseline
  if (source === 'openligadb') out.confidence += 0.15;
  if (source === 'footballdata') out.confidence += 0.1;
  return out;
}

function chooseBestMatch(matches = []) {
  if (!matches || matches.length === 0) return null;
  // pick highest confidence then recent date
  matches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return matches[0];
}

export { normalizeMatch, chooseBestMatch };
