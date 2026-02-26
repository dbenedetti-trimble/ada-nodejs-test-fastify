# fastify-response-cache

Zero-dependency in-memory response cache plugin for Fastify 5. Uses an LRU cache with TTL-based expiry, ETag generation, and conditional request support.

## Install

The plugin lives inside the `plugin-cache/` directory of the Fastify monorepo. No separate install required.

## Usage

```js
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,   // max cached responses (default: 1000)
  ttl: 60000,       // default TTL in ms (default: 60000)
  methods: ['GET'], // HTTP methods to cache (default: ['GET'])
  vary: []          // global Vary headers (default: [])
})
```

### Route-level opt-in

Caching is opt-in per route via `config.cache`:

```js
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,        // override default TTL (optional)
      vary: ['Accept']   // additional Vary headers (optional)
    }
  }
}, async (request, reply) => {
  return await db.getUsers()
})

// Boolean shorthand — uses all plugin defaults
fastify.get('/status', { config: { cache: true } }, async () => {
  return { status: 'ok' }
})
```

Routes without `config.cache` are completely unaffected by the plugin.

## Cache key

```
method + "|" + url + "|" + vary_header_values

Examples:
  GET|/users|accept:application/json
  GET|/users?page=2|accept:application/json
```

## Response headers

| Header    | Value             | When                         |
|-----------|-------------------|------------------------------|
| `ETag`    | `W/"<16-char-hex>"` | All cached route responses |
| `X-Cache` | `HIT`             | Response served from cache   |
| `X-Cache` | `MISS`            | Response served from handler |

## Cache-Control support

**Response directives:**
- `no-store` / `private` — response is not cached
- `no-cache` — cached with zero TTL (forces revalidation)
- `max-age=N` — overrides route TTL with N seconds
- `s-maxage=N` — takes priority over `max-age`

**Request directives:**
- `no-cache` — bypasses cache, runs handler, stores fresh response
- `no-store` — bypasses cache, runs handler, does not store response

## Cache invalidation API

```js
fastify.cache.purge('GET|/users|')    // remove exact entry, returns true/false
fastify.cache.purgeByPrefix('/users') // remove all entries for URL prefix
fastify.cache.clear()                 // remove all entries + reset stats
fastify.cache.stats()                 // { items, maxItems, hits, misses }
```

## Architecture

```
plugin-cache/
  index.js               Plugin entry point
  lib/
    lru-cache.js         Map-based LRU with TTL
    cache-control.js     Cache-Control header parser
    etag.js              SHA-256 weak ETag generator
  types/
    index.d.ts           TypeScript definitions
  test/
    basic.test.js
    ttl-eviction.test.js
    etag.test.js
    cache-control.test.js
    invalidation.test.js
    integration.test.js
  README.md
  package.json
```

## Constraints

- Zero runtime dependencies (only built-in Node.js APIs)
- `fastify-plugin` is a devDependency (already in Fastify repo)
- Fastify 5.x required
