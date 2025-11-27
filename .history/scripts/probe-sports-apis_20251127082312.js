import 'dotenv/config';
import fetch from 'node-fetch';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probeApiFootball() {
  const key = process.env.API_FOOTBALL_KEY || process.env.API_SPORTS_KEY;
  const hosts = [
    { name: 'rapidapi', base: process.env.API_FOOTBALL_BASE || 'https://api-football-v3.p.rapidapi.com', headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'api-football-v3.p.rapidapi.com' } },
    { name: 'apisports-direct', base: process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io', headers: { 'x-apisports-key': key } }
  ];

  console.log('\n=== Probing API-Football ===');
  if (!key) {
    console.log('No API-Football key configured');
    return [];
  }

  const path = '/fixtures?league=39&status=LIVE';
  const results = [];
  for (const h of hosts) {
    const url = `${h.base.replace(/\/$/, '')}${path}`;
    try {
      const res = await fetch(url, { headers: h.headers, timeout: 10000 });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch(e) { body = text; }
      results.push({ host: h.name, url, status: res.status, ok: res.ok, body });
    } catch (e) {
      results.push({ host: h.name, url, error: e.message });
    }
    await sleep(300);
  }
  console.log(results);
  return results;
}

async function probeSportsData() {
  const key = process.env.SPORTSDATA_API_KEY || process.env.SPORTSDATA_KEY;
  const hosts = [
    { name: 'api.sportsdata.io', base: process.env.SPORTSDATA_BASE || 'https://api.sportsdata.io' },
    { name: 'sportsdata.io', base: process.env.SPORTSDATA_HOST || 'https://sportsdata.io' }
  ];

  console.log('\n=== Probing SportsData.io ===');
  if (!key) {
    console.log('No SportsData key configured');
    return [];
  }

  const path = `/v3/soccer/scores/json/LiveGames?key=${key}`;
  const results = [];
  for (const h of hosts) {
    const url = `${h.base.replace(/\/$/, '')}${path}`;
    try {
      const res = await fetch(url, { timeout: 10000 });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch(e) { body = text; }
      results.push({ host: h.name, url, status: res.status, ok: res.ok, body });
    } catch (e) {
      results.push({ host: h.name, url, error: e.message });
    }
    await sleep(300);
  }
  console.log(results);
  return results;
}

async function probeSportsMonks() {
  const key = process.env.SPORTSMONKS_API || process.env.SPORTSMONKS_API_KEY || process.env.SPORTSMONKS_KEY;
  const bases = [process.env.SPORTSMONKS_BASE || 'https://api.sportsmonks.com/v3', process.env.SPORTSMONKS_HOST || 'https://soccer.sportmonks.com'];

  console.log('\n=== Probing SportsMonks ===');
  if (!key) {
    console.log('No SportsMonks key configured');
    return [];
  }

  const path = `/football/fixtures?include=teams,league,scores&filters=status_code:1&api_token=${key}`;
  const results = [];
  for (const base of bases) {
    const url = `${base.replace(/\/$/, '')}${path}`;
    try {
      const res = await fetch(url, { timeout: 10000 });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch(e) { body = text; }
      results.push({ base, url, status: res.status, ok: res.ok, body });
    } catch (e) {
      results.push({ base, url, error: e.message });
    }
    await sleep(300);
  }
  console.log(results);
  return results;
}

(async () => {
  try {
    await probeApiFootball();
    await probeSportsData();
    await probeSportsMonks();
    console.log('\nProbe completed');
  } catch (e) {
    console.error('Probe failed', e);
    process.exit(1);
  }
})();
