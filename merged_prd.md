**Repository**: `https://github.com/dbenedetti-trimble/ada-nodejs-test-fastify`

---


# Context & Problem


## Problem statement

- **Who is affected?** Developers building APIs with Fastify who need HTTP response caching without pulling in external caching infrastructure.
- **What is the issue?** Fastify has no built-in response caching. Developers either implement ad-hoc caching per route (error-prone, inconsistent) or reach for external solutions like Redis or Varnish even when a simple in-memory cache would suffice. There's no standard way to add cache headers, generate ETags, or handle conditional requests.
- **Why does it matter?** Response caching is one of the most impactful performance optimizations for read-heavy APIs. A well-built Fastify plugin that follows ecosystem conventions gives developers a drop-in solution that handles the HTTP caching semantics correctly (ETags, `304 Not Modified`, `Cache-Control` parsing), which are easy to get wrong when hand-rolling.

## Success metrics


|                          Metric                           |    Baseline     |                               Target                               | Validation method |
| --------------------------------------------------------- | --------------- | ------------------------------------------------------------------ | ----------------- |
| Cache hit returns stored response without running handler | No caching      | Cached GET responses served from memory, handler not called        | Unit tests        |
| ETag-based conditional requests return 304                | No ETag support | If-None-Match requests get 304 Not Modified when content unchanged | Unit tests        |
| Cache respects Cache-Control: no-store                    | N/A             | Responses with no-store are never cached                           | Unit tests        |
| Non-GET requests bypass cache                             | N/A             | POST/PUT/DELETE/PATCH never cached                                 | Unit tests        |
| TTL expiry evicts stale entries                           | N/A             | Entries removed after configured TTL                               | Unit tests        |
| LRU eviction when max size reached                        | N/A             | Oldest entries evicted when cache is full                          | Unit tests        |
| All existing Fastify tests pass                           | 100% pass       | 100% pass (no regressions)                                         | npm run unit      |
| TypeScript types provided                                 | N/A             | Plugin exports .d.ts with full type coverage                       | Type tests        |


# Scope & Constraints


## In scope

- New Fastify plugin implementing HTTP response caching with in-memory LRU storage
- Automatic ETag generation (content-hash based) and 304 Not Modified responses
- Route-level opt-in caching with per-route TTL configuration
- Cache-Control header parsing (respect no-store, no-cache, max-age)
- Cache invalidation API (manual purge by key, pattern-based purge by URL prefix)
- Vary header support in cache key derivation
- TypeScript type definitions for the plugin API
- Comprehensive test suite using the existing test infrastructure (node:test via borp)

## Out of scope

- External cache backends (Redis, Memcached, etc.) -- this is in-memory only
- Response compression (handled separately by @fastify/compress)
- Cache warming or prefetching
- Distributed cache invalidation
- Caching of streamed responses (only buffered responses are cached)
- Changes to Fastify core -- this is a self-contained plugin

## Dependencies & Risks

- **No new runtime dependencies.** The LRU cache and ETag generation are implemented from scratch using built-in Node.js APIs (node:crypto for hashing). If the LRU implementation proves too complex for Ada to get right, mnemonist (an existing devDependency-friendly data structure library) is an acceptable alternative, but the PRD prefers zero deps.
- **Plugin pattern compliance**: The plugin must use fastify-plugin to avoid encapsulation (the cache decorator needs to be visible to the parent instance). This is the most common mistake when writing Fastify plugins.
- **Test runner**: Tests must use node:test (via borp), matching Fastify's existing test infrastructure. Do not introduce Jest, Mocha, or other test runners.
- **Hook ordering**: The plugin uses onRequest (to serve cache hits) and onSend (to store responses). Hook ordering relative to other plugins (e.g., auth, CORS) matters. The plugin should document that it should be registered after authentication plugins so that cache hits still require auth.

# Functional Requirements


## CACHE-1: Plugin registration and configuration


**Required behavior:**


The plugin registers via fastify.register() with a configuration object:


