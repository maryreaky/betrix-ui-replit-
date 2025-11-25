import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';

class FootballDataService {
  constructor(baseUrl = 'https://www.football-data.co.uk') {
    this.base = baseUrl.replace(/\/$/, '');
  }

  // Download a CSV for a season and competition code (e.g. 'E0' for EPL)
  async downloadCsv(compCode = 'E0', season = '2324') {
    // football-data URLs follow a pattern: /mmz4281/YYYY-YYYY/{comp}.csv but site uses different structure; try common paths
    const candidates = [
      `${this.base}/mmz4281/${season}/${compCode}.csv`,
      `${this.base}/mtm/${season}/${compCode}.csv`,
      `${this.base}/tables/${season}/${compCode}.csv`
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { timeout: 15000 });
        if (!res.ok) continue;
        const txt = await res.text();
        const records = parse(txt, { columns: true, skip_empty_lines: true });
        return { url, records };
      } catch (err) {
        // try next
      }
    }
    throw new Error('No CSV found for given comp/season');
  }

  // Simple helper: expose fixtures from CSV (home vs away with date)
  async fixturesFromCsv(compCode = 'E0', season = '2324') {
    const res = await this.downloadCsv(compCode, season);
    const fixtures = res.records.map(r => ({ date: r.Date || r.MatchDate || r.date || null, home: r.HomeTeam || r.Home || r.Hteam || null, away: r.AwayTeam || r.Away || r.Ateam || null, fthg: r.FTHG || r.HomeGoals || null, ftag: r.FTAG || r.AwayGoals || null }));
    return { source: res.url, fixtures };
  }
}

export default FootballDataService;
