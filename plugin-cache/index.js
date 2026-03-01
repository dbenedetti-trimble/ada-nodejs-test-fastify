'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')
const { Readable } = require('node:stream')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const cache = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function buildCacheKey (method, url, varyHeaders, request) {
    const varyParts = varyHeaders.map(h => h + ':' + (request.headers[h] || ''))
    return method + '|' + url + '|' + varyParts.join(',')
  }

  function getRouteVaryHeaders (routeCache) {
    if (!routeCache || routeCache === true) return globalVary
    const routeVary = (routeCache.vary || []).map(h => h.toLowerCase())
    return [...new Set([...globalVary, ...routeVary])]
  }

  function getRouteTtl (routeCache) {
    if (!routeCache || routeCache === true) return defaultTtl
    return routeCache.ttl ?? defaultTtl
  }

  async function onRequestHook (request, reply) {
    const routeCache = request.routeOptions.config && request.routeOptions.config.cache
    if (!routeCache) return

    if (!methods.has(request.method)) return

    const reqCacheControl = parseCacheControl(request.headers['cache-control'])
    if (reqCacheControl.noStore) return

    const varyHeaders = getRouteVaryHeaders(routeCache)
    const key = buildCacheKey(request.method, request.url, varyHeaders, request)

    if (reqCacheControl.noCache) {
      request.cacheKey = key
      request.cacheEnabled = true
      request.cacheNoStore = false
      return
    }

    const entry = cache.get(key)

    if (!entry) {
      misses++
      request.cacheKey = key
      request.cacheEnabled = true
      request.cacheNoStore = false
      return
    }

    if (Date.now() > entry.expiry) {
      cache.delete(key)
      misses++
      request.cacheKey = key
      request.cacheEnabled = true
      request.cacheNoStore = false
      return
    }

    hits++

    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch) {
      const etags = ifNoneMatch.split(',').map(e => e.trim())
      if (etags.includes('*') || etags.includes(entry.etag)) {
        reply.code(304)
        reply.header('etag', entry.etag)
        reply.header('x-cache', 'HIT')
        return reply.send('')
      }
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
    if (!request.cacheEnabled) return payload

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return payload

    if (request.cacheNoStore) return payload

    if (payload instanceof Readable) return payload

    const resCacheControl = parseCacheControl(reply.getHeader('cache-control'))
    if (resCacheControl.noStore || resCacheControl.private) return payload

    const routeCache = request.routeOptions.config && request.routeOptions.config.cache
    let ttl = getRouteTtl(routeCache)

    if (resCacheControl.noCache) {
      ttl = 0
    } else if (resCacheControl.sMaxage !== null) {
      ttl = resCacheControl.sMaxage * 1000
    } else if (resCacheControl.maxAge !== null) {
      ttl = resCacheControl.maxAge * 1000
    }

    const body = payload == null ? '' : payload
    const etag = generateETag(body)

    const headers = {}
    const contentType = reply.getHeader('content-type')
    if (contentType) headers['content-type'] = contentType

    cache.set(request.cacheKey, {
      body,
      statusCode,
      headers,
      etag,
      expiry: Date.now() + ttl
    })

    reply.header('etag', etag)
    reply.header('x-cache', 'MISS')

    return payload
  }

  fastify.addHook('onRequest', onRequestHook)
  fastify.addHook('onSend', onSendHook)

  function purge (key) {
    return cache.delete(key)
  }

  function purgeByPrefix (urlPrefix) {
    let count = 0
    for (const key of cache.keys()) {
      const parts = key.split('|')
      const url = parts[1] || ''
      if (url.startsWith(urlPrefix)) {
        cache.delete(key)
        count++
      }
    }
    return count
  }

  function clear () {
    cache.clear()
    hits = 0
    misses = 0
  }

  function stats () {
    return {
      items: cache.size,
      maxItems,
      hits,
      misses
    }
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
