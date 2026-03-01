# Product Requirements Document (PRD)
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


---

# Technical Context
# Technical Context: Fastify Response Cache Plugin

## Verified Tech Stack

From `package.json` (`dependencies` and `devDependencies` sections):

- **Runtime**: Node.js 20.x (current environment; no `engines` field in package.json)
- **Framework**: Fastify 5.7.4 (`"fastify": "5.7.4"` — this is the Fastify core repository itself)
- **Module System**: CommonJS (`"type": "commonjs"` in package.json)
- **Plugin Wrapper**: `fastify-plugin ^5.0.0` (already a devDependency — no new dependency needed)
- **Crypto**: `node:crypto` (built-in — no external dependency)
- **Test Runner**: `borp ^1.0.0` wrapping `node:test` (native Node.js test runner)
- **TypeScript**: `typescript ~5.9.2` with `tsd ^0.33.0` for type-level tests
- **Linter**: `neostandard ^0.12.0` via ESLint (config in `eslint.config.js`)
- **In-codebase cache precedent**: `toad-cache ^3.7.0` (`FifoMap`) is used in `lib/content-type-parser.js` — the plugin implements its own Map-based LRU instead

---

## Relevant Files & Patterns

### New directory structure (does not exist yet)

All plugin files are created under `plugin-cache/` at the repository root. No existing files are modified.

```
plugin-cache/
  index.js
  lib/
    lru-cache.js
    cache-control.js
    etag.js
  types/
    index.d.ts
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

### Existing files to reference for patterns

- `lib/decorate.js` — `decorate()` throws `FST_ERR_DEC_ALREADY_PRESENT` when a decorator name collides; plugin registration must rely on Fastify's built-in guard (calling `fastify.decorate('cache', ...)` twice triggers this error automatically).
- `lib/content-type-parser.js` (`require('toad-cache')` line) — shows how Fastify internally uses a Map-like cache; the plugin's own `lib/lru-cache.js` follows the same philosophy with a native `Map`.
- `test/decorator.test.js` — canonical pattern for testing `fastify.decorate` and verifying decorator encapsulation with `fastify-plugin`.
- `test/hooks.test.js` — shows `addHook('onRequest', ...)` and `addHook('onSend', ...)` test patterns, both callback and async forms.
- `test/context-config.test.js` — demonstrates `request.routeOptions.config` access pattern (lines 1–60); this is the correct API for reading per-route config inside hooks in Fastify 5.x.
- `test/types/plugin.test-d.ts` — reference for TypeScript `tsd` type test structure.
- `fastify.d.ts` / `types/` directory — reference for how Fastify exports and augments types; the plugin's `types/index.d.ts` should follow the same ambient declaration style.

### Existing patterns to follow

- **Plugin registration**: Wrap the plugin function with `fp()` from `fastify-plugin` and export it. Set `{ fastify: '5.x', name: 'fastify-response-cache' }` as metadata (from `test/plugin.1.test.js`, `fp()` wrapper usage pattern).
- **Hook signatures (callback style)**:
  ```javascript
  fastify.addHook('onRequest', function (request, reply, done) { done() })
  fastify.addHook('onSend', function (request, reply, payload, done) { done(null, payload) })
  ```
- **Hook signatures (async style)**:
  ```javascript
  fastify.addHook('onRequest', async function (request, reply) { /* return reply to short-circuit */ })
  fastify.addHook('onSend', async function (request, reply, payload) { return payload })
  ```
- **Route config access in hooks**: `request.routeOptions.config.cache` (verified in `test/internals/reply.test.js` line `t.assert.strictEqual(reply.routeOptions.config, context.config)`; the `request.routeOptions.config` property is the canonical Fastify 5.x API, superseding the deprecated `request.context.config`).
- **Short-circuit in onRequest**: Call `reply.send(...)` and `return reply` to halt the lifecycle and skip the handler.
- **Test file convention**: CommonJS, `'use strict'`, `const { test } = require('node:test')`, assertions via `t.assert.*` (not Node's standalone `assert`).
- **Linting**: neostandard — no trailing commas, max line length 120 (from `eslint.config.js` rules section).

---

## Integration Points

### Systems and modules affected

- **Fastify instance (decorator)**: The plugin adds `fastify.cache` as an instance decorator. Because `fastify-plugin` is used, the decorator escapes plugin encapsulation and is visible on the parent scope — consistent with the pattern shown in `test/plugin.1.test.js` (`fastify.register with fastify-plugin should not encapsulate his code`).
- **Fastify request lifecycle (hooks)**: Two lifecycle hooks are registered globally on the Fastify instance:
  - `onRequest` — earliest hook; fires before body parsing; used to serve cache hits
  - `onSend` — fires after handler and serialization; used to store responses
- **Route config system (`request.routeOptions.config`)**: The plugin reads `request.routeOptions.config.cache` to determine per-route opt-in. No modification to Fastify's route registration API.
- **node:crypto (built-in)**: Used in `lib/etag.js` for SHA-256 hashing; no external package needed.
- **Existing Fastify test suite**: The plugin lives in its own `plugin-cache/` directory. The `.borp.yaml` config (`files: ['test/**/*.test.js', 'test/**/*.test.mjs']`) will **not** automatically pick up tests under `plugin-cache/test/`. Plugin tests must either be run separately or the borp config extended. The existing test suite must continue to pass unmodified (`npm run unit`).

**Impact boundary**: All changes are additive and self-contained in `plugin-cache/`. No existing source files in `lib/`, `types/`, or `test/` are modified.

---

## Data Persistence

### LRU Cache entry schema (`lib/lru-cache.js`)

Each entry stored in the `Map` has this shape:

```javascript
{
  body: string | Buffer,   // Serialized response body
  statusCode: number,      // Original HTTP status code
  headers: object,         // At minimum { 'content-type': '...' }
  etag: string,            // Weak ETag, e.g. W/"a3f1b2c4d5e6f7a8"
  expiry: number           // Date.now() + ttl at time of storage
}
```

### LRU Map eviction strategy (Map-based, O(1))

```javascript
// Simplified structure of lib/lru-cache.js
class LRUCache {
  #map = new Map()
  #maxItems

