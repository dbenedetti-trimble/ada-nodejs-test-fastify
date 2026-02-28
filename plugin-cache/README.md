# fastify-response-cache

In-memory HTTP response caching plugin for Fastify 5.x. Provides LRU-based storage with TTL expiry, ETag generation, conditional request handling (304 Not Modified), and Cache-Control directive parsing.

## Installation

The plugin lives in the `plugin-cache/` directory of this repository. Require it directly:

```javascript
const cachePlugin = require('./plugin-cache')
```

## Usage

### Registration

```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,    // Max cached responses (default: 1000)
  ttl: 60000,        // Default TTL in milliseconds (default: 60000 / 1 minute)
  methods: ['GET'],  // HTTP methods to cache (default: ['GET'])
  vary: [],          // Global Vary headers included in cache key (default: [])
})
```

All options are optional; the plugin works with zero configuration.

### Route opt-in

Caching is **opt-in per route** via the route `config` object:

```javascript
// Use all global defaults
fastify.get('/status', { config: { cache: true } }, async () => {
  return { status: 'ok' }
})

// Override TTL and add Vary headers for this route
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,           // 30 seconds for this route
      vary: ['Accept'],     // Vary by Accept header
    }
  }
}, async (request) => {
  return await db.getUsers()
})
```

Routes without `config.cache` are completely unaffected.

### Cache decorator

The plugin exposes `fastify.cache` for manual cache control:

```javascript
// Purge a specific entry by its cache key
fastify.cache.purge('GET|/users|')           // → true if existed

// Purge all entries whose URL starts with a prefix
fastify.cache.purgeByPrefix('/users')        // → count of removed entries

// Clear entire cache and reset statistics
fastify.cache.clear()

// Get current statistics
const stats = fastify.cache.stats()
// { items: 42, maxItems: 1000, hits: 150, misses: 30 }
```

## Response headers

| Header    | Value  | When                          |
|-----------|--------|-------------------------------|
| `X-Cache` | `HIT`  | Response served from cache    |
| `X-Cache` | `MISS` | Handler executed              |
| `ETag`    | `W/"<16-hex>"` | Set on every cached response |

## Cache key format

```
"METHOD|url-with-querystring|vary-header-values"
```

Example with `vary: ['Accept']`:
- `GET|/users?page=1|accept:application/json`
- `GET|/users?page=1|accept:text/html` (separate entry)

## Cache-Control support

**Response directives:**
- `no-store` — do not cache
- `private` — do not cache
- `no-cache` — cache but always revalidate (stored for ETag conditional requests)
- `max-age=N` — override TTL with N seconds
- `s-maxage=N` — override TTL with N seconds (takes priority over `max-age`)

**Request directives:**
- `no-cache` — bypass cache, run handler, store fresh response
- `no-store` — bypass cache, run handler, do not store response

## ETag / Conditional requests

On the first request, the plugin generates a weak ETag (`W/"<sha256-16-hex>"`) from the response body and stores it. On subsequent requests with `If-None-Match` matching the stored ETag, the plugin responds with `304 Not Modified` and no body (skipping the handler).

## Notes

- Register this plugin **after** authentication plugins. Cache hits skip all subsequent hooks including auth.
- Only buffered responses are cached (streams are passed through unchanged).
- Eviction is lazy: expired entries are detected on access, not via background timers.

## Running tests

```bash
node --test plugin-cache/test/*.test.js
```
