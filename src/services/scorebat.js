import fetch from 'node-fetch';

class ScoreBatService {
  constructor(token = process.env.SCOREBAT_TOKEN || null) {
    this.token = token;
    this.base = 'https://www.scorebat.com/video-api/v3';
  }

  async freeFeed() {
    const url = `${this.base}/free-feed/` + (this.token ? `?token=${this.token}` : '');
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`ScoreBat feed fetch failed: ${res.status}`);
    return res.json();
  }

  async featured() {
    const url = `${this.base}/featured-feed/` + (this.token ? `?token=${this.token}` : '');
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`ScoreBat featured fetch failed: ${res.status}`);
    return res.json();
  }
}

export default ScoreBatService;