  constructor (maxItems) { this.#maxItems = maxItems }

  get (key) {
    if (!this.#map.has(key)) return undefined
    const entry = this.#map.get(key)
    // Move to end (most recently used)
    this.#map.delete(key)
    this.#map.set(key, entry)
    return entry
  }

  set (key, value) {
    if (this.#map.has(key)) this.#map.delete(key)
    else if (this.#map.size >= this.#maxItems) {
      // Evict LRU: first key in insertion order
      this.#map.delete(this.#map.keys().next().value)
    }
    this.#map.set(key, value)
  }

  delete (key) { return this.#map.delete(key) }
  keys ()      { return this.#map.keys() }
  get size ()  { return this.#map.size }
}
```

### Cache key format

```
"<METHOD>|<url-with-querystring>|<vary-header-values>"
```

Example: `"GET|/users?page=1|accept:application/json"`. Header names are lowercased; missing headers use empty string (`"accept:"`).

### TypeScript type definitions (`types/index.d.ts`)

The plugin must augment Fastify's module declarations. Pattern from `test/types/plugin.test-d.ts` and `fastify.d.ts`:

```typescript
import { FastifyPluginCallback } from 'fastify'

export interface FastifyResponseCacheOptions {
  maxItems?: number
  ttl?: number
  methods?: string[]
  vary?: string[]
}

export interface CacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

export interface FastifyResponseCacheDecorator {
  purge(key: string): boolean
  purgeByPrefix(prefix: string): number
  clear(): void
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: FastifyResponseCacheDecorator
  }
}

declare const fastifyResponseCache: FastifyPluginCallback<FastifyResponseCacheOptions>
export default fastifyResponseCache
export { fastifyResponseCache }
```

---

## API Definitions

### Plugin registration API

```javascript
const fp = require('fastify-plugin')

// plugin-cache/index.js export signature
module.exports = fp(cachePlugin, { fastify: '5.x', name: 'fastify-response-cache' })

// Consumer usage
fastify.register(require('./plugin-cache'), {
  maxItems: 1000,   // default: 1000
  ttl: 60000,       // default: 60000 ms
  methods: ['GET'], // default: ['GET']
  vary: []          // default: []
})
```

### Cache decorator API (`fastify.cache`)

| Method | Signature | Returns |
|---|---|---|
| `purge` | `purge(key: string)` | `boolean` — `true` if entry existed |
| `purgeByPrefix` | `purgeByPrefix(urlPrefix: string)` | `number` — count of removed entries |
| `clear` | `clear()` | `void` — resets entries and stats counters |
| `stats` | `stats()` | `{ items, maxItems, hits, misses }` |

### Response headers set by plugin

| Header | Value | When |
|---|---|---|
| `X-Cache` | `HIT` | Cache hit (served from store) |
| `X-Cache` | `MISS` | Cache miss (handler ran) |
| `ETag` | `W/"<16-hex-chars>"` | On every cached response (onSend) |

---

## Technical Constraints

- **CommonJS only**: Repository uses `"type": "commonjs"`. All plugin files must use `require()`/`module.exports`, not ESM `import`/`export`. The borp runner handles `.test.mjs` for ESM tests, but the plugin source itself must be CJS.
- **No new runtime dependencies**: `fastify-plugin` is already a devDependency. `node:crypto` is built-in. The plugin's own `package.json` should declare `fastify-plugin` as a peerDependency/dependency using the version already in the root `package.json`.
- **Fastify 5.x API only**: `request.routeOptions.config` (not the deprecated `request.context.config`). Hook short-circuit via `reply.send()` + `return reply`.
- **Linting**: neostandard rules apply (`eslint.config.js`). The borp config discovers `test/**/*.test.js` — plugin tests under `plugin-cache/test/` are outside this glob and will not run via `npm run unit` unless `.borp.yaml` is updated or tests are run with `borp --pattern`.
- **onSend payload type**: In Fastify's `onSend` hook, `payload` is a `string | Buffer | null | NodeJS.ReadableStream`. The plugin only caches buffered (non-stream) responses; skip caching if `payload` is a `Readable`.
- **Hook registration order**: Plugin registers `onRequest` and `onSend` at the plugin level. Per Fastify's hook encapsulation, these hooks apply to all routes on the instance where the plugin is registered. The plugin should be registered **after** authentication plugins (cache hits bypass subsequent hooks including auth).

---

## Testing Strategy

Plugin tests live in `plugin-cache/test/` and follow the exact same patterns as `test/decorator.test.js` and `test/hooks.test.js`.

### Test file boilerplate

```javascript
'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const fp = require('fastify-plugin')
const cachePlugin = require('../index')

// Helper: build fastify with cache plugin registered
async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}
```

### Test scenarios by file

**`basic.test.js`** (VAL-01, VAL-02, VAL-03, VAL-04):

```javascript
test('registers with defaults and exposes cache decorator', async t => {
  const fastify = await buildFastify()
  t.assert.ok(fastify.cache)
  t.assert.deepStrictEqual(fastify.cache.stats(), { items: 0, maxItems: 1000, hits: 0, misses: 0 })
  await fastify.close()
})

test('registers with custom maxItems and ttl', async t => {
  const fastify = await buildFastify({ maxItems: 50, ttl: 5000 })
  t.assert.strictEqual(fastify.cache.stats().maxItems, 50)
  await fastify.close()
})

test('uncached route has no X-Cache header', async t => {
  const fastify = await buildFastify()
  fastify.get('/no-cache', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], undefined)
  t.assert.strictEqual(fastify.cache.stats().misses, 0)
  await fastify.close()
})

test('basic miss then hit with handler call tracking', async t => {
  const fastify = await buildFastify()
  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => { handlerCalls++; return { v: 1 } })

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.ok(r1.headers.etag)
  t.assert.strictEqual(handlerCalls, 1)

  const r2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(r2.json().v, 1)
  t.assert.strictEqual(handlerCalls, 1) // handler not called again
  await fastify.close()
})
```

**`ttl-eviction.test.js`** (VAL-07, VAL-08, VAL-09):

```javascript
test('TTL expiry: hit before expiry, miss after', async t => {
  const fastify = await buildFastify()
  fastify.get('/ttl', { config: { cache: { ttl: 100 } } }, async () => ({ ts: Date.now() }))

  await fastify.inject({ method: 'GET', url: '/ttl' }) // miss

  const hit = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')

  await new Promise(r => setTimeout(r, 150))
  const expired = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('LRU evicts least recently used', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  // register /a, /b, /c with cache
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }
  await fastify.inject({ method: 'GET', url: '/a' }) // miss, stored
  await fastify.inject({ method: 'GET', url: '/b' }) // miss, stored, /a is LRU
  await fastify.inject({ method: 'GET', url: '/c' }) // miss, stored, /a evicted

  const aResult = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(aResult.headers['x-cache'], 'MISS') // evicted

  const bResult = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(bResult.headers['x-cache'], 'HIT')  // still cached
  await fastify.close()
})

test('LRU access updates recency', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }
  await fastify.inject({ method: 'GET', url: '/a' }) // miss
  await fastify.inject({ method: 'GET', url: '/b' }) // miss
  await fastify.inject({ method: 'GET', url: '/a' }) // hit — refreshes /a recency, /b is now LRU
  await fastify.inject({ method: 'GET', url: '/c' }) // miss — evicts /b

  const a = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(a.headers['x-cache'], 'HIT')

  const b = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(b.headers['x-cache'], 'MISS')
  await fastify.close()
})
```

**`etag.test.js`** (VAL-10, VAL-11, ETag format):

```javascript
test('ETag format is W/"16-hex-chars"', async t => {
  const fastify = await buildFastify()
  fastify.get('/e', { config: { cache: true } }, async () => ({ x: 1 }))
  const r = await fastify.inject({ method: 'GET', url: '/e' })
  t.assert.match(r.headers.etag, /^W\/"[0-9a-f]{16}"$/)
  await fastify.close()
})

