'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { generateETag } = require('./lib/etag')
const { parseRequestCacheControl, parseResponseCacheControl } = require('./lib/cache-control')

async function cachePlugin (fastify, opts) {
  const cache = new LRUCache(opts.maxItems ?? 1000)
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  function deriveCacheKey (request, routeVary = []) {
    const method = request.method
    const url = request.url
    const allVary = [...new Set([...globalVary, ...routeVary])]

    if (allVary.length === 0) {
      return `${method}|${url}|`
    }

    const varyParts = allVary.map(header => {
      const value = request.headers[header] || ''
      return `${header}:${value}`
    }).join(',')

    return `${method}|${url}|${varyParts}`
  }

  function purge (key) {
    return cache.delete(key)
  }

  function purgeByPrefix (prefix) {
    let removed = 0
    for (const [key] of cache.entries()) {
      const urlPart = key.split('|')[1]
      if (urlPart && urlPart.startsWith(prefix)) {
        cache.delete(key)
        removed++
      }
    }
    return removed
  }

  function clear () {
    cache.clear()
  }

  function stats () {
    return cache.stats()
  }

  function matchETag (ifNoneMatch, etag) {
    if (!ifNoneMatch || !etag) {
      return false
    }

    if (ifNoneMatch === '*') {
      return true
    }

    const clientETags = ifNoneMatch.split(',').map(tag => tag.trim())
    return clientETags.includes(etag)
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  fastify.addHook('onRequest', async function onRequestHook (request, reply) {
    const cacheConfig = request.routeOptions?.config?.cache
    if (!cacheConfig) {
      return
    }

    if (!methods.has(request.method)) {
      return
    }

    const requestCC = parseRequestCacheControl(request)
    const routeVary = Array.isArray(cacheConfig.vary) ? cacheConfig.vary.map(h => h.toLowerCase()) : []
    const cacheKey = deriveCacheKey(request, routeVary)

    if (requestCC.noCache || requestCC.noStore) {
      reply.header('x-cache', 'MISS')
      request._cacheKey = cacheKey
      request._cacheConfig = cacheConfig
      request._requestNoStore = requestCC.noStore
      return
    }

    const cached = cache.get(cacheKey)
    if (cached) {
      if (cached.mustRevalidate) {
        reply.header('x-cache', 'MISS')
        request._cacheKey = cacheKey
        request._cacheConfig = cacheConfig
        request._requestNoStore = false
        return
      }

      reply.header('x-cache', 'HIT')
      reply.header('content-type', cached.headers['content-type'] || 'application/json; charset=utf-8')
      if (cached.etag) {
        reply.header('etag', cached.etag)
      }

      const ifNoneMatch = request.headers['if-none-match']
      if (ifNoneMatch && cached.etag && matchETag(ifNoneMatch, cached.etag)) {
        reply.code(304)
        reply.send()
        return reply
      }

      reply.code(cached.statusCode)
      reply.send(cached.body)
      return reply
    }

    reply.header('x-cache', 'MISS')
    request._cacheKey = cacheKey
    request._cacheConfig = cacheConfig
  })

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    const cacheConfig = request._cacheConfig
    if (!cacheConfig) {
      return payload
    }

    if (!methods.has(request.method)) {
      return payload
    }

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) {
      return payload
    }

    const responseCC = parseResponseCacheControl(reply)

    if (request._requestNoStore) {
      return payload
    }

    if (responseCC.noStore || responseCC.private) {
      return payload
    }

    const etag = generateETag(payload)
    reply.header('etag', etag)

    const ttl = responseCC.ttlOverride !== null
      ? responseCC.ttlOverride
      : (typeof cacheConfig === 'object' && cacheConfig.ttl ? cacheConfig.ttl : defaultTtl)
    const expiry = Date.now() + ttl

    const entry = {
      body: payload,
      statusCode,
      headers: {
        'content-type': reply.getHeader('content-type') || 'application/json; charset=utf-8'
      },
      etag,
      expiry,
      mustRevalidate: responseCC.noCache
    }

    cache.set(request._cacheKey, entry)

    return payload
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
