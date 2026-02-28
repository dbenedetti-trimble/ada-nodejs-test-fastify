'use strict'

const fp = require('fastify-plugin')
const { Readable } = require('node:stream')
const LRUCache = require('./lib/lru-cache')
const { parse: parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')

/**
 * Derive a cache key from request method, URL, and Vary headers.
 * Format: "METHOD|url-with-querystring|vary-header-values"
 * @param {string} method
 * @param {string} url
 * @param {string[]} varyHeaders - lowercased header names
 * @param {object} requestHeaders
 * @returns {string}
 */
function buildCacheKey (method, url, varyHeaders, requestHeaders) {
  // TODO: implement — join method, url, and lowercased header values
  return method + '|' + url + '|'
}

/**
 * Check whether the given ETag satisfies an If-None-Match header value.
 * Supports wildcard (*) and comma-separated lists.
 * @param {string} ifNoneMatch
 * @param {string} etag
 * @returns {boolean}
 */
function matchesETag (ifNoneMatch, etag) {
  // TODO: implement — handle *, comma-separated ETags
  return false
}

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const lru = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  // --- Cache decorator API ---

  function purge (key) {
    // TODO: implement — delete exact key, return boolean
    return false
  }

  function purgeByPrefix (urlPrefix) {
    // TODO: implement — iterate keys, remove entries whose URL segment starts with urlPrefix, return count
    return 0
  }

  function clear () {
    // TODO: implement — clear all entries and reset hit/miss counters
  }

  function stats () {
    return {
      items: lru.size,
      maxItems,
      hits,
      misses
    }
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  // --- onRequest hook: serve cache hits ---

  fastify.addHook('onRequest', async function onRequestHook (request, reply) {
    // TODO: implement
    // 1. Check request.routeOptions.config.cache; if falsy, return
    // 2. Check request method is in configured methods; if not, return
    // 3. Parse request Cache-Control for no-cache / no-store
    // 4. Build cache key
    // 5. Look up lru cache; check expiry
    // 6. If HIT: check If-None-Match, send 304 or cached response, increment hits, return reply
    // 7. If MISS: increment misses, set X-Cache: MISS, continue
  })

  // --- onSend hook: store responses ---

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    // TODO: implement
    // 1. Check route has caching enabled
    // 2. Skip streams and null payloads
    // 3. Check method is cacheable
    // 4. Check status code is 2xx
    // 5. Parse response Cache-Control for no-store, private, no-cache, max-age, s-maxage
    // 6. Compute effective TTL
    // 7. Generate ETag from payload
    // 8. Store entry in LRU cache
    // 9. Set ETag and X-Cache: MISS headers on response
    return payload
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
