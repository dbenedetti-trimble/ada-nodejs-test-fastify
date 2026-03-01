'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl } = require('./lib/cache-control')
const { generateETag, etagMatches } = require('./lib/etag')

/**
 * Derive a cache key from a request and a set of Vary header names.
 *
 * Format: "<METHOD>|<url>|<vary-header-values>"
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {string[]} varyHeaders - lowercased header names sorted alphabetically
 * @returns {string}
 */
function deriveCacheKey (request, varyHeaders) {
  // TODO(features): implement cache key derivation
  // - build vary segment: varyHeaders.map(h => h + ':' + (request.headers[h] || '')).join('|')
  // - return request.method + '|' + request.url + '|' + varySegment
  return request.method + '|' + request.url + '|'
}

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const store = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function purge (key) {
    // TODO(features): delete key from store, return boolean
    return false
  }

  function purgeByPrefix (urlPrefix) {
    // TODO(features): iterate store.keys(), remove entries whose URL segment starts with urlPrefix
    // URL segment is the second pipe-delimited part of the key
    // return count of removed entries
    return 0
  }

  function clear () {
    // TODO(features): store.clear(), reset hits and misses
  }

  function stats () {
    return {
      items: store.size,
      maxItems: store.maxItems,
      hits,
      misses
    }
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  fastify.addHook('onRequest', async function onRequestHook (request, reply) {
    // TODO(features): implement full onRequest cache-hit logic
    // 1. If no cache config on route, return
    // 2. If method not in methods set, return
    // 3. Parse request Cache-Control
    // 4. Derive cache key
    // 5. Look up in store (check expiry)
    // 6. Hit: check If-None-Match, send 304 or cached response, return reply
    // 7. Miss: set X-Cache: MISS, increment misses
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return
    if (!methods.has(request.method)) return
    // placeholder: always miss
    reply.header('x-cache', 'MISS')
    misses++
  })

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    // TODO(features): implement full onSend cache-store logic
    // 1. If no cache config on route, return payload
    // 2. If bypass no-store flag set, return payload
    // 3. If method not in methods set, return payload
    // 4. If statusCode outside 2xx, return payload
    // 5. If payload is Readable, return payload (streams not supported)
    // 6. Parse response Cache-Control
    // 7. If no-store or private, return payload
    // 8. Generate ETag, compute TTL, store entry
    // 9. Set ETag header
    // 10. Return payload unchanged
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return payload
    return payload
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
