# BETRIX Data Exposure System - Visual Architecture

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BETRIX Data Exposure System                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐                ┌──────────────────────┐
│  SportMonks API     │                │ Football-Data API    │
│  (Primary)          │                │ (Secondary)          │
│                     │                │                      │
│ • Live matches      │                │ • Fixtures           │
│ • Fixtures          │                │ • Standings          │
│ • Standings         │                │ • Leagues            │
│ • Participants      │                │ • Competitions       │
└──────────┬──────────┘                └──────────┬───────────┘
           │                                      │
           │                                      │
           ▼                                      ▼
     ┌─────────────────────────────────────────────────────┐
     │         SportsAggregator Service                    │
     │  ┌───────────────────────────────────────────────┐  │
     │  │ Public Methods:                               │  │
     │  │ • getAllLiveMatches()                         │  │
     │  │ • getUpcomingMatches(leagueId)                │  │
     │  │ • getFixtures()                               │  │
     │  │ • getLeagues()                                │  │
     │  ├───────────────────────────────────────────────┤  │
     │  │ Integration Point:                            │  │
     │  │ • RawDataCache (stores all API responses)     │  │
     │  └───────────────────────────────────────────────┘  │
     └──────────┬──────────────────────┬──────────────────┘
                │                      │
                ▼                      ▼
        ┌─────────────────┐   ┌────────────────────────┐
        │ Memory Cache    │   │  RawDataCache Service  │
        │ (5 min TTL)     │   │  ┌──────────────────┐  │
        │                 │   │  │ Storage Methods: │  │
        │ Fast access     │   │  │ • storeLiveMatches()   │
        │ Performance     │   │  │ • storeFixtures()      │
        │                 │   │  │ • storeMatch()         │
        │ In-Process      │   │  │ • storeStandings()     │
        │ JavaScript Map  │   │  │ • storeLeagues()       │
        │                 │   │  │                        │
        │                 │   │  │ Retrieval Methods:     │
        │                 │   │  │ • getLiveMatches()     │
        │                 │   │  │ • getFixtures()        │
        │                 │   │  │ • getMatchDetail()     │
        │                 │   │  │ • getStandings()       │
        │                 │   │  │ • getLeagues()         │
        │                 │   │  │                        │
        │                 │   │  │ TTL Values:            │
        │                 │   │  │ • Live: 2 min          │
        │                 │   │  │ • Fixtures: 5 min      │
        │                 │   │  │ • Standings: 10 min    │
        │                 │   │  │ • Leagues: 24 hrs      │
        │                 │   │  └──────────────────┘     │
        │                 │   │                           │
        │                 │   │  Storage Backends:        │
        │                 │   │  • Redis (primary)        │
        │                 │   │  • Memory (fallback)      │
        │                 │   │                           │
        │                 │   └────────────────────────────┘
        │                 │
        └─────────────────┴─────────────────────┬──────────────┐
                                                │              │
                                ┌───────────────▼┐   ┌────────▼──────────┐
                                │ Telegram Bot   │   │ Express HTTP API   │
                                │ Commands       │   │                    │
                                │ ┌────────────┐ │   │ DataExposureHandler│
                                │ │ /live      │ │   │ ┌────────────────┐ │
                                │ │ /fixtures  │ │   │ │ GET Endpoints: │ │
                                │ │ /standings │ │   │ │ • /data/summary│ │
                                │ │ /summary   │ │   │ │ • /data/live   │ │
                                │ └────────────┘ │   │ │ • /data/fixture│ │
                                │                │   │ │ • /data/match  │ │
                                │ Uses:          │   │ │ • /data/standin│ │
                                │ MatchFormatter │   │ │ • /data/league │ │
                                │ LiveFeedHandler│   │ │ • /data/schema │ │
                                │                │   │ │ • /data/export │ │
                                │                │   │ │ • /data/cache* │ │
                                │ Returns:       │   │ │                │ │
                                │ Formatted Text │   │ │ POST Endpoints:│ │
                                │ with Emojis    │   │ │ • /cache-cleanp│ │
                                │                │   │ └────────────────┘ │
                                └────────────────┘   │                    │
                                                      │ Returns:           │
                                                      │ JSON + Metadata    │
                                                      │                    │
                                                      └────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      Prefetch Scheduler (60s Cycle)                         │
