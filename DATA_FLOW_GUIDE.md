# Complete Data Flow and Access Guide

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      External APIs                              │
│  ┌──────────────────┐              ┌──────────────────────────┐│
│  │  SportMonks API  │              │  Football-Data API       ││
│  │  (Primary)       │              │  (Secondary)             ││
│  └────────┬─────────┘              └──────────┬───────────────┘│
└───────────┼──────────────────────────────────┼────────────────┘
            │                                  │
            ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              SportsAggregator Service                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  getAllLiveMatches()                                       │ │
│  │  getUpcomingMatches(leagueId)                              │ │
│  │  getFixtures()                                             │ │
│  │  getLeagues()                                              │ │
│  └────────────────┬──────────────────────────────┬────────────┘ │
│                   │                              │               │
│                   ▼                              ▼               │
│         ┌────────────────────┐      ┌────────────────────┐      │
│         │  Local Memory Cache │      │  RawDataCache      │      │
│         │  (5 min TTL)        │      │  (2-24hr TTL)      │      │
│         └────────────────────┘      └──────────┬─────────┘      │
└───────────────────────────────────────────────┼──────────────────┘
                                                │
                ┌───────────────────────────────┤
                │                               │
                ▼                               ▼
    ┌──────────────────────┐        ┌──────────────────────────────┐
    │ Telegram Bot         │        │ Data Exposure API            │
    │ Commands Handler     │        │ /api/data/* Endpoints        │
    │                      │        │                              │
    │ /live                │        │ GET /api/data/summary        │
    │ /fixtures            │        │ GET /api/data/live           │
    │ /standings           │        │ GET /api/data/fixtures       │
    │ /summary             │        │ GET /api/data/match/:id      │
    └──────────────────────┘        │ GET /api/data/standings      │
                                    │ GET /api/data/leagues        │
                                    │ GET /api/data/cache-info     │
                                    │ POST /api/data/cache-cleanup │
                                    │ GET /api/data/export         │
                                    │ GET /api/data/schema         │
                                    └──────────────────────────────┘
```

## Data Flow: Real-World Example

### Scenario: User requests Premier League live matches

```
1. USER REQUEST
   └─→ Telegram /live command
       or API GET /api/data/live?source=sportsmonks

2. REQUEST PROCESSING
   ├─→ Handler checks local cache (5-min)
   │   ├─ If HIT: Return cached data immediately
   │   └─ If MISS: Continue to step 3
   │
   ├─→ SportsAggregator.getAllLiveMatches()
   │   ├─→ Check memory cache
   │   ├─→ If miss, call SportMonks API
   │   └─→ Format raw response
   │
   └─→ RawDataCache.storeLiveMatches('sportsmonks', rawMatches)
       └─→ Store full API response with 2-min TTL

3. DATA RETURN
   ├─→ Telegram: Formatted message with emoji status
   │   Example:
   │   "🔴 LIVE - Manchester United vs Liverpool
   │    45' (2-1)
   │    Old Trafford, Premier League"
   │
   └─→ API: JSON with all match details
       Example:
       {
         "source": "sportsmonks",
         "count": 1,
         "matches": [{
           "id": "12345",
           "homeTeam": "Manchester United",
           "awayTeam": "Liverpool",
           "status": "LIVE",
           "minute": 45,
           "score": {"home": 2, "away": 1},
           ...
         }]
       }

4. CACHE BEHAVIOR
   ├─→ Data Exposure API caches raw SportMonks response
   ├─→ TTL: 2 minutes (live data)
   ├─→ Storage: Memory + Redis (if available)
   └─→ Auto-refresh via prefetch scheduler (every 60s)
```

## Prefetch Scheduler Integration

```
Every 60 seconds (configurable):

┌─ Prefetch Scheduler Tick
│
├─→ SportsAggregator.getAllLiveMatches()
│   └─→ Automatically calls RawDataCache.storeLiveMatches()
│
├─→ SportsAggregator.getUpcomingMatches(leagueId)
│   └─→ For each major league: [39, 140, 135, 61, 78, 2]
│       └─→ Automatically calls RawDataCache.storeFixtures()
│
└─→ Publish "prefetch:updates" event to Redis
    └─→ Handler subscribes and logs completion
        Example log:
        "Prefetch cycle: 0 live, 120 upcoming from 6 competitions"
```

## Storage Strategy

### Memory Cache (SportsAggregator)
```
Purpose: Speed (in-process, sub-ms access)
TTL: 5 minutes for live, 5+ minutes for upcoming
Location: JavaScript Map
Eviction: Time-based + LRU
Example keys:
  - live:all
  - upcoming:39
  - upcoming:140
```

### Raw Data Cache
```
Purpose: Preserve complete API responses
TTL: 2 min (live) to 24 hours (leagues)
Location: Redis (primary) + Memory fallback
Retrieval: Full API response structure preserved
Example keys:
  - raw:live:sportsmonks
  - raw:live:footballdata
  - raw:fixtures:sportsmonks:39
  - raw:fixtures:footballdata:140
  - raw:standings:39:sportsmonks
  - raw:leagues:sportsmonks
```

### Database Cache (optional)
```
Purpose: Long-term data retention
TTL: 24+ hours
Location: PostgreSQL/Redis sorted sets
Use case: Historical analysis, reporting
```

## Data Access Patterns

### Pattern 1: Direct API Access
```
Client Request
    ↓
/api/data/live?source=sportsmonks
    ↓
DataExposureHandler.handleLiveMatches()
    ↓
RawDataCache.getLiveMatches('sportsmonks')
    ↓
Return JSON response
```

### Pattern 2: Telegram Bot Command
```
Telegram /live
    ↓
LiveFeedHandler.handleLiveCommand()
    ↓
SportsAggregator.getAllLiveMatches()
    ↓
(stores to RawDataCache automatically)
    ↓
MatchFormatter.formatLiveMatches()
    ↓
Send formatted Telegram message
```

### Pattern 3: Scheduled Prefetch
```
Prefetch Scheduler (60s tick)
    ↓
SportsAggregator.getAllLiveMatches()
    ↓
RawDataCache.storeLiveMatches() [automatic]
    ↓
Redis pub/sub: "prefetch:updates"
    ↓
Log completion stats
```

## Example: Complete Request/Response Cycle

### Request 1: Get Premier League Fixtures
```
GET /api/data/fixtures?source=sportsmonks&league=39

Response:
{
  "source": "sportsmonks",
  "league": "39",
  "count": 20,
  "fixtures": [
    {
      "id": "match_1",
      "homeTeam": "Arsenal",
      "awayTeam": "Chelsea",
      "status": "SCHEDULED",
      "date": "2024-12-26T12:30:00Z",
      "league": "Premier League",
      "venue": "Emirates Stadium"
    },
    // ... 19 more matches
  ]
}

Behind the scenes:
1. DataExposureHandler.handleFixtures()
2. RawDataCache.getFixtures('sportsmonks', '39')
3. Check Redis: raw:fixtures:sportsmonks:39
4. If found and not expired: Return immediately
5. If not found or expired: SportsAggregator fetches fresh data
6. RawDataCache.storeFixtures() saves with 5-min TTL
7. Response sent to client
```

### Request 2: Get Match Details
```
GET /api/data/match/match_1

Response:
{
  "id": "match_1",
  "sportsmonks": {
    "id": "match_1",
    "name": "Arsenal vs Chelsea",
    "kickoff_time": "2024-12-26T12:30:00Z",
    "status": "NS",
    "league_id": 39,
    "league_name": "Premier League",
    "home": {
      "id": 1,
      "name": "Arsenal",
      "logo": "https://..."
    },
    "away": {
      "id": 2,
      "name": "Chelsea",
      "logo": "https://..."
    },
    // ... full match details from SportMonks
  },
  "retrieved": "2024-12-19T15:30:00Z"
}

Behind the scenes:
1. Check raw:match:match_1:sportsmonks in cache
2. If found and valid: Return immediately
3. If not found: Query stored fixtures for details
4. Response compiled from RawDataCache
```

### Request 3: Export All Data
```
GET /api/data/export

Response Headers:
Content-Type: application/json
Content-Disposition: attachment; filename="sports-data-1702992600000.json"

Response Body:
{
  "exportedAt": "2024-12-19T15:30:00Z",
  "summary": {
    // ... data summary
  },
  "data": {
    "sportsmonks": {
      "live": [ /* all live matches */ ],
      "leagues": [ /* all leagues */ ]
    },
    "footballdata": {
      "live": [ /* all live */ ]
    }
  }
}

