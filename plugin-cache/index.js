'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { generateETag, parseIfNoneMatch, matchesETag } = require('./lib/etag')
const { shouldCache, getTTL, shouldBypassCache, shouldStoreAfterBypass } = require('./lib/cache-control')

async function cachePlugin (fastify, opts) {
  const cache = new LRUCache(opts.maxItems ?? 1000)
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  function getEffectiveVaryHeaders (routeConfig) {
    const routeVary = Array.isArray(routeConfig.vary) ? routeConfig.vary.map(h => h.toLowerCase()) : []
    return [...new Set([...globalVary, ...routeVary])]
  }

  function getCacheKey (request, varyHeaders) {
    const method = request.method
    const url = request.url
    const varyParts = [...varyHeaders].sort().map(header => {
      const value = request.headers[header] || ''
      return `${header}:${value}`
    }).join('|')
    return varyParts ? `${method}|${url}|${varyParts}` : `${method}|${url}|`
  }

  fastify.addHook('onRequest', async (request, reply) => {
    const routeConfig = request.routeOptions?.config?.cache
    if (!routeConfig) {
      return
    }

    if (!methods.has(request.method)) {
      return
    }

    const requestCacheControl = request.headers['cache-control']
    if (shouldBypassCache(requestCacheControl)) {
      request.cacheStatus = 'BYPASS'
      request.shouldStoreAfterBypass = shouldStoreAfterBypass(requestCacheControl)
      return
    }

    const varyHeaders = getEffectiveVaryHeaders(routeConfig)
    const cacheKey = getCacheKey(request, varyHeaders)

    const entry = cache.get(cacheKey)
    if (!entry) {
      request.cacheStatus = 'MISS'
      return
    }

    request.cacheStatus = 'HIT'
    reply.header('X-Cache', 'HIT')
    reply.header('ETag', entry.etag)

    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch) {
      const clientETags = parseIfNoneMatch(ifNoneMatch)
      if (matchesETag(entry.etag, clientETags)) {
        reply.code(304)
        reply.send()
        return
      }
    }

    if (entry.headers) {
      for (const [key, value] of Object.entries(entry.headers)) {
        reply.header(key, value)
      }
    }

    reply.code(entry.statusCode)
    reply.send(entry.body)
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    const routeConfig = request.routeOptions?.config?.cache
    if (!routeConfig) {
      return payload
    }

    if (!methods.has(request.method)) {
      return payload
    }

    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      return payload
    }

    if (request.cacheStatus === 'HIT') {
      return payload
    }

    const responseCacheControl = reply.getHeader('cache-control')

    if (request.cacheStatus === 'BYPASS' && !request.shouldStoreAfterBypass) {
      reply.header('X-Cache', 'BYPASS')
      return payload
    }

    if (!shouldCache(responseCacheControl)) {
      if (request.cacheStatus === 'BYPASS') {
        reply.header('X-Cache', 'BYPASS')
      }
      return payload
    }

    const varyHeaders = getEffectiveVaryHeaders(routeConfig)
    const cacheKey = getCacheKey(request, varyHeaders)

    const body = payload
    const etag = generateETag(body)

    const routeTtl = (typeof routeConfig === 'object' && routeConfig.ttl) ? routeConfig.ttl : defaultTtl
    const ttl = getTTL(responseCacheControl, routeTtl)
    const expiry = Date.now() + ttl

    const headers = {}
    if (reply.getHeader('content-type')) {
      headers['content-type'] = reply.getHeader('content-type')
    }

    cache.set(cacheKey, {
      body,
      statusCode: reply.statusCode,
      headers,
      etag,
      expiry
    })

    reply.header('ETag', etag)
    if (request.cacheStatus === 'BYPASS') {
      reply.header('X-Cache', 'BYPASS')
    } else {
      reply.header('X-Cache', 'MISS')
    }

    return payload
  })

  fastify.decorate('cache', {
    purge (key) {
      return cache.delete(key)
    },
    purgeByPrefix (prefix) {
      let count = 0
      for (const key of cache.keys()) {
        const parts = key.split('|')
        const url = parts[1]
        if (url && url.startsWith(prefix)) {
          cache.delete(key)
          count++
        }
      }
      return count
    },
    clear () {
      cache.clear()
    },
    stats () {
      return cache.stats()
    }
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