│                                                                              │
│   Every 60 seconds:                                                          │
│   1. SportsAggregator.getAllLiveMatches()  ──→  RawDataCache.store()       │
│   2. SportsAggregator.getUpcomingMatches() ──→  RawDataCache.store()       │
│      (for each major league: 39, 140, 135, 61, 78, 2)                       │
│   3. Redis pub/sub: "prefetch:updates" event                                │
│   4. Log: "Prefetch cycle: X live, Y upcoming"                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Request/Response Flow Diagrams

### Flow 1: HTTP API Request for Live Matches

```
Client                Express              Handler               Cache              API
  │                     │                    │                    │                 │
  ├──GET /api/data/live─→                    │                    │                 │
  │                     ├──route match──→    │                    │                 │
  │                     │                ├──getLiveMatches()──→   │                 │
  │                     │                │                    ├─→Redis             │
  │                     │                │                    │  (check TTL)       │
  │                     │                │  ◀───[HIT/MISS]────   │                 │
  │                     │                │                        │                 │
  │                     │      [IF MISS] │                        ├─SportMonks API──→
  │                     │                │                        │                 │
  │                     │                │                    ◀──[Raw Data]────────┤
  │                     │                │                    ├─store with TTL──→  │
  │                     │                │                        │                 │
  │  ◀─────JSON response─                ◀──format & return────── │                 │
  │                     │                    │                    │                 │
  │ {                   │                    │                    │                 │
  │   "source": "...",  │                    │                    │                 │
  │   "count": 5,       │                    │                    │                 │
  │   "matches": [...]  │                    │                    │                 │
  │ }                   │                    │                    │                 │
```

### Flow 2: Telegram Bot Command

```
Telegram User      TelegramService      Handler           SportsAggregator      Cache
      │                  │                  │                   │                 │
      ├─/live command───→│                  │                   │                 │
      │                  ├──handleMessage──→│                   │                 │
      │                  │                  ├─getAllLiveMatches()                 │
      │                  │                  │                   ├─fetch data─→    │
      │                  │                  │                   │              ┌──┴──┐
      │                  │                  │                   │     [API]    │     │
      │                  │                  │                   │←──response──┘     │
      │                  │                  │                   ├─store to cache──→│
      │                  │                  │◀──matches array────               │
      │                  │                  │                                    │
      │                  │                  ├─MatchFormatter.formatLiveMatches()│
      │                  │                  │                                    │
      │                  │                  │ 🔴 LIVE - Man Utd vs Liverpool    │
      │                  │                  │ 45' (2-1) Old Trafford            │
      │                  │                  │                                    │
      │◀─formatted message ◀──sendMessage────                                    │
      │
      │ [User sees formatted response on Telegram]
```

### Flow 3: Prefetch Scheduler Cycle

```
Schedule (every 60s)    Aggregator                Cache                APIs
        │                   │                      │                    │
        ├─tick──→          │                      │                    │
        │               getAllLiveMatches()       │                    │
        │                   ├────────────→ fetchFromSportMonks()───────→│
        │                   │                      │                    │
        │                   │◀───[live matches]────────────────────────┤
        │                   │                      │                    │
        │                   ├─storeLiveMatches()──→│                    │
        │                   │                  ├─setex raw:live:sportsmonks (2min)
        │                   │                  │                        │
        │               getUpcomingMatches(39)  │                    │
        │                   ├─────────────→ fetchFixtures(39)──────→│
        │                   │                      │                    │
        │                   │◀───[fixtures]────────────────────────────┤
        │                   │                      │                    │
        │                   ├─storeFixtures()─────→│                    │
        │                   │                  ├─setex raw:fixtures:sportsmonks:39 (5min)
        │                   │                      │                    │
        │               [repeat for other leagues: 140, 135, 61, 78, 2]│
        │                   │                      │                    │
        │               [repeat for all data types]                    │
        │                   │                      │                    │
        │                   │◀──cycle complete──── │                    │
        │                   │                                           │
        └───────[next cycle in 60s]───────────────→                    │
```