Behind the scenes:
1. RawDataCache.exportAll()
2. Aggregate all non-expired cache entries
3. Compile JSON with metadata
4. Set download headers
5. Send as attachment
```

## Data Consistency

### Guarantee 1: Single Source of Truth
- SportMonks = Primary source (preferred)
- Football-Data = Secondary source (fallback)
- No conflicting versions in cache

### Guarantee 2: Time-Based Freshness
```
Live Matches:    2 min   (updated every prefetch cycle: 60s)
Fixtures:        5 min   (updated every prefetch cycle: 60s)
Standings:      10 min   (updated periodically)
Leagues:        24 hours (rarely changes)
```

### Guarantee 3: Automatic Refresh
```
Prefetch Scheduler
├─→ Runs every 60 seconds
├─→ Fetches all live matches
├─→ Fetches all upcoming fixtures
└─→ Automatically stores to RawDataCache
```

## Performance Characteristics

```
First Request (Cache Miss):
  SportsMonks API call:  300-800ms
  Formatting:           10-50ms
  RawDataCache store:   5-20ms
  Total:                315-870ms

Subsequent Requests (Cache Hit):
  Memory cache lookup:   <1ms
  Format/return:         5-10ms
  Total:                 <11ms

Speedup: 30-100x faster with cache
```

## Monitoring and Debugging

### Check What's Cached
```
GET /api/data/cache-info