```javascript
const fastify = require('fastify')()
const cachePlugin = require('./plugin-cache')

fastify.register(cachePlugin, {
  maxItems: 1000,        // Max cached responses (default: 1000)
  ttl: 60000,            // Default TTL in milliseconds (default: 60000 / 1 minute)
  methods: ['GET'],      // HTTP methods to cache (default: ['GET'])
  vary: [],              // Global Vary headers to include in cache key (default: [])
})
```


The plugin registers a cache decorator on the Fastify instance for manual cache control.


**Acceptance criteria:**

- Plugin registers without errors with default options (no config object required)
- Plugin registers with custom options that override defaults
- Plugin throws FST_ERR_DEC_ALREADY_PRESENT if cache decorator already exists
- Plugin uses fastify-plugin wrapper so the decorator is visible to the parent scope
- Registering the plugin does not affect routes that don't opt in to caching

## CACHE-2: Route-level cache opt-in


**Required behavior:**


Caching is opt-in per route via route configuration:


```javascript
fastify.get('/users', {
  config: {
    cache: {
      ttl: 30000,           // Override default TTL for this route (optional)
      vary: ['Accept'],     // Additional Vary headers for this route (optional)
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


Routes without config.cache are completely unaffected by the plugin.


**Acceptance criteria:**

- Routes with config.cache = true use the global default TTL
- Routes with config.cache.ttl = N use the specified TTL
- Routes with config.cache.vary = ['Accept'] include those headers in the cache key
- Routes without config.cache are not cached, and no hooks run for them
- Route-level vary headers are merged with global vary headers (union, no duplicates)

## CACHE-3: Cache key derivation


**Required behavior:**


The cache key is derived from the request method, URL (path + query string), and any configured Vary headers. Format: method + "|" + url + "|" + vary_header_values


For example, with vary: ['Accept']:

- GET /users with Accept: application/json produces key GET|/users|accept:application/json
- GET /users with Accept: text/html produces key GET|/users|accept:text/html (different cache entry)
- GET /users?page=2 with Accept: application/json produces key GET|/users?page=2|accept:application/json

**Acceptance criteria:**

- Same method + URL + Vary headers = cache hit
- Different query strings = different cache entries
- Different Vary header values = different cache entries
- Missing Vary headers in request = treated as empty string for that header
- Header names are lowercased for consistency

## CACHE-4: Cache hit behavior (onRequest hook)


**Required behavior:**


On incoming requests to cached routes, the plugin checks the cache in an onRequest hook:

1. Derive cache key from request
2. Look up key in cache
3. If **miss**: continue to handler (do nothing)
4. If **hit and not expired**:
	- Check for conditional request (If-None-Match header)
	- If ETag matches, send 304 Not Modified with no body
	- If no conditional request or ETag mismatch, send cached response (status, headers, body)
	- In both cases, the route handler is **not called**

**Acceptance criteria:**

- Cache hit serves the stored response body with original status code
- Cache hit preserves the original Content-Type header
- Cache hit sets X-Cache: HIT response header
- Cache miss sets X-Cache: MISS response header
- Cache hit with matching If-None-Match returns 304 with no body
- Cache hit skips the route handler entirely (verify handler is not called)
- Cache miss runs the route handler normally

## CACHE-5: Cache store behavior (onSend hook)


**Required behavior:**


After the route handler runs and produces a response, the plugin stores it in an onSend hook:

1. Only store if the route has caching enabled
2. Only store for configured methods (default: GET only)
3. Only store for successful responses (2xx status codes)
4. Check Cache-Control response header -- do not store if no-store is present
5. Generate ETag from response body (SHA-256 hash, truncated, prefixed with W/ for weak ETag)
6. Store: status code, response headers (Content-Type at minimum), body, ETag, expiry timestamp
7. Set ETag header on the outgoing response

**Acceptance criteria:**

- Successful GET responses on cached routes are stored in the cache
- Non-2xx responses are not cached (e.g., 404, 500)
- Responses with Cache-Control: no-store are not cached
- POST/PUT/DELETE/PATCH responses are not cached
- The stored entry includes status code, Content-Type, body, and generated ETag
- The ETag header is set on the response sent to the client
- Subsequent identical requests return the cached response

## CACHE-6: TTL expiry and LRU eviction


**Required behavior:**


The in-memory cache implements both time-based expiry and size-based eviction:

- **TTL**: Each entry has an expiry timestamp. On lookup, expired entries are treated as misses and removed.
- **LRU**: When the cache reaches maxItems, the least recently used entry is evicted to make room.
- **Access updates recency**: A cache hit moves the entry to the "most recently used" position.

**Acceptance criteria:**

- Entry stored with TTL of 100ms is a miss after 100ms
- Entry stored with TTL of 10000ms is a hit before expiry
- When cache has maxItems entries and a new one is added, the least recently accessed entry is evicted
- Accessing an entry (cache hit) updates its recency (prevents eviction)
- Expired entries are cleaned up on access (lazy eviction), not via timers

## CACHE-7: Cache-Control header parsing


**Required behavior:**


The plugin parses the Cache-Control header on responses to determine caching behavior:


| Directive  |                                                    Behavior                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| no-store   | Do not cache the response                                                                                       |
| no-cache   | Cache the response but always revalidate (treat as immediate expiry; still store for ETag conditional requests) |
| max-age=N  | Override route TTL with N seconds (converted to milliseconds)                                                   |
| private    | Do not cache (server-side cache is shared)                                                                      |
| s-maxage=N | Override route TTL with N seconds (takes priority over max-age for shared caches)                               |


The plugin also parses Cache-Control on incoming requests:


| Directive |                           Behavior                            |
| --------- | ------------------------------------------------------------- |
| no-cache  | Bypass cache, run handler, but still store the fresh response |
| no-store  | Bypass cache, run handler, do not store the response          |


**Acceptance criteria:**

- Response with Cache-Control: no-store is not cached
- Response with Cache-Control: private is not cached
- Response with Cache-Control: max-age=30 uses 30s TTL regardless of route config
- Response with Cache-Control: s-maxage=10, max-age=30 uses 10s TTL
- Request with Cache-Control: no-cache bypasses cache and runs handler
- Response with Cache-Control: no-cache is stored but always revalidated on next request
- Responses without Cache-Control use the route/global default TTL

## CACHE-8: Cache invalidation API


**Required behavior:**


The fastify.cache decorator exposes methods for manual cache control:


```javascript
fastify.cache.purge('GET|/users|')         // Purge specific entry by key
fastify.cache.purgeByPrefix('/users')      // Purge all entries matching URL prefix
fastify.cache.clear()                      // Purge all entries
const stats = fastify.cache.stats()        // { items: 42, maxItems: 1000, hits: 150, misses: 30 }
```


**Acceptance criteria:**

- purge(key) removes the exact entry and returns true if it existed, false otherwise
- purgeByPrefix(prefix) removes all entries whose URL starts with the given prefix
- clear() removes all entries and resets stats counters
- stats() returns current item count, max items, total hits, and total misses
- Hit/miss counters increment correctly as requests are served

## CACHE-9: ETag generation and conditional requests


**Required behavior:**


The plugin generates weak ETags from response bodies:

1. Hash the response body using SHA-256 (node:crypto)
2. Truncate to first 16 hex characters
3. Format as weak ETag: W/"hash"

On subsequent requests with If-None-Match header:

1. If the header value matches the stored ETag, respond with 304 Not Modified
2. The 304 response has no body but includes the ETag header
3. If no match, serve the full cached response

**Acceptance criteria:**

- ETag is set on every cached response (W/"16-char-hex" format)
- If-None-Match with matching ETag returns 304 with no body
- If-None-Match with non-matching ETag returns full cached response (200)
- If-None-Match with * value returns 304 if any cached response exists for the route
- Multiple ETags in If-None-Match (comma-separated) are all checked

# Technical Solution


## Architecture & Components


The plugin is a new directory in the repository root. No existing files are modified.


```javascript
plugin-cache/
  index.js               -- Plugin entry point (register function)
  lib/
    lru-cache.js          -- LRU cache implementation (Map-based)
    cache-control.js      -- Cache-Control header parser
    etag.js               -- ETag generation utility
  types/
    index.d.ts            -- TypeScript type definitions
  test/
    basic.test.js         -- Registration, config, basic hit/miss
    ttl-eviction.test.js  -- TTL expiry and LRU eviction
    etag.test.js          -- ETag generation and conditional requests
    cache-control.test.js -- Cache-Control header parsing
    invalidation.test.js  -- Purge, prefix purge, clear, stats
    integration.test.js   -- Multi-route, hooks ordering, edge cases
  README.md               -- Usage documentation
  package.json            -- Plugin package metadata
