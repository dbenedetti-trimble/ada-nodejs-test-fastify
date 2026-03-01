# fastify-response-cache

In-memory LRU response cache plugin for Fastify with ETag, Cache-Control, and conditional request (304) support.

## Features

- **Zero runtime dependencies** — LRU cache and ETag generation use Node.js built-ins only
- **ETag support** — Weak ETags generated via SHA-256; If-None-Match / 304 handled automatically
- **Cache-Control parsing** — Respects `no-store`, `no-cache`, `private`, `max-age`, `s-maxage`
- **Route-level opt-in** — Only routes that declare `config.cache` are cached; others are unaffected
- **TTL + LRU eviction** — Per-entry expiry with lazy cleanup; LRU eviction when capacity is reached
- **Manual invalidation** — `purge()`, `purgeByPrefix()`, `clear()`, and `stats()` via the `fastify.cache` decorator
- **Vary header support** — Per-route and global Vary headers included in cache key derivation

## Installation

```bash
npm install fastify-response-cache
```

## Usage

```js
const fastify = require('fastify')()
const cachePlugin = require('fastify-response-cache')

// Register AFTER authentication plugins so cache hits still pass through auth
fastify.register(cachePlugin, {
  maxItems: 1000,   // Max cached responses (default: 1000)
  ttl: 60000,       // Default TTL in ms (default: 60000)
  methods: ['GET'], // HTTP methods to cache (default: ['GET'])
  vary: [],         // Global Vary headers (default: [])
})

// Opt a route into caching with defaults
fastify.get('/status', { config: { cache: true } }, async () => {
  return { status: 'ok' }
})

// Opt a route into caching with per-route overrides
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,
      vary: ['Accept'],
    }
  }
}, async (request) => {
  return await db.getUsers()
})

// Manual cache control
fastify.cache.purge('GET|/users|')
fastify.cache.purgeByPrefix('/users')
fastify.cache.clear()
const stats = fastify.cache.stats()
// → { items: 42, maxItems: 1000, hits: 150, misses: 30 }
```

## Cache key format

```
<METHOD>|<url-with-query-string>|<vary-header-1-name>:<value>|<vary-header-2-name>:<value>
```

Example with `vary: ['Accept']`:
- `GET /users` with `Accept: application/json` → `GET|/users|accept:application/json`
- `GET /users?page=2` → `GET|/users?page=2|accept:application/json`

## Response headers

| Header | Value | Description |
|---|---|---|
| `X-Cache` | `HIT` or `MISS` | Whether the response was served from cache |
| `ETag` | `W/"<hash>"` | Weak ETag for conditional request support |

## Cache-Control behavior

### Response directives

| Directive | Effect |
|---|---|
| `no-store` | Response is not cached |
| `private` | Response is not cached |
| `no-cache` | Cached but treated as immediately expired (still useful for ETags) |
| `max-age=N` | Overrides route TTL (N seconds) |
| `s-maxage=N` | Overrides `max-age` for shared caches (takes priority) |

### Request directives

| Directive | Effect |
|---|---|
| `no-cache` | Bypasses cache, runs handler, stores fresh response |
| `no-store` | Bypasses cache, runs handler, does not store response |

## Plugin registration order

Register this plugin **after** authentication plugins. Because the `onRequest` hook serves cache hits before the handler runs, registering before auth would bypass authentication for cached responses.

```js
fastify.register(authPlugin)
fastify.register(cachePlugin) // after auth
```

## TypeScript

Type definitions are included. The `FastifyInstance` is augmented with `cache: CacheDecorator`, and `FastifyContextConfig` is augmented with the `cache` route option.