Returns:
{
  "totalSize": 524288,
  "totalEntries": 45,
  "estimatedSizeKb": "512.00",
  "entries": [
    {
      "key": "raw:live:sportsmonks",
      "size": 8192,
      "expiresIn": 95,
      "dataType": "Array[5]"
    },
    // ... all cache entries
  ]
}
```

### Clean Up Expired Cache
```
POST /api/data/cache-cleanup

Removes all expired entries and returns count.
Normally happens automatically, but manual cleanup useful for:
- Testing
- Freeing memory
- Troubleshooting
```

### View API Documentation
```
GET /api/data/schema

Returns complete API schema with:
- All endpoints
- Parameter descriptions
- Response examples
- League ID mappings
```

## Common Operations

### Get Live Scores
```bash
# Telegram
/live

# HTTP API
curl https://betrix.example.com/api/data/live
```

### Get Upcoming Matches for Specific League
```bash
# HTTP API
curl "https://betrix.example.com/api/data/fixtures?source=sportsmonks&league=39"
```

### Get Standings
```bash
# Telegram
/standings 39

# HTTP API
curl "https://betrix.example.com/api/data/standings/39"
```

### Export All Data
```bash
curl https://betrix.example.com/api/data/export > sports-data.json
```

## Architecture Benefits

✅ **Separation of Concerns**
  - Raw data caching (RawDataCache)
  - Business logic (SportsAggregator)
  - HTTP endpoints (DataExposureHandler)

✅ **Flexibility**
  - Same cached data accessible via Telegram or HTTP
  - Easy to add new endpoints
  - Easy to change data sources

✅ **Performance**
  - Multi-level caching
  - Automatic prefetch
  - Sub-millisecond response times

✅ **Observability**
  - Complete cache visibility
  - Detailed logging
  - Export for analysis

✅ **Reliability**
  - Fallback to Football-Data if SportMonks unavailable
  - Automatic cache cleanup
  - Graceful error handling

---

**BETRIX Data Flow Architecture**  
*Last Updated: 2024-12-19*
