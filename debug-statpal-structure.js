#!/bin/bash
# Debug script to test StatPal match data structure
# Usage: node debug-statpal-structure.js

const StatPalService = require('./src/services/statpal-service.js').default;
const { Logger } = require('./src/utils/logger.js');

const logger = new Logger('StatPalDebug');

async function inspectStatPalData() {
  const service = new StatPalService();
  
  console.log('🔍 Inspecting StatPal Data Structure...\n');
  
  const sports = ['soccer', 'nfl', 'nba', 'nhl', 'mlb', 'cricket', 'tennis'];
  
  for (const sport of sports) {
    try {
      console.log(`\n📡 Fetching ${sport.toUpperCase()} live scores...`);
      const data = await service.getLiveScores(sport, 'v1');
      
      if (!data) {
        console.log(`   ⚠️  ${sport}: No data returned`);
        continue;
      }
      
      // Determine structure
      let matches = [];
      if (Array.isArray(data)) {
        matches = data;
        console.log(`   ✅ Response is direct array with ${data.length} items`);
      } else if (data.data && Array.isArray(data.data)) {
        matches = data.data;
        console.log(`   ✅ Response.data is array with ${data.data.length} items`);
      } else if (data.matches && Array.isArray(data.matches)) {
        matches = data.matches;
        console.log(`   ✅ Response.matches is array with ${data.matches.length} items`);
      }
      
      if (matches.length === 0) {
        console.log(`   ℹ️  No matches found for ${sport}`);
        continue;
      }
      
      // Inspect first match
      const sample = matches[0];
      console.log(`\n   First match structure:`);
      console.log(`   Keys: ${Object.keys(sample).slice(0, 10).join(', ')}...`);
      
      // Check for team data
      const hasHome = sample.home || sample.homeTeam || sample.home_team || 
                      (sample.teams && sample.teams.home) ||
                      (sample.teams && sample.teams[0]) ||
                      sample.main_team;
      
      const hasAway = sample.away || sample.awayTeam || sample.away_team ||
                      (sample.teams && sample.teams.away) ||
                      (sample.teams && sample.teams[1]) ||
                      sample.visitor_team;
      
      if (hasHome && hasAway) {
        console.log(`   ✅ Has home/away data`);
      } else {
        console.log(`   ⚠️  Missing home/away data! Sample: ${JSON.stringify(sample).substring(0, 200)}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n✅ Inspection complete');
}

inspectStatPalData().catch(console.error);
