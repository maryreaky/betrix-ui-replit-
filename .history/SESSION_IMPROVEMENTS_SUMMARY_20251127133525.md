# BETRIX Session Improvements Summary

## Session Overview
This session focused on completing three major request phases:
1. ✅ Redis telemetry injection + callback alerting
2. ✅ Enhanced signup flow with payment method selection
3. ✅ Public betting/odds scrapers (Goal.com, Flashscore)

---

## Commits & Changes

### Commit 8f48653: Redis Injection + Callback Alerting
**File:** `src/worker-final.js`

- **Feature 1: Telemetry Redis Injection**
  - Added `v2Handler.setTelemetryRedis(redis)` call after v2 handler initialization
  - Wires live telemetry counters from telegram-handler-v2.js to Redis
  - Enables real-time monitoring of callback_data truncation, repetition patterns, and enrichment success rates

- **Feature 2: Callback Alert Loop**
  - Automatic 60-second interval check for callback telemetry threshold violations
  - Triggers admin Telegram message when:
    - Callback truncation events exceed 10 per window
    - Odds repetition pattern detected more than 5 times
  - Auto-resets counters after alert sent
  - Graceful error handling if admin ID not configured or Telegram unavailable

**Impact:** Real-time observability for callback stability and automatic admin alerting on anomalies

---

### Commit 47df128: Enhanced Signup Flow + Proxy Support
**Files:** 
- `src/handlers/telegram-handler-v2.js` (signup flow refactor)
- `src/services/live-scraper.js` (proxy rotation setup)

#### Signup Flow Improvements:
1. **Multi-Step Onboarding (Name → Age → Country → Payment Method)**
   - Captures user profile in Redis hash `user:${userId}:profile` with fields:
     - `name` (required, 2+ chars)
     - `age` (required, 13+)
     - `country` (KE, NG, US, UK, OTHER)
     - `paymentMethod` (preferred method for this user)

2. **New Handler: `handleSignupPaymentMethodSelection()`**
   - Presents country-specific payment method options after country selection
   - Returns methods via `getAvailablePaymentMethods(country)`
   - Stores preference in user profile for future use

3. **Improved Payment Confirmation**
   - Displays full signup summary (name, age, country, payment method)
   - Shows regional signup fee: 150 KES (Kenya), 1 USD/GBP (others)
   - Enhanced instructions with emoji and clear next steps
   - Manual verification option: paste M-Pesa/payment confirmation directly

4. **Enhanced Payment Verification Handler**
   - Validates payment method is available in selected country
   - Clear success/failure messages with tier features listed
   - Suggests contacting support on failure with specific error message

#### Proxy Support Skeleton (Not Yet Wired):
- Added proxy parsing from `LIVE_SCRAPER_PROXIES` env var (comma-separated)
- Implemented proxy rotation via `getNextProxy()` function
- Proxy logging ready (actual proxy agent integration pending)

**Impact:** Better user profiling, region-aware payment flow, improved data persistence

---

### Commit 2be9d16: Public Betting Scrapers
**Files:**
- `src/services/goal-scraper.js` (NEW)
- `src/services/flashscore-scraper.js` (NEW)
- `src/services/sports-aggregator.js` (integration)

#### Goal.com Scraper Features:
- **Function:** `getLiveMatchesFromGoal(league)`
  - Scrapes Goal.com fixtures page using Cheerio
  - Extracts team names, scores, basic odds data
  - Supports league paths: premier-league, la-liga, serie-a, bundesliga, ligue-1, champions-league, etc.
  - Returns match array: `[{ home, away, score, odds, source: 'goal.com' }]`

- **Function:** `getGoalOdds()`
  - Fetches Goal's odds comparison page
  - Extracts numeric odds values from embedded provider data
  - Returns top 10 odds with provider attribution

- **Helper:** `getGoalLeagueCodes()` - Maps league IDs to Goal.com URL paths