test('If-None-Match matching ETag returns 304 with no body', async t => {
  const fastify = await buildFastify()
  fastify.get('/cond', { config: { cache: true } }, async () => ({ x: 1 }))
  const first = await fastify.inject({ method: 'GET', url: '/cond' })
  const etag = first.headers.etag

  const second = await fastify.inject({
    method: 'GET', url: '/cond',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(second.statusCode, 304)
  t.assert.strictEqual(second.body, '')
  await fastify.close()
})

test('If-None-Match non-matching ETag returns 200 with full body', async t => {
  const fastify = await buildFastify()
  fastify.get('/cond2', { config: { cache: true } }, async () => ({ x: 1 }))
  await fastify.inject({ method: 'GET', url: '/cond2' }) // prime cache

  const res = await fastify.inject({
    method: 'GET', url: '/cond2',
    headers: { 'if-none-match': 'W/"0000000000000000"' }
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { x: 1 })
  await fastify.close()
})
```

**`cache-control.test.js`** (VAL-12–VAL-16):

```javascript
test('Cache-Control: no-store on response prevents caching', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/ns', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-store')
    return { calls }
  })
  await fastify.inject({ method: 'GET', url: '/ns' })
  await fastify.inject({ method: 'GET', url: '/ns' })
  t.assert.strictEqual(calls, 2) // handler called both times
  await fastify.close()
})

