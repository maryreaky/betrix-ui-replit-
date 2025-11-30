# Telegram Message Edit & Live Feed Stability Fixes
**November 29, 2025**

## Problems Fixed

### 1. Telegram "message is not modified" (400) Loop
**Symptom**: Worker logs show repeated `editMessageText` failures when users tap the same menu button.  
**Root Cause**: Sending identical text+markup to the same message returns HTTP 400.  
**Solution**: `TelegramService.editMessage()` now catches "not modified" and silently no-ops; also handles "message to edit not found" by falling back to `sendMessage()`.

### 2. SportMonks 404 Spam & Live Menu Reliability
**Symptom**: Per-league SportMonks calls (league 39, 140, etc.) return 404 "Page Not Found | B2C Solutions".  
**Root Cause**: SportMonks DNS resolves to B2C Solutions infrastructure on Render; per-league calls are unreliable.  
**Solution**: Refactored `getAllLiveMatches()` to use Football-Data global matches endpoint first (`/matches?dateFrom=…&dateTo=…`), only falling back to SportMonks if FD returns nothing.

### 3. Menu Text Collisions
**Symptom**: Re-sending the same "🏟 Live Matches" text+markup multiple times causes edit failures.  
**Solution**: `safeEdit()` utility adds a freshness stamp (_Refreshed HH:MM:SS_) to every message text, ensuring distinct content on each refresh.

## Files Modified

### `src/services/sports-aggregator.js`
- **Added** `_getLiveFromFootballDataGlobal()`: Fetches all live matches across all leagues for a date range; returns up to 200 matches.
- **Updated** `getAllLiveMatches()`: Now tries Football-Data global endpoint first → per-league fallback → SportMonks fallback → cache.
- **Outcome**: Eliminates per-league 404s, reduces API noise, reliable live match population.

### `src/services/telegram.js`
- **Updated** `editMessage()`: Added try-catch to detect "message is not modified" (no-op) and "message to edit not found" (fallback to sendMessage).
- **Result**: Graceful handling; no more 400 error bubbling.

### `src/bot/utils/safeEdit.js` (NEW)
- Standalone utility for ctx-level edits in Telegraf-style handlers.
- Adds HH:MM:SS refresh stamp to ensure distinct content.
- Handles not-modified + cant-edit scenarios.
- Example usage:
  ```javascript
  import { safeEdit } from "../utils/safeEdit.js";
  await safeEdit(ctx, "🏟 Live Matches:", { inline_keyboard: [...buttons] });
  ```

## Deployment Checklist

1. ✅ Syntax check: All three files pass Node.js `-c` validation.
2. ✅ Add logic: `_getLiveFromFootballDataGlobal()` in sports-aggregator.
3. ✅ Update logic: `getAllLiveMatches()` priority order.
4. ✅ Resilience: `TelegramService.editMessage()` catches benign 400s.
5. ✅ Utility: `safeEdit()` available for future handler refactoring.

## Expected Behavior After Deploy

### Scenario: User taps `/live` → "Live Matches" menu
1. Worker calls `sportsAggregator.getAllLiveMatches()`.
2. FD global endpoint returns live matches (or empty).
3. Falls back to per-league FD (if global empty).
4. Falls back to SportMonks (if FD returns nothing).
5. Falls back to Redis cache (if all APIs fail).
6. Message edits with fresh timestamp; no 400 errors.

### Scenario: User re-taps the same button
1. New text generated with updated HH:MM:SS stamp.
2. `editMessage()` succeeds or recognizes "not modified".
3. No error spam in logs.
4. UX: "Refreshed 14:32:57" ← Clear indication of when last update occurred.

## Cache & Prefetch Coherence

- **Live cache TTL**: 30 seconds.
- **Fixtures cache TTL**: 5–10 minutes.
- **Prefetch runs**: Every 60 seconds, feeding cache with the freshest data.
- **Menu refresh stamp**: Distinct on each edit, allowing Telegram to detect content change.

## Testing Commands

After deploy, test in Telegram:
```
/live            → Should show live matches with distinct timestamps
[Tap same button again] → Should see updated timestamp, no error spam
/fixtures        → Should show upcoming with distinct content
[Refresh repeatedly]  → No 400 loops in logs
```

Check logs:
```bash
# Should see
✅ Football-Data (global): Found X live matches
Telegram editMessage: message not modified (no-op)
# Should NOT see
Bad Request: message is not modified (ERROR)
Football-Data live for 39 failed: 404
```

## Rollback Plan

If issues arise, revert the three files:
- `git checkout src/services/sports-aggregator.js`
- `git checkout src/services/telegram.js`
- `git rm src/bot/utils/safeEdit.js` (optional; new file)

Deploy and restart worker.

## Next Steps (Optional)

1. **Refactor callback handlers** to use `safeEdit()` for cleaner edit logic.
2. **Add pagination** with distinct page labels ("Page 1", "Page 2").
3. **Monitor live feed** latency after global endpoint switch; profile if needed.
