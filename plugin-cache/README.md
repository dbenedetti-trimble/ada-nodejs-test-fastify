# fastify-response-cache

In-memory HTTP response caching plugin for Fastify with LRU eviction, ETag-based conditional requests, and Cache-Control header support.

## Usage

```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,   // Max cached responses (default: 1000)
  ttl: 60000,       // Default TTL in ms (default: 60000)
  methods: ['GET'], // HTTP methods to cache (default: ['GET'])
  vary: []          // Global Vary headers for cache key (default: [])
})
```

## Route-level opt-in

```javascript
// Shorthand
fastify.get('/status', { config: { cache: true } }, handler)

// With options
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,
      vary: ['Accept']
    }
  }
}, handler)
```

## Cache API

```javascript
fastify.cache.purge('GET|/users|')      // Remove specific entry
fastify.cache.purgeByPrefix('/users')   // Remove by URL prefix
fastify.cache.clear()                   // Remove all entries
fastify.cache.stats()                   // { items, maxItems, hits, misses }
```

## Features

- LRU eviction when max size reached
- TTL-based expiry with lazy cleanup
- ETag generation and 304 Not Modified responses
- Cache-Control header parsing (no-store, no-cache, max-age, s-maxage, private)
- Vary header support in cache key derivation
- Route-level opt-in with per-route TTL configuration
- Zero runtime dependencies (uses node:crypto for hashing)

## Note on hook ordering

Register this plugin **after** authentication plugins so that cache hits still require authentication (Fastify hooks run in registration order).
