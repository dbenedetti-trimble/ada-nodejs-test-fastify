# fastify-response-cache

In-memory HTTP response caching plugin for Fastify with LRU eviction, ETag generation, and Cache-Control header parsing.

## Usage

```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,    // Max cached responses (default: 1000)
  ttl: 60000,        // Default TTL in ms (default: 60000)
  methods: ['GET'],  // HTTP methods to cache (default: ['GET'])
  vary: []           // Global Vary headers for cache key (default: [])
})

// Opt in per route
fastify.get('/users', { config: { cache: true } }, async () => {
  return await db.getUsers()
})

// With route-specific options
fastify.get('/items', {
  config: { cache: { ttl: 30000, vary: ['Accept'] } }
}, async () => {
  return await db.getItems()
})
```

## Cache Control API

```javascript
fastify.cache.purge('GET|/users|')       // Remove specific entry
fastify.cache.purgeByPrefix('/users')    // Remove by URL prefix
fastify.cache.clear()                    // Remove all entries
fastify.cache.stats()                    // { items, maxItems, hits, misses }
```

## Notes

- Register after authentication plugins so cache hits still require auth.
- Only buffered responses are cached (not streams).
- The plugin respects `Cache-Control` directives on both requests and responses.
