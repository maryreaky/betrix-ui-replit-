import fetch from 'node-fetch';
import cheerio from 'cheerio';

// Minimal polite scraper helpers for FBref / Understat
class Scrapers {
  constructor(redis = null) {
    this.redis = redis;
    this.userAgent = 'BETRIX-Bot/1.0 (+https://example.com)';
  }

  async allowedByRobots(baseUrl, path = '/') {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const res = await fetch(robotsUrl, { timeout: 5000, headers: { 'User-Agent': this.userAgent } });
      if (!res.ok) return true; // assume allowed if no robots
      const txt = await res.text();
      // simple check: if Disallow: / then disallow everything
      const lines = txt.split('\n').map(l => l.trim());
      const disallow = lines.filter(l => l.toLowerCase().startsWith('disallow')).map(l => l.split(':')[1]?.trim() || '').filter(Boolean);
      if (disallow.includes('/')) return false;
      return true;
    } catch (err) {
      return true;
    }
  }

  async fetchPage(url) {
    const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': this.userAgent } });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return res.text();
  }

  async fbrefTeamStats(teamUrl) {
    try {
      const u = new URL(teamUrl);
      const allowed = await this.allowedByRobots(u.origin, u.pathname);
      if (!allowed) throw new Error('Scraping disallowed by robots.txt');
      const html = await this.fetchPage(teamUrl);
      const $ = cheerio.load(html);
      // Best-effort: grab overall table of stats
      const summary = {};
      $('div.stats_pull').each((i, el) => {
        const title = $(el).find('h2').text().trim();
        summary[title] = $(el).text().trim();
      });
      return { url: teamUrl, summary };
    } catch (err) {
      throw err;
    }
  }

  async understatTeam(teamUrl) {
    try {
      const u = new URL(teamUrl);
      const allowed = await this.allowedByRobots(u.origin, u.pathname);
      if (!allowed) throw new Error('Scraping disallowed by robots.txt');
      const html = await this.fetchPage(teamUrl);
      const $ = cheerio.load(html);
      // Understat often embeds JSON in scripts; try to extract any JSON-like patterns
      const scripts = $('script').map((i, s) => $(s).html()).get().join('\n');
      return { url: teamUrl, snippetLength: scripts.length };
    } catch (err) {
      throw err;
    }
  }
}

export default Scrapers;
