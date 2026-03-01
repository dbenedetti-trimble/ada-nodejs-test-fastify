'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const parseCacheControl = require('./lib/cache-control')
const { generateETag, matchesETag } = require('./lib/etag')

const kSkipStore = Symbol('kSkipStore')
const kBypassCache = Symbol('kBypassCache')
const kCacheHit = Symbol('kCacheHit')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const lru = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function buildCacheKey (request, varyHeaders) {
    const varyPart = varyHeaders
      .map(h => h + ':' + (request.headers[h] || ''))
      .join('|')
    return request.method + '|' + request.url + '|' + varyPart
  }

  function purge (key) {
    return lru.delete(key)
  }

  function purgeByPrefix (urlPrefix) {
    let count = 0
    for (const [key] of lru.entries()) {
      const url = key.split('|')[1]
      if (url && url.startsWith(urlPrefix)) {
        lru.delete(key)
        count++
      }
    }
    return count
  }

  function clear () {
    lru.clear()
    hits = 0
    misses = 0
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

  async function onRequestHook (request, reply) {
    const cacheConfig = request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return

    if (!methods.has(request.method)) return

    const reqCc = parseCacheControl(request.headers['cache-control'])

    if (reqCc.noStore) {
      request[kSkipStore] = true
      return
    }

    if (reqCc.noCache) {
      request[kBypassCache] = true
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    const routeVary = cacheConfig !== true && Array.isArray(cacheConfig.vary)
      ? cacheConfig.vary.map(h => h.toLowerCase())
      : []
    const effectiveVary = [...new Set([...globalVary, ...routeVary])]

    const key = buildCacheKey(request, effectiveVary)
    const entry = lru.get(key)

    if (!entry) {
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    const ifNoneMatch = request.headers['if-none-match']

    if (entry.mustRevalidate) {
      if (ifNoneMatch && matchesETag(ifNoneMatch, entry.etag)) {
        hits++
        request[kCacheHit] = true
        reply.header('etag', entry.etag).header('x-cache', 'HIT')
        return reply.code(304).send()
      }
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    hits++
    request[kCacheHit] = true
    if (ifNoneMatch && matchesETag(ifNoneMatch, entry.etag)) {
      reply.header('etag', entry.etag).header('x-cache', 'HIT')
      return reply.code(304).send()
    }

    reply.code(entry.statusCode)
    for (const [name, value] of Object.entries(entry.headers)) {
      reply.header(name, value)
    }
    reply.header('x-cache', 'HIT')
    reply.header('etag', entry.etag)
    return reply.send(entry.body)
  }

  async function onSendHook (request, reply, payload) {
    const cacheConfig = request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return payload

    if (!methods.has(request.method)) return payload

    if (request[kCacheHit]) return payload

    if (request[kSkipStore]) return payload

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return payload

    const resCc = parseCacheControl(reply.getHeader('cache-control'))

    if (resCc.noStore || resCc.private) return payload

    let ttl
    if (resCc.sMaxAge !== null) {
      ttl = resCc.sMaxAge * 1000
    } else if (resCc.maxAge !== null) {
      ttl = resCc.maxAge * 1000
    } else if (resCc.noCache) {
      ttl = defaultTtl
    } else if (cacheConfig !== true && cacheConfig.ttl != null) {
      ttl = cacheConfig.ttl
    } else {
      ttl = defaultTtl
    }

    const routeVary = cacheConfig !== true && Array.isArray(cacheConfig.vary)
      ? cacheConfig.vary.map(h => h.toLowerCase())
      : []
    const effectiveVary = [...new Set([...globalVary, ...routeVary])]

    const key = buildCacheKey(request, effectiveVary)

    const etag = generateETag(payload)

    const storedHeaders = {}
    const contentType = reply.getHeader('content-type')
    if (contentType) storedHeaders['content-type'] = contentType

    lru.set(key, {
      body: payload,
      statusCode,
      headers: storedHeaders,
      etag,
      expiry: Date.now() + ttl,
      mustRevalidate: resCc.noCache || false
    })

    reply.header('etag', etag)
    reply.header('x-cache', 'MISS')

    return payload
  }

  fastify.addHook('onRequest', onRequestHook)
  fastify.addHook('onSend', onSendHook)
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
