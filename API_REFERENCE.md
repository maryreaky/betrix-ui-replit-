# BETRIX API Reference

## Overview
RESTful API endpoints for the BETRIX sports betting bot system.

## Base URL
```
https://<your-domain>
```

---

## Endpoints

### Health & System

#### `GET /`
Returns system status and available endpoints.
```json
{
  "brand": { "name": "BETRIX", "version": "3.0.0", "slogan": "..." },
  "status": "operational",
  "uptime": 12345.67,
  "endpoints": { "dashboard": "/dashboard", "monitor": "/monitor.html", ... },
  "menu": [...]
}
```

#### `GET /health`
System health check.
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 12345.67,
    "redis": true,
    "version": "3.0.0"
  },
  "message": "All systems operational"
}
```

#### `GET /metrics`
Uptime and log count metrics.
```json
{
  "success": true,
  "data": {
    "uptime": 12345.67,
    "logs": 156
  },
  "message": "Metrics"
}
```

---

### Monitoring

#### `GET /monitor`
Comprehensive system monitoring endpoint (public, no auth).

Returns:
- Worker process heartbeat and health
- Current active AI provider
- WebSocket connection count
- Redis queue status
- Prefetch source health (failure counts)
- Last update timestamps for each data source
- System uptime and response times

**Response Example:**
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "uptime_seconds": 12345,
    "timestamp": "2025-11-25T12:00:00.000Z",
    "services": {
      "worker": {
        "healthy": true,
        "heartbeat_age_ms": 5000,
        "last_seen": "2025-11-25T12:00:00.000Z"
      },
      "ai": {
        "active_provider": "gemini"
      },
      "websocket": {
        "connected_clients": 3
      }
    },
    "prefetch": {
      "failures": {
        "rss": 0,
        "openligadb": 1,
        "scorebat": 0,
        "footballdata": 0
      },
      "last_updates": {
        "rss": {
          "timestamp": "2025-11-25T11:59:00.000Z",
          "age_seconds": 60
        },
        "openligadb": {
          "timestamp": "2025-11-25T11:59:30.000Z",
          "age_seconds": 30
        }
      }
    },
    "queue": {
      "pending_updates": 2,
      "logs_stored": 1856
    },
    "performance": {
      "response_time_ms": 45
    }
  }
}
```

#### Web Dashboard
Visit `/monitor.html` for a real-time visual dashboard (auto-refreshes every 10 seconds).

---

### Free Data Sources

#### `GET /openligadb/leagues`
List available OpenLigaDB leagues.
```json
{
  "success": true,
  "data": [
    {
      "leagueId": 3,
      "leagueName": "1. Fußball-Bundesliga 2024/2025",
      "leagueShortcut": "bl1",
      "sport": { "sportId": 1, "sportName": "Football" }
    }
  ]
}
```

#### `GET /openligadb/matchdata?league=bl1&season=2025`
Fetch match data for a league and season.
```json
{
  "success": true,
  "data": [
    {
      "matchID": 123,
      "matchDateTime": "2025-01-15T20:30:00",
      "team1": { "teamId": 1, "teamName": "Bayern Munich" },
      "team2": { "teamId": 2, "teamName": "Borussia Dortmund" },
      "matchResults": [{ "resultTypeID": 1, "pointsTeam1": 2, "pointsTeam2": 1 }]
    }
  ]
}
```

#### `GET /live`
Real-time live matches (with free-data fallback).
```json
{
  "success": true,
  "data": {
    "live_matches": [...],
    "source": "openligadb",
    "fallback_used": false
  }
}
```

#### `GET /standings?league=bl1&season=2025`
League standings and match data (combined from multiple sources).
```json
{
  "success": true,
  "data": {
    "combined": [...],
    "sources": { "open": true, "footballData": false }
  },
  "message": "Combined standings/matches (normalized)"
}
```

