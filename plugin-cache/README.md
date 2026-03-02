# fastify-response-cache

In-memory HTTP response caching plugin for Fastify 5.x with LRU eviction, TTL expiry, ETag generation, and Cache-Control header support.

## Features

- **Route-level opt-in** — only routes that explicitly enable caching are affected
- **LRU eviction** — bounded in-memory cache with configurable max size
- **TTL expiry** — lazy eviction on access; no background timers
- **ETag / conditional requests** — weak ETags (SHA-256) + 304 Not Modified support
- **Cache-Control parsing** — respects `no-store`, `no-cache`, `private`, `max-age`, `s-maxage` on both requests and responses
- **Vary header support** — per-route and global vary headers included in cache key
- **Manual invalidation API** — purge by key, by URL prefix, or clear all
- **Zero new runtime dependencies** — uses `fastify-plugin` (already a devDependency) and built-in `node:crypto`

## Installation

```bash
npm install fastify-response-cache
```

## Usage

```javascript
const fastify = require('fastify')()
const cachePlugin = require('fastify-response-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,   // max cached responses (default: 1000)
  ttl: 60000,       // default TTL in ms (default: 60000)
  methods: ['GET'], // HTTP methods to cache (default: ['GET'])
  vary: [],         // global Vary headers for cache key (default: [])
})

// Opt-in caching per route
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,         // override TTL for this route
      vary: ['Accept'],   // additional Vary headers
    }
  }
}, async () => db.getUsers())

// Shorthand: use all defaults
fastify.get('/status', { config: { cache: true } }, async () => ({ status: 'ok' }))
```

## Cache invalidation API

```javascript
fastify.cache.purge('GET|/users|')       // remove by exact key; returns boolean
fastify.cache.purgeByPrefix('/users')    // remove by URL prefix; returns count
fastify.cache.clear()                    // remove all entries and reset stats
fastify.cache.stats()                    // { items, maxItems, hits, misses }
```

## Cache key format

```
METHOD|/path?query|header1:value1|header2:value2
```

## Notes

- Register this plugin **after** authentication plugins. Cache hits short-circuit `onRequest`, so any auth hooks registered before this plugin will have already run.
- Only buffered responses are cached. Streamed responses are not supported.
- The `ETag` header is always a weak ETag: `W/"<16-char-sha256-hex>"`.
