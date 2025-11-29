import fetch from 'node-fetch';
import Redis from 'ioredis';

// Prefer explicit REDIS_URL env; fallback to localhost if not provided.
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);

// Attach an error handler so `ioredis` errors do not become unhandled events.
redis.on('error', (err) => {
  try {
    const msg = err && err.message ? err.message : String(err);
    console.error('[ioredis] Error event:', msg);
  } catch (e) {
    console.error('[ioredis] Error event (unable to stringify):', e);
  }
});
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const HOSTS = {
  sofasport: process.env.SOFASPORT_HOST || 'sofasport.p.rapidapi.com',
  osSports: process.env.OSSPORTS_HOST || 'os-sports-perform.p.rapidapi.com',
  sportsbook: process.env.SPORTSBOOK_HOST || 'sportsbook-api.p.rapidapi.com',
  freeFootball: process.env.FREE_FOOTBALL_HOST || 'free-football-data.p.rapidapi.com',
  copilot: process.env.COPILOT_HOST || 'copilot-ai.p.rapidapi.com',
  chatgpt: 'chatgpt.p.rapidapi.com',
  chatgpt4: 'chatgpt4.p.rapidapi.com',
  oddsApi: 'odds-api.p.rapidapi.com',
  sportsInfo: 'sports-information.p.rapidapi.com',
  allSportsApi: 'allsportsapi.p.rapidapi.com',
  footballPred: 'football-prediction.p.rapidapi.com',
  oddsFeed: 'odds-feed.p.rapidapi.com'
};

// --- Telegram send ---
async function sendMessage(chatId, text) {
  if (!TELEGRAM_TOKEN) {
    console.error('Missing TELEGRAM_TOKEN; cannot send Telegram messages.');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) {
    console.error('sendMessage error:', e);
  }
}

// --- Utilities ---
function requireParam(val, label) {
  if (!val) return `Missing ${label}. Usage: provide ${label} after the command.`;
  return null;
}

function ensureKey() {
  if (!RAPIDAPI_KEY) return 'RapidAPI key missing. Set RAPIDAPI_KEY in environment.';
  return null;
}

async function callGet(host, path) {
  const keyMissing = ensureKey(); if (keyMissing) return keyMissing;
  try {
    const res = await fetch(`https://${host}${path}`, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': host
      }
    });
    if (!res.ok) return `HTTP ${res.status}: ${await res.text()}`;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return `Non-JSON response: ${await res.text()}`;
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return `Request failed: ${e.message}`;
  }
}

async function callPost(host, path, body) {
  const keyMissing = ensureKey(); if (keyMissing) return keyMissing;
  try {
    const res = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': host,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return `HTTP ${res.status}: ${await res.text()}`;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return `Non-JSON response: ${await res.text()}`;
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return `Request failed: ${e.message}`;
  }
}

// --- Helpers (13 commands) ---
async function getSofaSportOdds(matchId) {
  const miss = requireParam(matchId, 'matchId'); if (miss) return miss;
  return await callGet(HOSTS.sofasport, `/odds/${encodeURIComponent(matchId)}`);
}

async function getTournamentSeasons(tournamentId) {
  const miss = requireParam(tournamentId, 'tournamentId'); if (miss) return miss;
  return await callGet(HOSTS.osSports, `/tournament/${encodeURIComponent(tournamentId)}/seasons`);
}

async function runAIAnalysis(prompt) {
  const miss = requireParam(prompt, 'prompt'); if (miss) return miss;
  return await callPost(HOSTS.chatgpt, '/chat/completions', {
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });
}

async function getSportsbookAdvantages(sport) {
  const miss = requireParam(sport, 'sport'); if (miss) return miss;
  return await callGet(HOSTS.sportsbook, `/v0/advantages/${encodeURIComponent(sport)}`);
}

async function searchPlayer(name) {
  const miss = requireParam(name, 'player name'); if (miss) return miss;
  return await callGet(HOSTS.freeFootball, `/players/search?name=${encodeURIComponent(name)}`);
}

async function runCopilot(prompt) {
  const miss = requireParam(prompt, 'prompt'); if (miss) return miss;
  return await callPost(HOSTS.copilot, '/copilot', { input: prompt });
}

