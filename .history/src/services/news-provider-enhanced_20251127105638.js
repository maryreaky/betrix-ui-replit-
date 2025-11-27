import fetch from 'node-fetch';

function parseRssItems(rssText, max = 10) {
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>/gi;
  const matches = rssText.match(itemRe) || [];
  for (let i = 0; i < Math.min(matches.length, max); i++) {
    const item = matches[i];
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(item);
    const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(item);
    const pubMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item);
    const descriptionMatch = /<description>([\s\S]*?)<\/description>/i.exec(item);

    items.push({
      title: titleMatch ? titleMatch[1].trim() : null,
      link: linkMatch ? linkMatch[1].trim() : null,
      pubDate: pubMatch ? new Date(pubMatch[1].trim()).toISOString() : null,
      description: descriptionMatch ? descriptionMatch[1].replace(/<[^>]*>/g, '').trim() : null,
    });
  }
  return items;
}

export async function getNewsHeadlines({ query = 'football', max = 10 } = {}) {
  // Google News RSS search (no API key)
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}+when:1d&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { timeout: 10000 });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`News fetch failed: ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
  }
  const rss = await res.text();
  const items = parseRssItems(rss, max);
  return items;
}

// Team-specific subreddits: fallback when main subreddit is blocked
const TEAM_SUBREDDITS = {
  'manchester united': 'reddevils',
  'manchester city': 'MCFC',
  'liverpool': 'liverpoolfc',
  'arsenal': 'Gunners',
  'chelsea': 'chelseafc',
  'tottenham': 'coys',
  'leicester': 'lcfc',
  'brighton': 'albion',
  'newcastle': 'newcastleunited',
  'real madrid': 'realmadrid',
  'barcelona': 'Barca',
  'psg': 'PSG',
  'bayern': 'fcbayern',
  'borussia dortmund': 'borussiadortmund'
};

async function _fetchRedditRss(url, headers, proxy = null) {
  try {
    const fetchUrl = proxy ? `${proxy}?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(fetchUrl, { timeout: 10000, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    throw e;
  }
}

export async function getRedditHeadlines({ subreddit = 'soccer', max = 10, proxy = null, teamName = null } = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BetrixBot/1.0 compatible with Googlebot' };
  
  const urlsToTry = [];
  
  // Primary subreddit
  urlsToTry.push(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/.rss`);
  urlsToTry.push(`https://old.reddit.com/r/${encodeURIComponent(subreddit)}/.rss`);
  
  // Team-specific subreddit if provided
  if (teamName) {
    const teamSubreddit = TEAM_SUBREDDITS[teamName.toLowerCase()];
    if (teamSubreddit) {
      urlsToTry.push(`https://www.reddit.com/r/${encodeURIComponent(teamSubreddit)}/.rss`);
      urlsToTry.push(`https://old.reddit.com/r/${encodeURIComponent(teamSubreddit)}/.rss`);
    }
  }

  let lastErr = null;
  for (const url of urlsToTry) {
    try {
      const rss = await _fetchRedditRss(url, headers, proxy);
      const items = parseRssItems(rss, max);
      if (items.length > 0) return items;
    } catch (e) {
      lastErr = e;
      // Try next URL
    }
  }
  throw lastErr || new Error('Reddit RSS fetch failed (all URLs exhausted)');
}
