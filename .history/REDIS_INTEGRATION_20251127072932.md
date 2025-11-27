# Redis Integration Guide for BETRIX Bot

## 🎯 Overview

All Redis connections in the BETRIX bot use a unified, centralized configuration through the `redis-factory.js` module. This ensures seamless integration with Azure Redis Cache and provides automatic failover, error handling, and connection pooling.

**Redis URL:** `redis://default:k5hVSqo106q0tTX9wbulgJPK4SiRc9UR@redis-14261.c282.east-us-mz.azure.cloud.redislabs.com:14261`

---

## 📋 Environment Configuration

### .env File Setup

```env
# Redis connection string (CRITICAL)
REDIS_URL=redis://default:k5hVSqo106q0tTX9wbulgJPK4SiRc9UR@redis-14261.c282.east-us-mz.azure.cloud.redislabs.com:14261

# Optional: Use mock Redis for testing
USE_MOCK_REDIS=0
```

**URL Components:**
- **Protocol:** `redis://` (or `rediss://` for TLS)
- **Auth:** `default:k5hVSqo106q0tTX9wbulgJPK4SiRc9UR` (username:password)
- **Host:** `redis-14261.c282.east-us-mz.azure.cloud.redislabs.com`
- **Port:** `14261`
- **Database:** Default (0)

---

## 🏗️ Architecture

### Connection Factory Pattern

```javascript
// File: src/lib/redis-factory.js
import { getRedis } from './lib/redis-factory.js';

// Anywhere in your code:
const redis = getRedis(); // Singleton - same instance every time
```

**Features:**
- ✅ Singleton pattern - ensures single connection per process
- ✅ Automatic connection pooling
- ✅ Intelligent retry strategy with exponential backoff
- ✅ Mock Redis support for testing
- ✅ Comprehensive error logging
- ✅ Event-based connection monitoring

### Integration Points

#### 1. **Application Server** (`src/app.js`)
```javascript
const redis = getRedis();
const rssAggregator = new RSSAggregator(redis);
const scrapers = new Scrapers(redis);
```
- Handles caching, session management, logging
- Pub/Sub for real-time updates

#### 2. **Worker Process** (`src/worker.js`)
```javascript
const redis = getRedis({ /* custom retry options */ });
```
- Processes async jobs
- Maintains heartbeat and metrics
- Tracks command usage and predictions

#### 3. **Telegram Handlers** (`src/handlers/telegram-handler-v2.js`)
```javascript
// Passed as parameter
async function handleMessage(update, redis, services) {
  const userData = await redis.hgetall(`user:${userId}`);
  await redis.set(`cache:key`, JSON.stringify(data), 'EX', 3600);
}
```
- User data storage and retrieval
- Payment state management
- Bet slip tracking
- Session caching

#### 4. **Payment Router** (`src/handlers/payment-router.js`)
```javascript
async function createPaymentOrder(redis, userId, tier, provider, region, data) {
  const orderId = generateOrderId();
  await redis.setex(`payment:${orderId}`, 3600, JSON.stringify(paymentData));
}
```
- Order creation and tracking
- Payment status updates
- Subscription management

---

## 🔄 Data Structures & Operations

### User Data (Hashes)
```javascript
// Store user profile
await redis.hset(`user:${userId}`, 
  'tier', 'PLUS',
  'username', 'john_doe',
  'phone', '+254712345678',
  'email', 'john@example.com',
  'referralCode', 'REF123',
  'subscriptionExpiry', '2024-12-31T23:59:59Z'
);

// Retrieve all user data
const userData = await redis.hgetall(`user:${userId}`);
```

### Payment Orders (Strings with TTL)
```javascript
// Store payment order for 1 hour
const orderId = `order_${Date.now()}`;
await redis.setex(`payment:${orderId}`, 3600, JSON.stringify({
  userId: 123,
  tier: 'SIGNUP',
  amount: 150,
  currency: 'KES',
  provider: 'SAFARICOM_TILL',
  status: 'pending',
  createdAt: new Date().toISOString()
}));
```

### Bet Slips (Strings with TTL)
```javascript
// Store active bet slip for 1 hour
await redis.setex(`betslip:${betslipId}`, 3600, JSON.stringify({
  userId: 123,
  matches: [
    { id: 1, home: 'Arsenal', away: 'Chelsea', odds: 1.85 },
    { id: 2, home: 'Man City', away: 'Liverpool', odds: 2.10 }
  ],
  totalOdds: 3.885,
  stake: 100,
  createdAt: new Date().toISOString()
}));
```

### User Favorites (Sets)
```javascript
// Add/remove favorite teams
await redis.sadd(`user:${userId}:favorites`, 'Arsenal', 'Chelsea', 'Man City');
await redis.srem(`user:${userId}:favorites`, 'Tottenham');

// Get all favorites
const favorites = await redis.smembers(`user:${userId}:favorites`);
```

