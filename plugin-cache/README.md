# fastify-response-cache

In-memory LRU HTTP response cache plugin for Fastify 5.x.

## Features

- Route-level opt-in caching with per-route TTL
- ETag generation and `304 Not Modified` support
- `Cache-Control` header parsing (no-store, no-cache, max-age, s-maxage, private)
- Vary header support in cache key derivation
- LRU eviction when max cache size is reached
- TTL-based expiry with lazy eviction
- Manual cache invalidation API

## Installation

```bash
npm install fastify-response-cache
```

## Usage

```javascript
const fastify = require('fastify')()
const cachePlugin = require('fastify-response-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,   // Max cached responses (default: 1000)
  ttl: 60000,       // Default TTL in milliseconds (default: 60000)
  methods: ['GET'], // HTTP methods to cache (default: ['GET'])
  vary: [],         // Global Vary headers to include in cache key (default: [])
})

// Opt-in per route
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,
      vary: ['Accept'],
    }
  }
}, async (request, reply) => {
  return await db.getUsers()
})

// Shorthand: boolean true uses all defaults
fastify.get('/status', { config: { cache: true } }, async () => {
  return { status: 'ok' }
})
```

## Cache invalidation API

```javascript
fastify.cache.purge('GET|/users|')         // Purge specific entry by key
fastify.cache.purgeByPrefix('/users')      // Purge all entries matching URL prefix
fastify.cache.clear()                      // Purge all entries
const stats = fastify.cache.stats()        // { items, maxItems, hits, misses }
```

## Response headers

| Header    | Value | When                            |
|-----------|-------|---------------------------------|
| `X-Cache` | `HIT` | Cache hit (served from store)   |
| `X-Cache` | `MISS`| Cache miss (handler ran)        |
| `ETag`    | `W/"<16-hex>"` | On every cached response |

## Cache key format

```
"<METHOD>|<url-with-querystring>|<vary-header-values>"
```

Example: `GET|/users?page=1|accept:application/json`

## Plugin registration order

Register this plugin **after** authentication plugins. Cache hits bypass subsequent hooks including auth.

## Running tests

```bash
node --test plugin-cache/test/*.test.js
```
