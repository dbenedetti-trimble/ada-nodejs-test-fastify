'use strict'

const fp = require('fastify-plugin')
const { Readable } = require('node:stream')
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
  const varySegment = varyHeaders.map(h => h + ':' + (request.headers[h] || '')).join('|')
  return request.method + '|' + request.url + '|' + varySegment
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
    return store.delete(key)
  }

  function purgeByPrefix (urlPrefix) {
    let count = 0
    for (const key of [...store.keys()]) {
      const urlSegment = key.split('|')[1]
      if (urlSegment && urlSegment.startsWith(urlPrefix)) {
        store.delete(key)
        count++
      }
    }
    return count
  }

  function clear () {
    store.clear()
    hits = 0
    misses = 0
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
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return
    if (!methods.has(request.method)) return

    const reqCC = parseCacheControl(request.headers['cache-control'])

    if (reqCC['no-store']) {
      request.cacheBypass = true
      reply.header('x-cache', 'MISS')
      misses++
      return
    }

    const routeVary = (typeof cacheConfig === 'object' && cacheConfig.vary)
      ? cacheConfig.vary.map(h => h.toLowerCase())
      : []
    const mergedVary = [...new Set([...globalVary, ...routeVary])].sort()
    request.cacheKey = deriveCacheKey(request, mergedVary)

    if (reqCC['no-cache']) {
      reply.header('x-cache', 'MISS')
      misses++
      return
    }

    const entry = store.get(request.cacheKey)
    if (!entry) {
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    if (entry.noCache) {
      const ifNoneMatch = request.headers['if-none-match']
      if (ifNoneMatch && etagMatches(ifNoneMatch, entry.etag)) {
        hits++
        reply.header('x-cache', 'HIT')
        if (entry.etag) reply.header('etag', entry.etag)
        reply.code(304)
        request.cacheHit = true
        return reply.send('')
      }
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    hits++
    reply.header('x-cache', 'HIT')
    if (entry.etag) reply.header('etag', entry.etag)
    if (entry.contentType) reply.header('content-type', entry.contentType)

    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch && etagMatches(ifNoneMatch, entry.etag)) {
      reply.code(304)
      request.cacheHit = true
      return reply.send('')
    }

    reply.code(entry.statusCode)
    request.cacheHit = true
    return reply.send(entry.body)
  })

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return payload
    if (request.cacheHit) return payload
    if (request.cacheBypass) return payload
    if (!methods.has(request.method)) return payload
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload
    if (payload instanceof Readable) return payload

    const resCC = parseCacheControl(reply.getHeader('cache-control'))
    if (resCC['no-store'] || resCC['private']) return payload

    const noCacheResponse = resCC['no-cache'] === true

    const etag = generateETag(payload || '')
    reply.header('etag', etag)

    let ttl = defaultTtl
    if (typeof cacheConfig === 'object' && cacheConfig.ttl != null) {
      ttl = cacheConfig.ttl
    }
    if (resCC['s-maxage'] != null) {
      ttl = resCC['s-maxage'] * 1000
    } else if (resCC['max-age'] != null) {
      ttl = resCC['max-age'] * 1000
    }

    const key = request.cacheKey
    if (!key) return payload

    const expiry = ttl > 0 ? Date.now() + ttl : 0
    store.set(key, {
      body: payload,
      statusCode: reply.statusCode,
      etag,
      contentType: reply.getHeader('content-type'),
      noCache: noCacheResponse || undefined,
      expiry
    })

    return payload
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