test('Cache-Control: max-age on response overrides route TTL', async t => {
  const fastify = await buildFastify()
  fastify.get('/ma', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 'max-age=1')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/ma' }) // miss, stored with 1s TTL
  await new Promise(r => setTimeout(r, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/ma' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Request Cache-Control: no-cache bypasses cache but stores fresh response', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nc', { config: { cache: true } }, async () => { calls++; return { c: calls } })

  await fastify.inject({ method: 'GET', url: '/nc' }) // miss, stored

  const bypass = await fastify.inject({
    method: 'GET', url: '/nc',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(calls, 2) // handler ran despite cached entry
  t.assert.strictEqual(bypass.headers['x-cache'], 'MISS')
  await fastify.close()
})
```

**`invalidation.test.js`** (VAL-19–VAL-22):

```javascript
test('purge(key) removes entry and returns true', async t => {
  const fastify = await buildFastify()
  fastify.get('/u', { config: { cache: true } }, async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/u' }) // prime cache

  const removed = fastify.cache.purge('GET|/u|')
  t.assert.strictEqual(removed, true)
  const res = await fastify.inject({ method: 'GET', url: '/u' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('stats() tracks hits and misses correctly', async t => {
  const fastify = await buildFastify()
  fastify.get('/s', { config: { cache: true } }, async () => ({}))

  await fastify.inject({ method: 'GET', url: '/s' }) // miss
  await fastify.inject({ method: 'GET', url: '/s' }) // hit
  await fastify.inject({ method: 'GET', url: '/s' }) // hit

  const { hits, misses } = fastify.cache.stats()
  t.assert.strictEqual(hits, 2)
  t.assert.strictEqual(misses, 1)
  await fastify.close()
})
```

**`integration.test.js`** (VAL-05, VAL-06, VAL-17, VAL-18, VAL-23):

```javascript
test('different query strings produce different cache entries', async t => {
  const fastify = await buildFastify()
  fastify.get('/items', { config: { cache: true } }, async (req) => ({ page: req.query.page }))

  const p1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  const p2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(p1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(p2.headers['x-cache'], 'MISS')

  const p1hit = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(p1hit.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('Vary header produces different cache entries per Accept value', async t => {
  const fastify = await buildFastify()
  fastify.get('/v', { config: { cache: { vary: ['Accept'] } } }, async (req) => ({ ct: req.headers.accept }))

  const json = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'application/json' } })
  const html = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'text/html' } })
  t.assert.strictEqual(json.headers['x-cache'], 'MISS')
  t.assert.strictEqual(html.headers['x-cache'], 'MISS') // different key

  const jsonHit = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'application/json' } })
  t.assert.strictEqual(jsonHit.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('POST requests are not cached', async t => {
  const fastify = await buildFastify()
  fastify.post('/p', { config: { cache: true } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'POST', url: '/p' })
  const r2 = await fastify.inject({ method: 'POST', url: '/p' })
  t.assert.strictEqual(r1.headers['x-cache'], undefined)
  t.assert.strictEqual(r2.headers['x-cache'], undefined)
  await fastify.close()
})

test('non-2xx responses are not cached', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/err', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.code(404)
    return { error: 'not found' }
  })
  await fastify.inject({ method: 'GET', url: '/err' })
  await fastify.inject({ method: 'GET', url: '/err' })
  t.assert.strictEqual(calls, 2) // 404 not cached
  await fastify.close()
})
```

### Running plugin tests

Because `.borp.yaml` only picks up `test/**/*.test.js`, plugin tests must be run with:

```bash
node --test plugin-cache/test/*.test.js
# or via borp directly:
npx borp --pattern 'plugin-cache/test/*.test.js'
```

TypeScript type tests:

```bash
npx tsd --files plugin-cache/types/*.d.ts
```