#### `GET /news`
Latest football news headlines from RSS feeds.
```json
{
  "success": true,
  "data": {
    "feeds": [
      {
        "url": "https://feeds.bbci.co.uk/sport/football/rss.xml",
        "items": [
          {
            "title": "Article Title",
            "link": "https://...",
            "pubDate": "Mon, 25 Nov 2025 12:00:00 GMT",
            "description": "...",
            "media": "https://..."
          }
        ]
      }
    ]
  }
}
```

#### `GET /highlights`
Latest football highlights from ScoreBat.
```json
{
  "success": true,
  "data": {
    "highlights": [...]
  }
}
```

#### `GET /fixtures?competition=E0&season=2324`
Fetch fixtures and odds from football-data.co.uk CSVs.
```json
{
  "success": true,
  "data": {
    "fixtures": [
      {
        "date": "2024-08-16",
        "homeTeam": "Manchester United",
        "awayTeam": "Fulham",
        "homeGoals": 1,
        "awayGoals": 0
      }
    ]
  }
}
```

---

### Admin Endpoints

#### Authentication
All admin endpoints require HTTP Basic Auth:
```
Authorization: Basic base64(username:password)
```

#### `GET /admin/queue` (authenticated)
Queue status and worker heartbeat.
```json
{
  "success": true,
  "data": {
    "telegram_updates": 5,
    "telegram_callbacks": 2,
    "worker_heartbeat": 1700000000000,
    "commit": "abc123..."
  }
}
```

#### `GET /admin/webhook-info` (authenticated)
Current Telegram webhook configuration.

#### `GET /admin/gemini-debug` (authenticated)
Test Gemini API with a sample message.

#### `GET /audit` (authenticated)
Last 20 system audit logs.
```json
{
  "success": true,
  "data": {
    "auditLogs": [
      {
        "ts": "2025-11-25T12:00:00.000Z",
        "level": "INFO",
        "module": "WORKER",
        "message": "Update processed",
        "data": {}
      }
    ]
  }
}
```

---

### Telegram Webhook

#### `POST /webhook/:token?`
Receive Telegram updates. Requires secret header validation:
```
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

**Request Body:**
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "date": 1700000000,
    "chat": { "id": 12345, "type": "private" },
    "from": { "id": 12345, "is_bot": false, "first_name": "User" },
    "text": "/live"
  }
}
```

---

## Pub/Sub Channels

Monitor these Redis channels in real-time:

- **`prefetch:updates`**: Published when a data source successfully prefetches
  ```json
  { "type": "rss", "ts": 1700000000000 }
  ```

- **`prefetch:error`**: Published when a prefetch fails
  ```json
  { "type": "openligadb", "error": "Rate limited", "ts": 1700000000000 }
  ```

---

## WebSocket

Connect to the WebSocket server to receive real-time updates:

### Connection
```javascript
const ws = new WebSocket('ws://localhost:5000/');
```

### Subscribe to Updates
```json
{ "type": "subscribe", "channels": ["prefetch:updates", "prefetch:error"] }
```

### Receive Updates
```json
{ "type": "prefetch:updates", "data": { "type": "rss", "ts": 1700000000000 } }
```

---

## Error Response Format

All errors follow a standard format:
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "timestamp": "2025-11-25T12:00:00.000Z"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Bad request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not found
- `429`: Rate limited
- `500`: Internal server error

---

## Rate Limiting

Rate limits are applied per tier:
- **Free**: 30 requests/minute
- **Member**: 60 requests/minute
- **VVIP**: 150 requests/minute
- **Admin**: 300 requests/minute

Include header to specify user tier:
```
X-User-ID: <user_id>
```

---

## Examples

### Get Live Matches
```bash
curl -X GET http://localhost:5000/live
```

### Monitor System Health
```bash
curl -X GET http://localhost:5000/monitor
```

### View Dashboard
```
Open: http://localhost:5000/monitor.html
```

### Receive Webhook Update
```bash
curl -X POST http://localhost:5000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: your-secret" \
  -d '{"update_id": 123, "message": {"text": "/live", ...}}'
```

---

## See Also
- `INFRASTRUCTURE_GUIDE.md` - Setup and troubleshooting
- `LEGAL.md` - Data reuse and compliance
- `PREFETCH_POLICY.md` - Caching and prefetch policies
