'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const cache = new LRUCache(maxItems)

  function getRouteVaryHeaders (cacheConfig) {
    const routeVary = (cacheConfig.vary ?? []).map(h => h.toLowerCase())
    const combined = new Set([...globalVary, ...routeVary])
    return Array.from(combined)
  }

  function buildCacheKey (request, varyHeaders) {
    const method = request.method.toUpperCase()
    const url = request.url
    let varyPart = ''
    if (varyHeaders.length > 0) {
      varyPart = varyHeaders.map(h => {
        const val = request.headers[h] || ''
        return h + ':' + val
      }).join('|')
    }
    return method + '|' + url + '|' + varyPart
  }

  async function onRequestHook (request, reply) {
    const config = request.routeOptions.config
    if (!config || !config.cache) return

    const cacheConfig = config.cache === true ? {} : config.cache

    if (!methods.has(request.method.toUpperCase())) return

    // Parse request Cache-Control directives
    const reqCC = parseCacheControl(request.headers['cache-control'])

    const varyHeaders = getRouteVaryHeaders(cacheConfig)
    const key = buildCacheKey(request, varyHeaders)

    request._cacheKey = key
    request._cacheConfig = cacheConfig

    if (reqCC['no-store']) {
      // Bypass cache and do not store the response
      request._cacheSkipStore = true
      reply.header('X-Cache', 'MISS')
      return
    }

    if (reqCC['no-cache']) {
      // Bypass cache lookup but still store the fresh response
      reply.header('X-Cache', 'MISS')
      return
    }

    const entry = cache.get(key)

    if (!entry) {
      reply.header('X-Cache', 'MISS')
      return
    }

    // Cache hit — check for conditional request
    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch) {
      const etags = ifNoneMatch.split(',').map(e => e.trim())
      if (etags.includes('*') || etags.includes(entry.etag)) {
        request._cacheHit = true
        reply
          .code(304)
          .header('X-Cache', 'HIT')
          .header('ETag', entry.etag)
          .send('')
        return reply
      }
    }

    request._cacheHit = true
    reply.header('X-Cache', 'HIT')
    reply.code(entry.statusCode)

    for (const [name, value] of Object.entries(entry.headers)) {
      reply.header(name, value)
    }

    reply.header('ETag', entry.etag)
    reply.send(entry.body)
    return reply
  }

  async function onSendHook (request, reply, payload) {
    const config = request.routeOptions.config
    if (!config || !config.cache) return payload

    // Response already served from cache — nothing to store
    if (request._cacheHit) return payload

    if (!methods.has(request.method.toUpperCase())) return payload

    if (request._cacheSkipStore) return payload

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return payload

    // Parse response Cache-Control
    const resCC = parseCacheControl(reply.getHeader('cache-control'))
    if (resCC['no-store'] || resCC['private']) return payload

    const cacheConfig = request._cacheConfig || (config.cache === true ? {} : config.cache)

    // Determine effective TTL
    let ttl = cacheConfig.ttl ?? defaultTtl
    if (resCC['s-maxage']) {
      ttl = parseInt(resCC['s-maxage'], 10) * 1000
    } else if (resCC['max-age']) {
      ttl = parseInt(resCC['max-age'], 10) * 1000
    }
    // no-cache on response: cache with immediate expiry (always revalidates)
    if (resCC['no-cache'] === true) {
      ttl = 0
    }

    const etag = generateETag(payload)
    reply.header('ETag', etag)

    // Build key if not already set (e.g. method not in methods — but we already checked)
    let key = request._cacheKey
    if (!key) {
      const varyHeaders = getRouteVaryHeaders(cacheConfig)
      key = buildCacheKey(request, varyHeaders)
    }

    // Preserve minimal headers for cache replay
    const headers = {}
    const contentType = reply.getHeader('content-type')
    if (contentType) headers['content-type'] = contentType

    cache.set(key, {
      body: payload,
      statusCode,
      headers,
      etag,
      expiry: Date.now() + ttl
    })

    return payload
  }

  fastify.addHook('onRequest', onRequestHook)
  fastify.addHook('onSend', onSendHook)

  fastify.decorate('cache', {
    purge (key) {
      return cache.delete(key)
    },

    purgeByPrefix (prefix) {
      const toDelete = []
      for (const key of cache.keys()) {
        // Key format: METHOD|/url|vary-part
        const parts = key.split('|')
        const urlPart = parts[1] || ''
        if (urlPart.startsWith(prefix)) {
          toDelete.push(key)
        }
      }
      for (const key of toDelete) {
        cache.delete(key)
      }
      return toDelete.length
    },

    clear () {
      cache.clear()
    },

    stats () {
      return {
        items: cache.size,
        maxItems,
        hits: cache.hits,
        misses: cache.misses
      }
    }
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
