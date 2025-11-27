import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export async function getOddsFromBetExplorer({ sport = 'football' } = {}) {
  // Best-effort scrape from BetExplorer (public site, no registration needed)
  // This is a simple scraper and may be brittle; use at your own discretion
  try {
    const sportUrl = sport === 'football' ? 'football' : 'soccer';
    const url = `https://www.betexplorer.com/${sportUrl}/`;
    const res = await fetch(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) throw new Error(`BetExplorer fetch failed: ${res.status}`);
    const html = await res.text();

    // Parse with cheerio
    const $ = cheerio.load(html);
    const fixtures = [];

    $('tbody tr').each((idx, row) => {
      if (fixtures.length >= 20) return; // limit to 20

      const cells = $(row).find('td');
      if (cells.length < 4) return;

      const time = $(cells[0]).text().trim();
      const match = $(cells[1]).text().trim();
      const odds1 = $(cells[2]).text().trim();
      const oddsX = $(cells[3]).text().trim();
      const odds2 = $(cells[4])?.text().trim() || '';

      if (match && (odds1 || oddsX || odds2)) {
        fixtures.push({
          time,
          match,
          odds: { home: odds1, draw: oddsX, away: odds2 },
          raw_row: $(row).html(),
        });
      }
    });

    return fixtures.length > 0
      ? fixtures
      : { message: 'No fixtures found on BetExplorer', raw: html.slice(0, 500) };
  } catch (err) {
    return { error: err.message, note: 'BetExplorer scrape failed (may be temporarily unavailable or blocked)' };
  }
}

export async function getOddsFromOddsPortal({ league = 'premier-league' } = {}) {
  // Alternative: OddsPortal (public site, no registration needed)
  // This is a simple scraper and may be brittle
  try {
    const url = `https://www.oddsportal.com/soccer/${league}/results/`;
    const res = await fetch(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) throw new Error(`OddsPortal fetch failed: ${res.status}`);
    const html = await res.text();

    // Parse with cheerio (simple extraction)
    const $ = cheerio.load(html);
    const results = [];

    $('tr[xid]').each((idx, row) => {
      if (results.length >= 15) return;

      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const date = $(cells[0]).text().trim();
      const match = $(cells[1]).text().trim();
      const score = $(cells[2]).text().trim();

      if (match) {
        results.push({ date, match, score });
      }
    });

    return results.length > 0
      ? results
      : { message: 'No results found on OddsPortal', raw: html.slice(0, 500) };
  } catch (err) {
    return { error: err.message, note: 'OddsPortal scrape failed' };
  }
}
