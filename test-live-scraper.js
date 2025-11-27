import { getEspnLiveMatches } from './src/services/espn-provider.js';
import liveScraper from './src/services/live-scraper.js';

(async function run() {
  try {
    console.log('Fetching ESPN live matches (public API)...');
    const matches = await getEspnLiveMatches({ sport: 'football' });
    console.log(`Found ${matches.length} matches from ESPN`);
    if (matches.length === 0) return;

    const sample = matches.slice(0, 5);
    console.log('Sample matches:');
    sample.forEach((m, i) => console.log(i + 1, m.name || `${m.home?.name || ''} vs ${m.away?.name || ''}`, 'id:', m.id));

    console.log('\nAttempting enrichment via live-scraper...');
    const enriched = await liveScraper.enrichMatchesWithLiveStats(sample, { sport: 'football' });
    console.log('Enriched results:');
    enriched.forEach((m, i) => console.log(i + 1, m.name || m.title || `${m.home?.name || m.home} vs ${m.away?.name || m.away}`, '\n', JSON.stringify(m.liveStats || m.raw || {}, null, 2)));
  } catch (e) {
    console.error('test-live-scraper failed', e);
    process.exitCode = 2;
  }
})();