#### Flashscore Scraper Features:
- **Function:** `getLiveMatchesFromFlashscore(sport)`
  - Scrapes Flashscore main page for live matches
  - HTML fallback (Flashscore uses heavy JS; full dynamic rendering would require Puppeteer)
  - Returns array: `[{ home, away, score, status, time, source: 'flashscore.com' }]`

- **Function:** `getLiveMatchesByLeagueFromFlashscore(leagueId)`
  - Scrapes specific league pages with numeric IDs
  - Supports popular leagues: 17=PL, 87=LaLiga, 106=SerieA, 34=Bundesliga, 53=Ligue1, etc.
  - Enforces rate-limiting + retry logic (inherited from fetch patterns)

- **Function:** `getFlashscoreMatchDetails(matchId)`
  - Detailed match page scraping
  - Extracts team stats (possession, shots, passes, etc.)
  - Returns: `{ matchId, home, away, score, status, stats, source: 'flashscore.com' }`

- **Helper:** `getFlashscoreLeagueIds()` - Reference for league numeric IDs

#### Sports Aggregator Integration:
- **Live Matches Priority Chain (Updated):**
  1. SportsData.io
  2. SportsMonks
  3. API-Sports (API-Football)
  4. Football-Data.org
  5. SofaScore
  6. AllSports API
  7. ScoreBat (with ESPN enrichment)
  8. OpenLigaDB
  9. ESPN Public API (with enrichment)
  10. **Goal.com** ← NEW
  11. **Flashscore** ← NEW
  12. Demo data (fallback)

- **Odds Priority Chain (Updated):**
  1. API-Sports (API-Football)
  2. SofaScore
  3. AllSports API
  4. SportsData.io
  5. SportsMonks
  6. **Goal.com** ← NEW
  7. Demo data (fallback)

- **League ID Mapping:** Automatically translates internal league IDs (39=PL, 140=LaLiga, etc.) to Goal.com/Flashscore-specific paths

**Impact:** Real, publicly-sourced betting odds and live match data; no API keys required; fallback coverage for all major European leagues

---

## Technical Improvements Summary

### Observability & Monitoring
✅ Real-time callback_data truncation alerts (Redis telemetry → admin Telegram)  
✅ Repetition pattern detection for corrupted callbacks  
✅ Automatic threshold-based alerting (configurable in code)  

### User Data & Persistence
✅ User profile hash in Redis: `user:${userId}:profile` (name, age, country, paymentMethod)  
✅ Multi-step signup preserves all fields in single Redis hash  
✅ Payment method preference stored for future transactions  

### Payment Flow
✅ Country-aware payment method selection  
✅ Regional fee calculation (150 KES Kenya, 1 USD others)  
✅ Enhanced payment verification with method validation  
✅ Clear confirmation messages with tier benefits  

### Data Quality & Live Scores
✅ Goal.com live matches & odds (no registration)  
✅ Flashscore live scoreboard (no registration)  
✅ Automatic league mapping for new sources  
✅ Per-domain rate-limiting + exponential backoff retry  
✅ UA rotation (4 browsers) to reduce blocking  

### Infrastructure
✅ Proxy rotation skeleton ready for LIVE_SCRAPER_PROXIES env var  
✅ Flexible provider enable/disable via config  
✅ Health tracking for each provider  
✅ Cache TTL optimization (2min live, 30min news, 10min odds)  

---

## Environment Configuration

### New Environment Variables (Optional)
```bash
# Live scraper rate-limiter interval (ms, default 500)
LIVE_SCRAPER_MIN_INTERVAL_MS=500

# Proxy support (comma-separated list, optional)
LIVE_SCRAPER_PROXIES=http://proxy1:port,http://proxy2:port

# Admin Telegram ID for callback alerts
TELEGRAM_ADMIN_ID=123456789
```

