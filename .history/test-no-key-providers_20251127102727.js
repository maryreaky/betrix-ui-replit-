#!/usr/bin/env node
import ScoreBatService from './src/services/scorebat.js';
import RSSAggregator from './src/services/rss-aggregator.js';
import { getNewsHeadlines, getRedditHeadlines } from './src/services/news-provider.js';
import { SportsAggregator } from './src/services/sports-aggregator.js';

async function run() {
  console.log('Starting no-key providers smoke test');
  const scorebat = new ScoreBatService(null);
  const rss = new RSSAggregator(null, { ttlSeconds: 60 });
  const agg = new SportsAggregator(null, { scorebat, rss });

  try {
    console.log('Fetching ScoreBat feed...');
    const sbResult = await scorebat.freeFeed().catch(e => ({ error: e.message }));
    console.log('ScoreBat result:', Array.isArray(sbResult) ? `items=${sbResult.length}` : sbResult);
  } catch (e) { console.error('ScoreBat test failed', e); }

  try {
    console.log('Fetching live matches from aggregator (league 39)...');
    const matches = await agg.getLiveMatches(39).catch(e => ({ error: e.message }));
    console.log('Aggregator live matches:', Array.isArray(matches) ? `matches=${matches.length}` : matches);
    if (Array.isArray(matches) && matches.length > 0) console.dir(matches.slice(0,3), { depth: 2 });
  } catch (e) { console.error('Aggregator live test failed', e); }

  try {
    console.log('Fetching Google News RSS for "football"...');
    const news = await getNewsHeadlines({ query: 'football', max: 5 }).catch(e => ({ error: e.message }));
    console.log('News items:', Array.isArray(news) ? news.length : news);
    if (Array.isArray(news)) console.dir(news.slice(0,3), { depth: 2 });
  } catch (e) { console.error('News test failed', e); }

  try {
    console.log('Fetching Reddit /r/soccer RSS...');
    const rd = await getRedditHeadlines({ subreddit: 'soccer', max: 5 }).catch(e => ({ error: e.message }));
    console.log('Reddit items:', Array.isArray(rd) ? rd.length : rd);
    if (Array.isArray(rd)) console.dir(rd.slice(0,3), { depth: 2 });
  } catch (e) { console.error('Reddit test failed', e); }

  console.log('No-key providers smoke test complete');
}

run().catch(e => { console.error(e); process.exit(1); });