### Command Usage Tracking (Counters)
```javascript
// Track command usage per month
const usageKey = `cmd:usage:${userId}:/live:${monthYear}`;
await redis.incr(usageKey);
await redis.expire(usageKey, 2592000); // 30 days
```

### Leaderboards (Sorted Sets)
```javascript
// Track prediction accuracy
await redis.zadd(`predictions:accuracy`, 95.5, 'user:123:arsenal-chelsea');

// Get top predictions
const top = await redis.zrevrange(`predictions:accuracy`, 0, 9, 'WITHSCORES');
```

### Job Queues (Lists)
```javascript
// Push job to queue
await redis.rpush(`telegram-jobs`, JSON.stringify(jobData));

// Pop job from queue
const job = await redis.lpop(`telegram-jobs`);
```

---

## ⚡ Key Operations Reference

### Strings
```javascript
await redis.set(key, value);                  // Set value
await redis.get(key);                         // Get value
await redis.setex(key, seconds, value);       // Set with TTL
await redis.del(key);                         // Delete key
await redis.incr(key);                        // Increment number
```

### Hashes (User Data)
```javascript
await redis.hset(key, field, value);          // Set hash field
await redis.hget(key, field);                 // Get hash field
await redis.hgetall(key);                     // Get all fields
await redis.hincrby(key, field, count);       // Increment hash field
await redis.hdel(key, field);                 // Delete hash field
```

### Sets (Favorites, Favorites)
```javascript
await redis.sadd(key, member);                // Add to set
await redis.smembers(key);                    // Get all members
await redis.srem(key, member);                // Remove from set
await redis.sismember(key, member);           // Check membership
```

### Sorted Sets (Rankings, Leaderboards)
```javascript
await redis.zadd(key, score, member);         // Add scored member
await redis.zrange(key, 0, -1);               // Get members (ascending)
await redis.zrevrange(key, 0, -1);            // Get members (descending)
await redis.zrange(key, 0, -1, 'WITHSCORES'); // Get with scores
```

### Lists (Job Queues)
```javascript
await redis.lpush(key, value);                // Push to head
await redis.rpush(key, value);                // Push to tail
await redis.lpop(key);                        // Pop from head
await redis.rpop(key);                        // Pop from tail
await redis.lrange(key, 0, -1);               // Get range
```

---

## 🛡️ Error Handling

### Safe User Data Retrieval
```javascript
// Helper function that handles WRONGTYPE errors gracefully
async function safeGetUserData(redis, key) {
  try {
    const data = await redis.hgetall(key);
    return (data && Object.keys(data).length > 0) ? data : null;
  } catch (e) {
    if (e.message && e.message.includes('WRONGTYPE')) {
      // Key exists but is wrong type - delete and start fresh
      try {
        await redis.del(key);
      } catch (delErr) {
        logger.warn(`Failed to delete malformed key ${key}:`, delErr.message);
      }
      return null;
    }
    throw e;
  }
}

// Usage
const userData = await safeGetUserData(redis, `user:${userId}`);
```

### Connection Error Handling
```javascript
redis.on('error', (err) => {
  if (err.message.includes('NOAUTH')) {
    console.error('Invalid Redis password');
  } else if (err.message.includes('ECONNREFUSED')) {
    console.error('Cannot connect to Redis host');
  } else if (err.message.includes('ETIMEDOUT')) {
    console.error('Redis connection timeout');
  }
});

redis.on('reconnecting', () => {
  console.log('Attempting to reconnect to Redis...');
});
```

---

## 🧪 Testing & Validation

### Run Connection Validation
```bash
node scripts/validate-redis-connection.js
```

**Tests:**
- ✅ Environment configuration
- ✅ Direct ioredis connection
- ✅ All basic operations (SET, GET, DEL, HSET, LPUSH, etc.)
- ✅ Handler-specific operations
- ✅ Factory pattern singleton
- ✅ Cleanup of test data

### Expected Output
```
✅ REDIS_URL environment variable...... Configured: redis://default:k5h...
✅ REDIS_URL format validation......... Protocol: redis://, Host: redis-14261.c282.east-us-mz.azure.cloud.redislabs.com:14261
✅ Redis TCP connection................. Connected to Redis host
✅ Redis protocol handshake............ Redis ready for commands
✅ PING command........................ Response: PONG
✅ SET command (with TTL).............. Value set with 10s expiry
✅ GET command......................... Retrieved value: hello
...
✅ Cleanup of handler test data........ All test data removed

📊 TEST SUMMARY
✅ PASSED: 32
❌ FAILED: 0
📈 TOTAL:  32
📊 PASS RATE: 100.0%

🎉 ALL TESTS PASSED! Redis connection is working seamlessly.
```

---

## 🔍 Monitoring & Debugging

### Check Redis Connection Status
```javascript
const status = await redis.ping();
console.log(status); // 'PONG' if healthy
```

