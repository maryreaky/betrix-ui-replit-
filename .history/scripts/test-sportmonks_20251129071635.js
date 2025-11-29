#!/usr/bin/env node
import SportMonksService from '../src/services/sportmonks-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const sm = new SportMonksService(null);
  console.log('SportMonks base:', sm.base);
  if (!sm.key) {
    console.error('ERROR: SPORTSMONKS API key not found. Set SPORTSMONKS_API_KEY in your env.');
    process.exit(2);
  }

  try {
    const data = await sm.fetchAll();
    if (!data) {
      console.error('No data returned from SportMonks.');
      process.exit(1);
    }
    console.log('=== SportMonks Sample ===');
    console.log('Livescores (first 5):', Array.isArray(data.livescores) ? data.livescores.slice(0,5) : data.livescores);
    console.log('Fixtures (first 5):', Array.isArray(data.fixtures) ? data.fixtures.slice(0,5) : data.fixtures);
    console.log('Teams (first 5):', Array.isArray(data.teams) ? data.teams.slice(0,5) : data.teams);
  } catch (e) {
    console.error('Fetch failed:', e?.message || e);
    process.exit(1);
  }
}

main();
