# fastify-response-cache

Fastify plugin for HTTP response caching with in-memory LRU storage, automatic ETag generation, and Cache-Control header support.

## Features

- Route-level opt-in caching via `config.cache`
- In-memory LRU cache with configurable max size and TTL
- Automatic weak ETag generation (SHA-256 based) and `304 Not Modified` responses
- Cache-Control header parsing for both requests and responses
- Vary header support for cache key derivation
- Manual cache invalidation API (purge, prefix purge, clear)
- Cache statistics (hits, misses, item count)
- Zero runtime dependencies (uses `node:crypto`)

## Installation

The plugin is included in this repository. No separate installation is needed.

## Usage

```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,    // Max cached responses (default: 1000)
  ttl: 60000,        // Default TTL in ms (default: 60000)
  methods: ['GET'],  // HTTP methods to cache (default: ['GET'])
  vary: [],          // Global Vary headers for cache key (default: [])
})

// Opt-in per route with boolean shorthand
fastify.get('/status', { config: { cache: true } }, async () => {
  return { status: 'ok' }
})

// Opt-in with route-specific config
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,
      vary: ['Accept'],
    }
  }
}, async () => {
  return await db.getUsers()
})
```

## Cache Invalidation

```javascript
fastify.cache.purge('GET|/users|')         // Purge exact key
fastify.cache.purgeByPrefix('/users')      // Purge by URL prefix
fastify.cache.clear()                      // Purge everything
const stats = fastify.cache.stats()        // { items, maxItems, hits, misses }
```

## Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `X-Cache` | `HIT` | Response served from cache |
| `X-Cache` | `MISS` | Response served from handler |
| `ETag` | `W/"<hash>"` | Weak ETag for conditional requests |

## Cache-Control Support

### Response directives

| Directive | Behavior |
|-----------|----------|
| `no-store` | Do not cache |
| `private` | Do not cache (shared cache) |
| `no-cache` | Cache but always revalidate |
| `max-age=N` | Use N seconds as TTL |
| `s-maxage=N` | Use N seconds as TTL (priority over max-age) |

### Request directives

| Directive | Behavior |
|-----------|----------|
| `no-cache` | Bypass cache, run handler, store fresh response |
| `no-store` | Bypass cache, run handler, do not store |

## Registration Order

Register this plugin **after** authentication plugins so cache hits still require auth.