## Cache Hit/Miss Timeline

```
Time →

Request 1: /api/data/live?source=sportsmonks
├─ Cache: MISS
├─ Fetch from API: 300-800ms
├─ Store in cache with 2-min TTL
└─ Response: 310-810ms

Request 2: /api/data/live?source=sportsmonks (1 second later)
├─ Cache: HIT ✓
├─ Served from memory
└─ Response: <5ms (60-150x faster!)

Request 3: /api/data/live?source=sportsmonks (120 seconds later)
├─ Cache: HIT (still valid, 1:40 remaining)
├─ Served from memory
└─ Response: <5ms

Request 4: /api/data/live?source=sportsmonks (121 seconds later)
├─ Cache: MISS (expired after 120 seconds)
├─ Fetch from API: 300-800ms
├─ Store in cache with fresh 2-min TTL
└─ Response: 310-810ms

Prefetch Scheduler (60s cycle)
├─ Runs in background every 60 seconds
├─ Automatically refreshes cache
├─ Prevents cache misses during normal operation
└─ Result: ~95% cache hit rate in production
```

## Data Volume Visualization

```
Cache Size Growth Over Time

│                                                    ┌─────── Total (all sources)
│                                              ┌────┤
│ 10 MB  ├────────────────────────────────────┤
│        │  Leagues (24h TTL)                  │
│        │  ├──────────────────────────────────│
│        │  │ Standings (10min TTL)            │
│        │  │ ├──────────────────────────────  │
│ 5 MB   ├─ │─│ Fixtures (5min TTL)           │
│        │ │ │ ├───────────────────────────── │
│        │ │ │ │ Live Matches (2min TTL)      │
│        │ │ │ │ ├───────────────────────── │
│ 1 MB   ├─┼─┼─┼─┤                           │
│        │ │ │ │ │                           │
│ 500KB  ├─┼─┼─┼─┼───────────────────────── │
│        │ │ │ │ │                           │
│        │ │ │ │ │                           │
└───────┴─┴─┴─┴─┴───────────────────────────→
        0  1  2  3  4  5  ... 24 hours
        ↑  ↑  ↑  ↑
        │  │  │  └─ All stable (leagues don't change)
        │  │  └──── Standings refreshed (new rankings)
        │  └─────── Fixtures refreshed (matches played)
        └────────── Live matches refreshed (new games)

Typical production numbers:
├─ Live Matches: 2-10 KB (0-30 matches)
├─ Fixtures: 50-200 KB (200-2000 fixtures, 6 leagues)
├─ Standings: 30-100 KB (50-300 teams, 6 leagues)
├─ Leagues: 100-500 KB (100-500 leagues total)
└─ TOTAL: 1-5 MB (normal operation with 6 major leagues)
```

## API Endpoint Routing