```


## Implementation notes


**LRU Cache (lib/lru-cache.js):**


Use a Map for O(1) lookup with insertion-order iteration. Map in modern V8 maintains insertion order, so:

- On access (hit): delete and re-insert the entry to move it to the end (most recent)
- On insert when full: map.keys().next().value gives the oldest (least recent) key for eviction
- Each value stores: { body, statusCode, headers, etag, expiry }

This is simpler and faster than a linked-list LRU for the expected cache sizes. No external dependency needed.


**Plugin entry point (index.js):**


```javascript
const fp = require('fastify-plugin')

async function cachePlugin (fastify, opts) {
  const cache = new LRUCache(opts.maxItems ?? 1000)
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  fastify.addHook('onRequest', onRequestHook)
  fastify.addHook('onSend', onSendHook)
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
```


**onRequest hook:**

1. Check if request.routeOptions.config.cache is set; if not, return immediately
2. Check if request method is in configured methods; if not, return
3. Parse request Cache-Control for no-cache/no-store
4. Derive cache key
5. Look up in LRU cache; check expiry
6. If hit: check If-None-Match for conditional response, then reply.send() and return reply
7. If miss: set X-Cache: MISS header and continue

**onSend hook:**

1. Check if route has caching enabled and response is cacheable (2xx, correct method)
2. Parse response Cache-Control for no-store, private, max-age, s-maxage
3. Generate ETag from payload
4. Store entry in LRU cache with computed TTL
5. Set ETag and X-Cache headers on response
6. Return payload unchanged

**Cache-Control parser (lib/cache-control.js):**


Simple string parser that extracts directives and their values. No need for a full RFC 7234 parser; handle the directives listed in CACHE-7.


**ETag generation (lib/etag.js):**


```javascript
const { createHash } = require('node:crypto')

function generateETag (body) {
  const hash = createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex')
    .slice(0, 16)
  return 'W/"' + hash + '"'
}
```


## Route config access


In the onRequest hook, the route's cache configuration is available via request.routeOptions.config. This is populated by Fastify from the route definition's config property. The hook checks for request.routeOptions.config.cache to determine if caching is enabled for this route.


## Dependency changes

- **Runtime**: None. Uses node:crypto (built-in) and fastify-plugin (already a devDependency of Fastify).
- **Dev**: No new dev dependencies. Tests use the existing borp runner and node:test.

# Validation Contract


## VAL-01: Plugin registers with defaults


GIVEN a Fastify instance, WHEN I register the cache plugin with no options, THEN the plugin registers without error AND fastify.cache is available as a decorator AND fastify.cache.stats() returns { items: 0, maxItems: 1000, hits: 0, misses: 0 }


## VAL-02: Plugin registers with custom options


GIVEN a Fastify instance, WHEN I register the cache plugin with { maxItems: 50, ttl: 5000 }, THEN fastify.cache.stats().maxItems is 50 AND the default TTL for cached routes is 5000ms


## VAL-03: Uncached route is unaffected


GIVEN a route registered without config.cache, WHEN I send a GET request to that route, THEN the handler runs normally AND no X-Cache header is set AND no entry is stored in the cache


## VAL-04: Basic cache miss then hit


GIVEN a route with config.cache = true, WHEN I send a GET request (first time), THEN the handler runs AND the response has X-Cache: MISS AND has an ETag header. WHEN I send the same GET request (second time), THEN the handler does NOT run AND the response has X-Cache: HIT AND the response body matches the first response


## VAL-05: Cache key includes query string


GIVEN a cached route, WHEN I send GET /items?page=1 AND then send GET /items?page=2, THEN both requests are cache misses (different cache keys) AND each response is cached independently


## VAL-06: Vary header produces different cache entries


GIVEN a route with config.cache.vary = ['Accept'], WHEN I send GET /data with Accept: application/json AND then send GET /data with Accept: text/html, THEN both are cache misses. WHEN I send GET /data with Accept: application/json again, THEN it is a cache hit


## VAL-07: TTL expiry


GIVEN a route with config.cache.ttl = 100 (100ms), WHEN I send a GET request (miss), wait 50ms and send again, THEN it is a hit. WHEN I wait another 100ms and send again, THEN it is a miss (expired)


## VAL-08: LRU eviction


GIVEN maxItems: 2 and 3 cached routes /a, /b, /c, WHEN I request /a (miss), /b (miss), /c (miss), THEN /a is evicted AND requesting /a is a miss AND /b is still a hit


## VAL-09: LRU access updates recency


GIVEN maxItems: 2, WHEN I request /a (miss), /b (miss), /a (hit refreshes recency), /c (miss evicts /b not /a), THEN /a is still a hit AND /b is a miss


## VAL-10: ETag conditional request returns 304


GIVEN a cached route requested once (cache stored with ETag), WHEN I send the same request with If-None-Match set to the stored ETag, THEN the response status is 304 AND the body is empty AND the handler does NOT run


## VAL-11: ETag mismatch returns full response


GIVEN a cached route with a stored ETag, WHEN I send a request with a non-matching If-None-Match, THEN the response status is 200 AND the full cached body is returned


## VAL-12: Cache-Control: no-store prevents caching


GIVEN a cached route whose handler sets Cache-Control: no-store, WHEN I send a GET request, THEN the response is returned normally AND is NOT stored in the cache AND a second identical request runs the handler again


## VAL-13: Cache-Control: private prevents caching


GIVEN a cached route whose handler sets Cache-Control: private, WHEN I send a GET request, THEN the response is NOT stored in the cache


## VAL-14: Cache-Control: max-age overrides route TTL


GIVEN a route with config.cache.ttl = 60000 and the handler sets Cache-Control: max-age=1, WHEN I send a GET request (miss, stored with 1s TTL) and wait 1.5s, THEN the next request is a miss


## VAL-15: Cache-Control: s-maxage takes priority


GIVEN a cached route whose handler sets Cache-Control: s-maxage=5, max-age=60, WHEN the response is cached, THEN the TTL is 5 seconds (s-maxage wins for shared cache)


## VAL-16: Request Cache-Control: no-cache bypasses cache


GIVEN a cached route with a stored response, WHEN I send a request with Cache-Control: no-cache, THEN the handler runs (cache bypassed) AND the fresh response replaces the cached entry


## VAL-17: Non-GET requests are not cached


GIVEN a route with method POST and config.cache = true, WHEN I send a POST request, THEN the handler runs AND the response is NOT cached AND no X-Cache header is set


## VAL-18: Non-2xx responses are not cached


GIVEN a cached GET route whose handler returns a 404, WHEN I send a GET request, THEN the 404 is returned AND is NOT stored in the cache


## VAL-19: Purge removes specific entry


GIVEN a cached response for GET /users, WHEN I call fastify.cache.purge with the key, THEN the call returns true AND requesting GET /users is now a miss


## VAL-20: Purge by prefix removes matching entries


GIVEN cached responses for /users, /users/1, /users/2, and /posts, WHEN I call fastify.cache.purgeByPrefix('/users'), THEN the /users entries are removed AND /posts is still cached


## VAL-21: Clear removes all entries


GIVEN multiple cached responses, WHEN I call fastify.cache.clear(), THEN stats().items is 0 AND all subsequent requests are cache misses


## VAL-22: Stats track hits and misses


GIVEN a cached route, WHEN I send 3 requests (1 miss + 2 hits), THEN stats().hits is 2 AND stats().misses is 1


## VAL-23: No regressions in existing test suite


GIVEN all plugin files are added, WHEN I run npm run unit, THEN all existing Fastify tests pass AND when I run npm run test:typescript, THEN type checking passes

