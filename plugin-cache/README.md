# @fastify/response-cache

A Fastify plugin that provides HTTP response caching with in-memory LRU storage.

## Features

- ✅ In-memory LRU cache with configurable size and TTL
- ✅ Route-level opt-in caching via route configuration
- ✅ Automatic ETag generation and 304 Not Modified support
- ✅ Cache-Control header parsing (respects no-store, max-age, etc.)
- ✅ Vary header support for content negotiation
- ✅ Manual cache invalidation API (purge, purgeByPrefix, clear)
- ✅ Cache hit/miss statistics tracking
- ✅ Zero runtime dependencies

## Installation

This plugin is part of the Fastify core repository and uses built-in Node.js modules only.

```bash
npm install fastify-plugin
```

## Usage

### Basic Setup

```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

// Register with default options
await fastify.register(cachePlugin)

// Register with custom options
await fastify.register(cachePlugin, {
  maxItems: 1000,        // Max cached responses (default: 1000)
  ttl: 60000,            // Default TTL in milliseconds (default: 60000 / 1 minute)
  methods: ['GET'],      // HTTP methods to cache (default: ['GET'])
  vary: []               // Global Vary headers to include in cache key (default: [])
})
```

### Route Configuration

```javascript
// Enable caching with default TTL
fastify.get('/users', {
  config: { cache: true }
}, async (request, reply) => {
  return await db.getUsers()
})

// Enable caching with custom TTL
fastify.get('/posts', {
  config: {
    cache: {
      ttl: 30000,           // Override default TTL (30 seconds)
      vary: ['Accept']      // Include Accept header in cache key
    }
  }
}, async (request, reply) => {
  return await db.getPosts()
})
```

### Cache Invalidation

```javascript
// Purge specific cache entry
const removed = fastify.cache.purge('GET|/users|')
console.log('Entry removed:', removed) // true or false

// Purge all entries matching URL prefix
fastify.cache.purgeByPrefix('/users')

// Clear entire cache
fastify.cache.clear()

// Get cache statistics
const stats = fastify.cache.stats()
console.log(stats)
// { items: 42, maxItems: 1000, hits: 150, misses: 30 }
```

## How It Works

### Cache Key Derivation

Cache keys are derived from:
- HTTP method (e.g., GET, POST)
- Full URL including query string
- Vary header values (if configured)

Format: `METHOD|URL|vary_headers`

Examples:
- `GET|/users|` (no Vary headers)
- `GET|/users?page=2|accept:application/json` (with Accept header)

### Cache Hit/Miss Flow

**On Request (onRequest hook):**
1. Check if route has caching enabled
2. Derive cache key from request
3. Look up key in LRU cache
4. If hit:
   - Check for If-None-Match (ETag conditional request)
   - Return 304 Not Modified or cached response
   - Skip route handler execution
5. If miss:
   - Set X-Cache: MISS header
   - Continue to route handler

**On Response (onSend hook):**
1. Check if response should be cached
2. Only cache:
   - Configured HTTP methods (default: GET)
   - 2xx status codes
   - Responses without Cache-Control: no-store/private
3. Generate ETag from response body
4. Store entry with TTL
5. Set ETag and X-Cache: MISS headers

### Cache Control

The plugin respects HTTP caching semantics:

**Response headers:**
- `Cache-Control: no-store` → Not cached
- `Cache-Control: private` → Not cached (server-side cache)
- `Cache-Control: max-age=N` → Overrides route TTL
- `Cache-Control: s-maxage=N` → Takes priority over max-age

**Request headers:**
- `Cache-Control: no-cache` → Bypass cache, run handler
- `If-None-Match: <etag>` → Return 304 if ETag matches

### Response Headers

The plugin adds these headers:
- `X-Cache: HIT` or `X-Cache: MISS` - Indicates cache status
- `ETag: W/"<hash>"` - Weak ETag for conditional requests

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxItems` | Number | 1000 | Maximum number of cached responses |
| `ttl` | Number | 60000 | Default TTL in milliseconds (1 minute) |
| `methods` | Array | `['GET']` | HTTP methods to cache |
| `vary` | Array | `[]` | Global Vary headers for cache key |

### Route Config Options

| Option | Type | Description |
|--------|------|-------------|
| `cache` | Boolean\|Object | Enable caching (true) or config object |
| `cache.ttl` | Number | Override default TTL for this route |
| `cache.vary` | Array | Additional Vary headers for this route |

## API

### `fastify.cache.purge(key)`

Remove a specific cache entry by key.

**Parameters:**
- `key` (String) - Cache key to remove

**Returns:** `Boolean` - true if entry existed, false otherwise

### `fastify.cache.purgeByPrefix(prefix)`

Remove all cache entries whose URL starts with the given prefix.

**Parameters:**
- `prefix` (String) - URL prefix to match

**Returns:** `Number` - Number of entries removed

### `fastify.cache.clear()`

Remove all cache entries and reset statistics.

**Returns:** `undefined`

### `fastify.cache.stats()`

Get current cache statistics.

**Returns:** Object with:
- `items` (Number) - Current number of cached items
- `maxItems` (Number) - Maximum cache size
- `hits` (Number) - Total cache hits
- `misses` (Number) - Total cache misses

## Performance Considerations

### LRU Eviction

When the cache reaches `maxItems`, the least recently used entry is evicted automatically. Accessing an entry (cache hit) updates its recency.

### TTL Expiry

Entries expire based on their TTL. Expiry is checked lazily on access (not via timers), which avoids background work and provides better performance.

### Memory Usage

Each cached entry stores:
- Response body (string or object)
- Status code
- Headers (Content-Type minimum)
- ETag (16-character hash)
- Expiry timestamp

For optimal memory usage, configure appropriate `maxItems` and `ttl` values based on your application's needs.

## Plugin Registration Order

⚠️ **Important:** Register this plugin AFTER authentication plugins if you want cache hits to still require authentication. The plugin's `onRequest` hook runs in registration order.

```javascript
// Correct order
await fastify.register(authPlugin)
await fastify.register(cachePlugin)

// Incorrect - cache hits would bypass auth
await fastify.register(cachePlugin)
await fastify.register(authPlugin)
```

## Testing

Run the test suite:

```bash
npm run unit -- plugin-cache/test/**/*.test.js
```

Run with coverage:

```bash
npm run coverage -- plugin-cache/test/**/*.test.js
```

## Implementation Details

- **LRU Cache:** Map-based implementation with O(1) lookups
- **ETag Generation:** SHA-256 hash (truncated to 16 chars) using node:crypto
- **Hook Pattern:** Uses Fastify's `onRequest` and `onSend` lifecycle hooks
- **Plugin Wrapper:** Uses `fastify-plugin` to expose decorator to parent scope

## License

MIT
