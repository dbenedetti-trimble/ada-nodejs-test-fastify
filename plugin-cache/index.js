'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')

function deriveCacheKey (request, varyHeaders) {
  const method = request.method
  const url = request.url
  let varyPart = ''
  if (varyHeaders.length > 0) {
    varyPart = varyHeaders
      .map(h => h + ':' + (request.headers[h] || ''))
      .join('|')
  }
  return method + '|' + url + '|' + varyPart
}

function getRouteVaryHeaders (routeCacheConfig, globalVary) {
  if (!routeCacheConfig || routeCacheConfig === true || !routeCacheConfig.vary) {
    return globalVary
  }
  const routeVary = routeCacheConfig.vary.map(h => h.toLowerCase())
  const merged = [...new Set([...globalVary, ...routeVary])]
  return merged
}

function getRouteTtl (routeCacheConfig, defaultTtl) {
  if (routeCacheConfig && routeCacheConfig !== true && routeCacheConfig.ttl != null) {
    return routeCacheConfig.ttl
  }
  return defaultTtl
}

function matchesETag (ifNoneMatch, storedETag) {
  if (!ifNoneMatch) return false
  const trimmed = ifNoneMatch.trim()
  if (trimmed === '*') return true
  const tags = trimmed.split(',').map(t => t.trim())
  return tags.includes(storedETag)
}

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())
  const cache = new LRUCache(maxItems)

  fastify.decorate('cache', {
    purge (key) {
      return cache.purge(key)
    },
    purgeByPrefix (urlPrefix) {
      return cache.purgeByPrefix(urlPrefix)
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

  fastify.addHook('onRequest', function onCacheRequest (request, reply, done) {
    const routeCacheConfig = request.routeOptions.config
      ? request.routeOptions.config.cache
      : undefined

    if (!routeCacheConfig) {
      return done()
    }

    if (!methods.has(request.method)) {
      return done()
    }

    const reqCc = parseCacheControl(request.headers['cache-control'])

    if (reqCc.noStore) {
      request._cacheNoStore = true
      return done()
    }

    if (reqCc.noCache) {
      request._cacheBypass = true
      reply.header('x-cache', 'MISS')
      return done()
    }

    const varyHeaders = getRouteVaryHeaders(routeCacheConfig, globalVary)
    const key = deriveCacheKey(request, varyHeaders)

    const peeked = cache.peek(key)
    if (peeked && peeked.noCache) {
      cache.misses++
      reply.header('x-cache', 'MISS')
      return done()
    }

    const entry = cache.get(key)

    if (!entry) {
      reply.header('x-cache', 'MISS')
      return done()
    }

    request._cacheHit = true

    const ifNoneMatch = request.headers['if-none-match']
    if (matchesETag(ifNoneMatch, entry.etag)) {
      reply
        .code(304)
        .header('etag', entry.etag)
        .header('x-cache', 'HIT')
        .send('')
      return done()
    }

    reply.code(entry.statusCode)
    for (const [name, value] of Object.entries(entry.headers)) {
      reply.header(name, value)
    }
    reply
      .header('etag', entry.etag)
      .header('x-cache', 'HIT')
      .send(entry.body)
    return done()
  })

  fastify.addHook('onSend', function onCacheSend (request, reply, payload, done) {
    const routeCacheConfig = request.routeOptions.config
      ? request.routeOptions.config.cache
      : undefined

    if (!routeCacheConfig) {
      return done(null, payload)
    }

    if (!methods.has(request.method)) {
      return done(null, payload)
    }

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) {
      return done(null, payload)
    }

    if (request._cacheHit || request._cacheNoStore) {
      return done(null, payload)
    }

    const resCc = parseCacheControl(reply.getHeader('cache-control'))

    if (resCc.noStore || resCc.private) {
      return done(null, payload)
    }

    const varyHeaders = getRouteVaryHeaders(routeCacheConfig, globalVary)
    const key = deriveCacheKey(request, varyHeaders)

    let ttl = getRouteTtl(routeCacheConfig, defaultTtl)
    if (resCc.sMaxAge !== null) {
      ttl = resCc.sMaxAge
    } else if (resCc.maxAge !== null) {
      ttl = resCc.maxAge
    }

    const body = payload || ''
    const etag = generateETag(body)

    const entry = {
      statusCode,
      headers: {
        'content-type': reply.getHeader('content-type') || 'application/json; charset=utf-8'
      },
      body,
      etag,
      expiry: Date.now() + ttl,
      noCache: resCc.noCache
    }

    cache.set(key, entry)

    reply.header('etag', etag)
    if (!reply.getHeader('x-cache')) {
      reply.header('x-cache', 'MISS')
    }

    return done(null, payload)
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
