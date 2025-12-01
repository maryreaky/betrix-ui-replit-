# Live Feed Real Names Fix - November 30, 2025

## Problem Summary

The live feed and fixtures were **not displaying real team names** on the Render deployment. Instead, users saw generic labels like "Home" and "Away", or the matches weren't displaying at all with real match data.

### Root Causes Identified

1. **Incomplete Team Name Extraction in SportsAggregator**
   - The `_formatMatches()` method in `sports-aggregator.js` was not properly handling the various nested structures returned by SportMonks and Football-Data APIs
   - SportMonks returns data with `participants` array but the extraction logic wasn't checking all possible nested paths
   - Football-Data returns team data in nested objects like `homeTeam` and `awayTeam` but fallbacks weren't configured

2. **Worker.js Using Legacy API-Sports Provider**
   - `worker.js` was still trying to use the old `apiFootball.live()` method which calls the deprecated API-Sports endpoint
   - This provider is not configured on Render and fails with authentication errors
   - The handlers were not integrated with the new `SportsAggregator` service

3. **SportsAggregator Not Exported from app.js**
   - While `SportsAggregator` was defined in `src/services/sports-aggregator.js`, it was never instantiated or exported from `app.js`
   - Worker.js could not access the unified aggregator even if it knew about it

## Solutions Implemented

### 1. Enhanced Team Name Extraction (src/services/sports-aggregator.js)

Updated `_formatMatches()` method with multi-strategy extraction for SportMonks data:

```javascript
// Strategy 1: Try participants array (primary)
const participants = m.participants || m.teams || [];
if (Array.isArray(participants) && participants.length >= 2) {
  // Multiple fallback paths for team name extraction
  homeName = safe(
    (home.name || home.fullName || (home.meta && home.meta.name) || 
     (home.team && home.team.name) || (home.data && home.data.name)),
    'Home'
  );
  // ... repeat for away team
}

// Strategy 2: Try teams object if participants failed
if (homeName === 'Home' && m.teams && typeof m.teams === 'object') {
  homeName = safe(m.teams.home.name || m.teams.home.fullName, 'Home');
}

// Strategy 3: Try direct properties
if (homeName === 'Home' && (m.homeTeam || m.home_team)) {
  homeName = safe(ht.name || ht.fullName, 'Home');
}
```

### 2. Robust Football-Data Formatting

Updated Football-Data parsing to handle multiple score field locations:

```javascript
// Try different score field locations
let homeScore = null;
if (m.score && m.score.fullTime) {
  homeScore = m.score.fullTime.home;
} else if (m.score && m.score.current) {
  homeScore = m.score.current.home;
} else if (typeof m.homeTeamScore === 'number') {
  homeScore = m.homeTeamScore;
}
// ... also added fallback for team names across 3 different property paths
```

### 3. SportsAggregator Integration (src/app.js)

- **Added import**: `import { SportsAggregator } from "./services/sports-aggregator.js";`
- **Instantiated service**:
  ```javascript
  const sportsAggregator = new SportsAggregator(redis, { 
    scorebat,
    rss: rssAggregator,
    openLiga
  });
  ```
- **Exported for use**: `export { sportsAggregator };`

### 4. Worker.js Integration (src/worker.js)

- **Added import**: `import { sportsAggregator } from './app.js';`
- **Updated /live handler**:
  ```javascript
  async live(chatId, userId) {
    const matches = await sportsAggregator.getAllLiveMatches();
    // Format with proper team names, scores, and league info
    const text = matches.slice(0, PAGE_SIZE).map((m, i) => {
      const score = m.homeScore !== null && m.awayScore !== null 
        ? `${m.homeScore}-${m.awayScore}` : 'vs';
      const league = m.league ? ` 🏆 ${m.league}` : '';
      return `${i + 1}. ${escapeHtml(m.home)} <b>${score}</b> ${escapeHtml(m.away)}${league}`;
    }).join("\n");
  }
  ```

## Data Flow After Fix

```
User sends: /live command
    ↓
worker.js handler calls sportsAggregator.getAllLiveMatches()
    ↓
SportsAggregator attempts providers in order:
  1. Football-Data API
  2. SportMonks API (fallback)
  3. Redis cache (if APIs fail)
    ↓
_formatMatches() normalizes data:
  - Extracts real team names using multi-strategy approach
  - Handles score extraction
  - Maps status codes to canonical values (LIVE, SCHEDULED, FINISHED)
    ↓
Match formatter displays:
  "🔴 Manchester United 2 - 1 Liverpool 🏆 Premier League"
  (with proper real names, scores, and league)
```

## Testing Checklist

After deploying these changes:

1. **Test /live command**: Should show real team names, not "Home" vs "Away"
2. **Test /fixtures command**: Should show upcoming matches with real names
3. **Check logs for**: `[SPORTSMONKS_FORMAT]` and `[FOOTBALLDATA_FORMAT]` debug messages
4. **Verify data**: Names like "Manchester United", "Liverpool", etc., appear, not generics
5. **Test fallback**: Should still work if primary API is unavailable
6. **Check cache**: Should populate from prefetch cycles

## Files Modified

1. **src/services/sports-aggregator.js**
   - Enhanced `_formatMatches()` with multi-strategy team name extraction
   - Added debug logging for data transformation
   - Improved Football-Data parsing for multiple field locations

2. **src/app.js**
   - Added SportsAggregator import
   - Instantiated SportsAggregator with other services
   - Exported SportsAggregator for external use

3. **src/worker.js**
   - Imported sportsAggregator from app.js
   - Updated /live handler to use SportsAggregator instead of legacy apiFootball
   - Improved message formatting with team names, scores, and leagues

## Why This Fixes The Issue

**Before**: Worker.js used API-Sports which isn't configured on Render → fallback to cache → cache had unformatted data → displayed generic "Home"/"Away"

**After**: Worker.js uses SportsAggregator → SportMonks/Football-Data primary → proper multi-path extraction → real team names displayed

The key insight: The APIs were working (as shown in deployment logs), but the **data extraction logic wasn't robust enough** to handle all the variations in how SportMonks and Football-Data structure their responses, and worker.js wasn't using the right service.

## Deployment Instructions

1. Commit these changes to main
2. Push to GitHub
3. Render will auto-deploy
4. Wait 2-3 minutes for the new build
5. Test commands in Telegram bot
6. Check Render logs for `[SPORTSMONKS_FORMAT]` messages confirming the new code is running

## Performance Notes

- Real team name extraction adds minimal overhead (3-4 object lookups max per match)
- All changes maintain existing cache TTLs and Redis integration
- No new external API calls introduced
- Fallback mechanisms preserved and improved