### Redis Keys Used (New)
```
betrix:telemetry:callback_truncated_outgoing    # Count of truncated callbacks
betrix:telemetry:callback_repetition_odds       # Count of odds_* repetition patterns
betrix:telemetry:callback_truncated_samples     # Stored samples of truncated callbacks
betrix:telemetry:live_scraper:attempts          # Enrichment attempts
betrix:telemetry:live_scraper:success           # Enrichment successes
betrix:telemetry:live_scraper:fail              # Enrichment failures

user:${userId}:profile:name                     # User full name
user:${userId}:profile:age                      # User age
user:${userId}:profile:country                  # User country (KE/NG/US/UK/OTHER)
user:${userId}:profile:paymentMethod            # Preferred payment method
```

---

## Testing & Validation

### Manual Test Commands
```bash
# Test Goal.com scraper
node -e "import('./src/services/goal-scraper.js').then(m => m.getLiveMatchesFromGoal('premier-league').then(r => console.log(JSON.stringify(r, null, 2))))"

# Test Flashscore scraper
node -e "import('./src/services/flashscore-scraper.js').then(m => m.getLiveMatchesByLeagueFromFlashscore('17').then(r => console.log(JSON.stringify(r, null, 2))))"

# Test signup flow (in Telegram)
/start → follow onboarding steps → name → age → country → payment method → payment confirmation
```

### Known Limitations
- Goal.com & Flashscore selectors may break if site redesigns (fragile scraping)
- HTML-only fallback for Flashscore (JS-heavy site; Puppeteer would improve reliability)
- Proxy integration skeleton (actual proxy agent not yet connected to fetch calls)
- ToS compliance: Ensure scraping aligns with Goal.com and Flashscore Terms of Service

---

## Files Modified This Session

```
src/worker-final.js                      (Redis injection + admin alerts)
src/handlers/telegram-handler-v2.js      (signup flow refactor + payment improvements)
src/services/live-scraper.js             (proxy skeleton)
src/services/sports-aggregator.js        (Goal + Flashscore integration)
src/services/goal-scraper.js             (NEW - Goal.com scraper)
src/services/flashscore-scraper.js       (NEW - Flashscore scraper)
```

---

## Next Session Recommendations

### Priority 1: Proxy Integration
- Wire actual proxy support into `retryFetchJson()` using `https-proxy-agent` or `axios`
- Test with free proxy list (e.g., from free-proxy-list.net)
- Add proxy health checks to detect dead proxies

### Priority 2: Scraper Robustness
- Add Puppeteer/Playwright for Flashscore (JS rendering required for full match data)
- Implement selector fallbacks for Goal.com/Flashscore (detect layout changes)
- Add automatic selector update mechanism

### Priority 3: Betting Odds Expansion
- Implement Oddschecker.com scraper (larger odds comparison)
- Add Betfair public API (if accessible without registration)
- Create odds normalization function (convert all sources to 1.5, 2.0, 2.5 format)

### Priority 4: Legal Compliance
- Add ToS disclaimer in bot when displaying Goal.com/Flashscore data
- Implement rate-limiting to avoid overwhelming scrape targets
- Monitor for 429 (rate limit) and 403 (blocked) errors; auto-switch providers if detected

### Priority 5: UX Improvements
- Add "Show odds comparison" button in match details (display all available sources)
- Add "Live updates" refresh button (manual re-scrape with visual counter)
- Show data source & last updated timestamp in match displays

---

## Commits Pushed (Session)
```
1b8f6dc - callback_data telemetry, live-scraper rate-limiter+retries, BBC/Reuters/ESPN RSS
8f48653 - inject telemetry Redis into v2Handler + add callback alert loop
47df128 - enhanced signup flow (name/age/country/payment), improved payment verification, proxy skeleton
2be9d16 - add Goal.com and Flashscore public betting scrapers as fallback sources
```

---

**Session Status:** ✅ All requested features complete and pushed to main
**Token Usage:** ~60K / 200K
