import 'dotenv/config';
import fetch from 'node-fetch';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const apiFootballKey = process.env.API_FOOTBALL_KEY || process.env.API_SPORTS_KEY;
const sportsdataKey = process.env.SPORTSDATA_API_KEY || process.env.SPORTSDATA_KEY;
const sportmonksKey = process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_API_KEY;

const apiFootballVariants = [
  { name: 'rapidapi', base: process.env.API_FOOTBALL_BASE || 'https://api-football-v3.p.rapidapi.com', headers: { 'x-rapidapi-key': apiFootballKey, 'x-rapidapi-host': 'api-football-v3.p.rapidapi.com' } },
  { name: 'rapidapi-alt-host', base: 'https://api-football.p.rapidapi.com', headers: { 'x-rapidapi-key': apiFootballKey, 'x-rapidapi-host': 'api-football.p.rapidapi.com' } },
  { name: 'apisports-direct', base: process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io', headers: { 'x-apisports-key': apiFootballKey } },
  { name: 'apisports-alt', base: 'https://football.api-sports.io', headers: { 'x-apisports-key': apiFootballKey } }
];

const sportsdataVariants = [
  { name: 'api.sportsdata.io', base: process.env.SPORTSDATA_BASE || 'https://api.sportsdata.io' },
  { name: 'sportsdata.io', base: process.env.SPORTSDATA_HOST || 'https://sportsdata.io' }
];

const sportmonksVariants = [
  { name: 'sportsmonks-v3', base: process.env.SPORTSMONKS_BASE || 'https://api.sportsmonks.com/v3' },
  { name: 'sportsmonks-soccer-api', base: 'https://soccer.sportmonks.com/api/v2' },
  { name: 'sportmonks-alt', base: 'https://api.sportmonks.com/v3' }
];

async function probe(path, variants, optionsFactory) {
  const results = [];
  for (const v of variants) {
    const url = `${v.base.replace(/\/$/, '')}${path}`;
    const headers = (optionsFactory && optionsFactory(v)) || v.headers || {};
    try {
      const res = await fetch(url, { headers, timeout: 10000 });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch (e) { body = text; }
      results.push({ variant: v.name, url, status: res.status, ok: res.ok, body });
    } catch (e) {
      results.push({ variant: v.name, url, error: e.message });
    }
    await sleep(300);
  }
  return results;
}

(async () => {
  console.log('\n=== Extended Probe: API-Football header/host permutations ===');
  if (!apiFootballKey) console.log('No API-Football key configured');
  else {
    const path = '/fixtures?league=39&status=LIVE';
    const r = await probe(path, apiFootballVariants, v => v.headers);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n=== Extended Probe: SportsData endpoints ===');
  if (!sportsdataKey) console.log('No SportsData key configured');
  else {
    const paths = [
      `/v3/soccer/scores/json/LiveGames?key=${sportsdataKey}`,
      `/v3/soccer/scores/json/GamesByDate?date=2025-11-27&key=${sportsdataKey}`,
      `/v3/soccer/scores/json/Competitions?key=${sportsdataKey}`
    ];
    for (const p of paths) {
      const r = await probe(p, sportsdataVariants);
      console.log(`\nPath: ${p}`);
      console.log(JSON.stringify(r, null, 2));
    }
  }

  console.log('\n=== Extended Probe: SportsMonks variants ===');
  if (!sportmonksKey) console.log('No SportsMonks key configured');
  else {
    const path = `/football/fixtures?include=teams,league,scores&filters=status_code:1&api_token=${sportmonksKey}`;
    const r = await probe(path, sportmonksVariants);
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\nExtended probe completed');
})();
