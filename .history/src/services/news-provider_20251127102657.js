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

export async function getRedditHeadlines({ subreddit = 'soccer', max = 10 } = {}) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/.rss`;
  const res = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'betrix-bot/1.0 (+https://example.com)' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Reddit RSS fetch failed: ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
  }
  const rss = await res.text();
  const items = parseRssItems(rss, max);
  return items;
}