async function runChatGPT4(prompt) {
  const miss = requireParam(prompt, 'prompt'); if (miss) return miss;
  return await callPost(HOSTS.chatgpt4, '/chat', { input: prompt });
}

async function getScores(fixtureId) {
  const miss = requireParam(fixtureId, 'fixtureId'); if (miss) return miss;
  return await callGet(HOSTS.oddsApi, `/scores/${encodeURIComponent(fixtureId)}`);
}

async function getMBBNews() {
  return await callGet(HOSTS.sportsInfo, '/mbb/news');
}

async function runChatCompletion(prompt) {
  const miss = requireParam(prompt, 'prompt'); if (miss) return miss;
  return await callPost(HOSTS.chatgpt, '/chat/completions', {
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }]
  });
}

async function getTeamTransfers(teamId) {
  const miss = requireParam(teamId, 'teamId'); if (miss) return miss;
  return await callGet(HOSTS.allSportsApi, `/api/team/${encodeURIComponent(teamId)}/transfers`);
}

async function getFootballPrediction(query) {
  const miss = requireParam(query, 'query'); if (miss) return miss;
  const path = query.includes('=') ? `/predictions?${query}` : '/predictions';
  return await callGet(HOSTS.footballPred, path);
}

async function getMarkets(eventId) {
  const miss = requireParam(eventId, 'eventId'); if (miss) return miss;
  return await callGet(HOSTS.oddsFeed, `/markets/feed?eventId=${encodeURIComponent(eventId)}`);
}

// --- Help ---
function helpText() {
  return [
    'Commands:',
    '/start — Welcome',
    '/help — This help menu',
    '/odds <matchId> — SofaSport odds',
    '/seasons <tournamentId> — Tournament seasons',
    '/ai <prompt> — Lightweight AI',
    '/advantages <sport> — Arbitrage opportunities',
    '/player <name> — Player search',
    '/copilot <prompt> — Copilot AI',
    '/ai4 <prompt> — ChatGPT-4',
    '/scores <fixtureId> — Fixture scores',
    '/news — NCAA MBB news',
    '/chat <prompt> — ChatGPT completions',
    '/transfers <teamId> — Team transfers',
    '/predict <query> — Predictions (e.g., league=EPL&date=2025-11-20)',
    '/markets <eventId> — Markets feed'
  ].join('\n');
}

// --- Router ---
async function handleCommand(chatId, text) {
  const [cmd, ...args] = (text || '').trim().split(' ');
  const argstr = args.join(' ');
  let reply;

  try {
    switch (cmd) {
      case '/start': reply = 'Welcome to BETRIX! Your bot is live.'; break;
      case '/help': reply = helpText(); break;
      case '/odds': reply = await getSofaSportOdds(args[0]); break;
      case '/seasons': reply = await getTournamentSeasons(args[0]); break;
      case '/ai': reply = await runAIAnalysis(argstr); break;
      case '/advantages': reply = await getSportsbookAdvantages(args[0]); break;
      case '/player': reply = await searchPlayer(argstr); break;
      case '/copilot': reply = await runCopilot(argstr); break;
      case '/ai4': reply = await runChatGPT4(argstr); break;
      case '/scores': reply = await getScores(args[0]); break;
      case '/news': reply = await getMBBNews(); break;
      case '/chat': reply = await runChatCompletion(argstr); break;
      case '/transfers': reply  = await getTeamTransfers(args[0]); break;
      case '/predict': reply = await getFootballPrediction(argstr); break;
      case '/markets': reply = await getMarkets(args[0]); break;
      default: reply = 'Unknown command. Type /help for options.';
    }
  } catch (e) {
    reply = `Error: ${e.message}`;
  }

  await sendMessage(chatId, reply);
}

// --- Worker loop ---
async function workerLoop() {
  while (true) {
    try {
      const jobRaw = await redis.lpop('telegram-jobs');
      if (!jobRaw) { 
        await new Promise(r => setTimeout(r, 500)); 
        continue; 
      }
      const job = JSON.parse(jobRaw);
      const chatId = job?.payload?.message?.chat?.id;
      const text = job?.payload?.message?.text;
      if (!chatId) continue;
      await handleCommand(chatId, text);
    } catch (e) {
      console.error('Worker loop error:', e);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

workerLoop();
