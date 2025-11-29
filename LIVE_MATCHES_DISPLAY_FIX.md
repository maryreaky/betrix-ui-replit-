# Live Matches Display Fix - Team Names Issue

## Problem
The Telegram bot was displaying "Home vs Away" placeholders instead of actual team names in live match lists. While StatPal was successfully fetching 231 live soccer matches, the team names were not being extracted from the API responses.

## Root Cause
StatPal returns match data with various field name conventions depending on the sport and data source. The initial implementation only looked for a limited set of field names:
- `home`, `away` 
- `homeTeam`, `awayTeam`
- `teams.home`, `teams.away`
- `home_team`, `away_team`

When these fields were missing or structured differently, the code fell back to default "Home" and "Away" strings.

## Solution
Implemented a three-layered fallback mechanism across the codebase:

### 1. Sports Aggregator (`src/services/sports-aggregator.js`)
Enhanced the `_formatMatches()` method for StatPal to recognize more field patterns:

```javascript
// Additional fallback paths added:
- fixture.home, fixture.away
- teams[0], teams[1] (array indices)
- main_team, visitor_team  
- participants[0].name, participants[1].name
- title-based extraction (e.g., "Team A vs Team B")
```

### 2. Telegram Handler (`src/handlers/telegram-handler-v2.js`)
Added second-level fallback in `handleLiveMenuCallback()`:

```javascript
// When home/away are still "Unknown" or "Home"/"Away", check raw data:
home = teamNameOf(m.raw.homeTeam) || 
       teamNameOf(m.raw.home_team) || 
       teamNameOf(m.raw.teams?.home) || 
       teamNameOf(m.raw.main_team) || 'Home'
```

This applies to both the match text display and keyboard buttons.

### 3. Premium UI Builder (`src/utils/premium-ui-builder.js`)
Enhanced `buildMatchCard()` with similar fallback paths for league-specific match displays.

## Implementation Details

### Field Name Recognition Order
The system now checks in this priority order:
1. Direct field names: `home`, `away`
2. Team object names: `homeTeam`, `awayTeam`, `home_team`, `away_team`
3. Nested paths: `teams.home`, `teams.away`, `teams[0]`, `teams[1]`
4. Sport-specific names: `main_team`, `visitor_team`, `localteam`, `visitorteam`
5. Participant arrays: `participants[0].name`, `participants[1].name`
6. Title-based extraction: parse "Team A vs Team B" format
7. Default fallback: "Home" and "Away"

### Data Validation
Added match validation in `getLiveMatches()` to ensure matches have valid team data before processing:

```javascript
const validMatches = matches.filter(m => {
  const hasTeams = m && (
    (m.home && m.away) ||
    (m.teams && valid_structure) ||
    (m.homeTeam && m.awayTeam) ||
    (m.title && m.title.includes(' vs '))
  );
  return hasTeams;
});
```

## Testing
The fix has been validated against:
- StatPal live scores API response formats
- Multiple API field naming conventions
- Fallback chaining logic
- Raw match data preservation

## Files Modified
1. `src/services/sports-aggregator.js` - Enhanced StatPal field mapping
2. `src/handlers/telegram-handler-v2.js` - Added team name extraction fallbacks
3. `src/utils/premium-ui-builder.js` - Improved match card building logic

## Result
Live matches now display with actual team names instead of placeholders:
- ❌ "1. Home vs Away" (old)
- ✅ "1. Liverpool vs Manchester City" (new)

The system gracefully degrades to "Home" and "Away" only if all other extraction methods fail, ensuring a better user experience while maintaining backward compatibility.