### View Redis Keys (Development Only)
```bash
# Connect to Redis CLI
redis-cli -u 'redis://default:k5hVSqo106q0tTX9wbulgJPK4SiRc9UR@redis-14261.c282.east-us-mz.azure.cloud.redislabs.com:14261'

# List all keys
> KEYS *

# Get info about database
> INFO

# Monitor commands in real-time
> MONITOR
```

### Health Check Endpoint
```javascript
// In express app or worker
app.get('/health/redis', async (req, res) => {
  try {
    const status = await redis.ping();
    const dbsize = await redis.dbsize();
    res.json({
      redis: status === 'PONG' ? 'OK' : 'FAIL',
      keys: dbsize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ redis: 'ERROR', error: error.message });
  }
});
```

---

## 📊 Data Key Naming Convention

Consistent key naming ensures predictable lookups and prevents conflicts:

```
user:{userId}                       # User profile hash
user:{userId}:favorites             # Set of favorite teams
user:{userId}:bets                  # List of placed bets
user:{userId}:last_seen             # Timestamp of last activity

payment:{orderId}                   # Payment order string (TTL: 1 hour)
payment:by_user:{userId}:pending    # Current pending order ID

betslip:{betslipId}                 # Active bet slip (TTL: 1 hour)

cmd:usage:{userId}:{command}        # Command usage counter

profile:{userId}:{field}            # User profile field cache

session:{sessionToken}              # Session data (TTL: varies)

cache:{serviceName}:{key}           # General cache (TTL: varies)
```

---

## 🚀 Deployment Checklist

- [ ] **Environment Setup**
  - [ ] REDIS_URL configured in `.env` or environment variables
  - [ ] Network connectivity verified (port 14261 accessible)
  - [ ] Redis credentials confirmed working

- [ ] **Connection Testing**
  - [ ] Run `node scripts/validate-redis-connection.js`
  - [ ] Verify all 32 tests pass
  - [ ] Check connection logs in worker output

- [ ] **Handler Verification**
  - [ ] User data retrieval works (safeGetUserData)
  - [ ] Payment orders created and retrieved
  - [ ] Bet slips stored and retrieved
  - [ ] No WRONGTYPE errors in logs

- [ ] **Monitoring Setup**
  - [ ] Health check endpoint responding
  - [ ] Redis connection events logged
  - [ ] Error alerts configured

- [ ] **Performance Validation**
  - [ ] Response times < 50ms for reads
  - [ ] Response times < 100ms for writes
  - [ ] No connection pool exhaustion

---

## 🆘 Troubleshooting

### Connection Issues

**Error:** `NOAUTH Invalid password`
- ✅ **Solution:** Verify Redis URL password is correct
- Check: `redis://default:YOUR_PASSWORD@HOST:PORT`

**Error:** `ECONNREFUSED Connection refused`
- ✅ **Solution:** Verify hostname and port are correct
- Check: Port 14261 is accessible from your network

**Error:** `ETIMEDOUT Connection timeout`
- ✅ **Solution:** Check network connectivity and firewall
- Verify: Network allows outbound to Azure Redis

### Data Issues

**Error:** `WRONGTYPE Operation against a key holding the wrong kind of value`
- ✅ **Solution:** Use `safeGetUserData()` helper or delete key
- Example: `await redis.del(`user:${userId}`)` then recreate

**Missing Data After Restart**
- ✅ **Expected:** Redis data is in-memory, not persistent by default
- Check: Enable AOF (Append Only File) in Redis settings for persistence
- Note: Azure Redis doesn't persist by default

### Performance Issues

**Slow Response Times**
- Check: Database size with `DBSIZE`
- Clean: Remove expired keys with `FLUSHDB`
- Monitor: CPU and memory usage in Azure Redis dashboard

**Connection Pool Exhaustion**
- Verify: All connections properly closed with `redis.quit()`
- Check: Middleware properly closes connections

---

## 📚 Additional Resources

- [ioredis Documentation](https://github.com/luin/ioredis)
- [Redis Commands Reference](https://redis.io/commands/)
- [Azure Redis Cache Documentation](https://docs.microsoft.com/en-us/azure/azure-cache-for-redis/)
- [BETRIX Handler Documentation](./src/handlers/README.md)

---

## 🎉 Summary

The BETRIX bot uses a unified Redis integration through `redis-factory.js` that ensures:

✅ **Seamless Connection** - Single factory pattern for all connections
✅ **Error Recovery** - Automatic retry with exponential backoff
✅ **Type Safety** - Safe operations with WRONGTYPE error handling
✅ **Monitoring** - Comprehensive logging and event tracking
✅ **Testing** - Validation script to test all operations
✅ **Scaling** - Connection pooling for high performance

All handlers, workers, and services use `getRedis()` to get a consistent, reliable Redis connection to the Azure Redis instance.
