# fastify-response-cache

In-memory LRU response cache plugin for Fastify 5.x.

## Features

- Route-level opt-in caching with per-route TTL configuration
- Automatic ETag generation (SHA-256 content hash) and 304 Not Modified responses
- Cache-Control header parsing (no-store, no-cache, max-age, s-maxage, private)
- Vary header support in cache key derivation
- LRU eviction when max size is reached
- TTL-based expiry (lazy, no timers)
- Cache invalidation API: purge by key, purge by URL prefix, clear all
- Zero runtime dependencies (uses built-in `node:crypto`)

## Installation

```js
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,    // Max cached responses (default: 1000)
  ttl: 60000,        // Default TTL in milliseconds (default: 60000)
  methods: ['GET'],  // HTTP methods to cache (default: ['GET'])
  vary: [],          // Global Vary headers for cache key (default: [])
})
```

## Route opt-in

```js
// Boolean shorthand — uses global defaults
fastify.get('/status', { config: { cache: true } }, async () => ({ status: 'ok' }))

// Object form — per-route overrides
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,         // Override default TTL
      vary: ['Accept'],   // Additional Vary headers
    }
  }
}, async (request, reply) => {
  return await db.getUsers()
})
```

Routes without `config.cache` are completely unaffected.

## Cache decorator API

```js
fastify.cache.purge('GET|/users|')      // Remove specific entry; returns boolean
fastify.cache.purgeByPrefix('/users')   // Remove all entries whose URL starts with prefix; returns count
fastify.cache.clear()                   // Remove all entries and reset stats counters
const stats = fastify.cache.stats()     // { items, maxItems, hits, misses }
```

## Response headers

| Header    | Value | When                          |
|-----------|-------|-------------------------------|
| `X-Cache` | `HIT` | Response served from cache    |
| `X-Cache` | `MISS`| Handler ran, response stored  |
| `ETag`    | `W/"<16-hex>"` | Set on every cached response |

## Hook ordering

This plugin registers `onRequest` (to serve cache hits) and `onSend` (to store responses) on the Fastify instance. Cache hits bypass all subsequent hooks including authentication. **Register this plugin after authentication plugins** so that cached responses are only served to already-authenticated requests.

## Running tests

Plugin tests are outside the root `.borp.yaml` glob and must be run explicitly:

```bash
node --test plugin-cache/test/*.test.js
```

Existing Fastify test suite:

```bash
npm run unit
npm run test:typescript
```