```
Express App
    │
    ├─ GET /api/data/summary
    │   └──→ DataExposureHandler.handleSummary()
    │       └──→ RawDataCache.getDataSummary()
    │
    ├─ GET /api/data/live
    │   └──→ DataExposureHandler.handleLiveMatches()
    │       └──→ RawDataCache.getLiveMatches(source)
    │
    ├─ GET /api/data/fixtures
    │   └──→ DataExposureHandler.handleFixtures()
    │       └──→ RawDataCache.getFixtures(source, leagueId)
    │
    ├─ GET /api/data/match/:matchId
    │   └──→ DataExposureHandler.handleMatchDetail()
    │       └──→ RawDataCache.getFullMatchData(matchId)
    │
    ├─ GET /api/data/standings/:leagueId
    │   └──→ DataExposureHandler.handleStandings()
    │       └──→ RawDataCache.getStandings(leagueId, source)
    │
    ├─ GET /api/data/leagues
    │   └──→ DataExposureHandler.handleLeagues()
    │       └──→ RawDataCache.getLeagues(source)
    │
    ├─ GET /api/data/cache-info
    │   └──→ DataExposureHandler.handleCacheInfo()
    │       └──→ RawDataCache.exportAll()
    │
    ├─ POST /api/data/cache-cleanup
    │   └──→ DataExposureHandler.handleCacheCleanup()
    │       └──→ RawDataCache.cleanup()
    │
    ├─ GET /api/data/export
    │   └──→ DataExposureHandler.handleExport()
    │       └──→ RawDataCache.* (all methods)
    │
    └─ GET /api/data/schema
        └──→ DataExposureHandler.handleSchema()
            └──→ Returns static schema document
```

## Data Quality Pipeline

```
Raw API Response
    │
    ├─ Validate JSON structure ──→ [PASS/FAIL]
    ├─ Check required fields ─────→ [PASS/FAIL]
    ├─ Verify data types ────────→ [PASS/FAIL]
    │
    ▼
Store in RawDataCache
    │
    ├─ Set Redis key: raw:live:sportsmonks
    ├─ Store complete response
    ├─ Attach metadata: timestamp, TTL, source
    │
    ▼
Return to Client (API/Telegram)
    │
    ├─ Format for display
    ├─ Add calculated fields (if needed)
    ├─ Serialize to JSON/Text
    │
    ▼
Client Receives Data
    │
    ├─ Validate response format
    ├─ Use data for display/analysis
    │
    └─ [END]
```

## Error Recovery Flow

```
API Call to SportMonks
    │
    ├─ [SUCCESS] ──→ Format & Cache & Return
    │
    └─ [FAILURE]
        │
        ├─ Check cache for stale data?
        │   ├─ [YES] Return cached (even if expired)
        │   └─ [NO] Continue
        │
        ├─ Try Football-Data API (fallback)
        │   ├─ [SUCCESS] Format & Cache & Return
        │   │
        │   └─ [FAILURE]
        │       │
        │       ├─ Log error with details
        │       ├─ Return empty array []
        │       ├─ Record health status
        │       └─ Suggest next retry (prefetch cycle)
        │
        └─ End request gracefully
```

## Performance Optimization Layers

```
Client Request
    │
    ▼ Layer 1: Express Rate Limiting
    │
    ▼ Layer 2: Route Handler
    │
    ▼ Layer 3: Memory Cache Check (SportsAggregator)
    │   └─ If HIT: Return immediately (<1ms)
    │
    ▼ Layer 4: RawDataCache Check (Redis/Memory)
    │   └─ If HIT: Return immediately (<10ms)
    │
    ▼ Layer 5: Fetch Fresh Data
    │   ├─ SportMonks API call (300-800ms)
    │   └─ Fallback to Football-Data if needed
    │
    ▼ Layer 6: Format & Store
    │   ├─ Normalize response structure
    │   ├─ Store to both caches
    │   └─ Add metadata
    │
    ▼ Layer 7: Return Response
    │   └─ Send JSON to client
    │
    └─ Client Receives Data

Typical Response Times:
├─ L1-L4 (Cache Hit): <10ms ───────────────┐
├─ L5 (API Call): 300-800ms                 ├─ 30-100x faster with cache
├─ L1-L7 (Cache Miss): 310-810ms ────────┐ │
└─                                         └─┘
```

---

**BETRIX Data Exposure System - Visual Architecture**  
*All diagrams illustrate production architecture and data flow*  
*Last Updated: 2024-12-19*
