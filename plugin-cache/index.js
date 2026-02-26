'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseRequestCC, parseResponseCC } = require('./lib/cache-control')
const { generateETag, matchesETag } = require('./lib/etag')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const lru = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function buildCacheKey (method, url, varyHeaders, request) {
    const varyPart = varyHeaders
      .map(h => h + ':' + (request.headers[h] || ''))
      .join('|')
    return method + '|' + url + '|' + varyPart
  }

  function purge (key) {
    return lru.delete(key)
  }

  function purgeByPrefix (prefix) {
    for (const key of lru.keys()) {
      const urlPart = key.split('|')[1]
      if (urlPart && urlPart.startsWith(prefix)) {
        lru.delete(key)
      }
    }
  }

  function clear () {
    for (const key of [...lru.keys()]) {
      lru.delete(key)
    }
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

  fastify.addHook('onRequest', function (request, reply, done) {
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return done()

    const method = request.method.toUpperCase()
    if (!methods.has(method)) return done()

    const reqCC = parseRequestCC(request.headers['cache-control'])
    if (reqCC.noStore) return done()

    const routeVary = cacheConfig !== true && Array.isArray(cacheConfig.vary)
      ? cacheConfig.vary.map(h => h.toLowerCase())
      : []
    const effectiveVary = [...new Set([...globalVary, ...routeVary])]
    const key = buildCacheKey(method, request.url, effectiveVary, request)

    if (reqCC.noCache) {
      misses++
      reply.header('x-cache', 'MISS')
      return done()
    }

    const entry = lru.get(key)
    if (!entry) {
      misses++
      reply.header('x-cache', 'MISS')
      return done()
    }

    hits++
    reply.header('x-cache', 'HIT')
    reply.header('etag', entry.etag)

    if (matchesETag(request.headers['if-none-match'], entry.etag)) {
      reply.code(304).send('')
      return reply
    }

    reply.code(entry.statusCode)
    if (entry.headers['content-type']) {
      reply.header('content-type', entry.headers['content-type'])
    }
    reply.send(entry.body)
    return reply
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    const cacheConfig = request.routeOptions && request.routeOptions.config && request.routeOptions.config.cache
    if (!cacheConfig) return done(null, payload)

    const method = request.method.toUpperCase()
    if (!methods.has(method)) return done(null, payload)

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return done(null, payload)

    const respCC = parseResponseCC(reply.getHeader('cache-control'))
    if (respCC.noStore || respCC.private) return done(null, payload)

    const routeVary = cacheConfig !== true && Array.isArray(cacheConfig.vary)
      ? cacheConfig.vary.map(h => h.toLowerCase())
      : []
    const effectiveVary = [...new Set([...globalVary, ...routeVary])]
    const key = buildCacheKey(method, request.url, effectiveVary, request)

    let ttl = cacheConfig !== true && typeof cacheConfig.ttl === 'number'
      ? cacheConfig.ttl
      : defaultTtl

    if (respCC.sMaxAge !== undefined) {
      ttl = respCC.sMaxAge * 1000
    } else if (respCC.maxAge !== undefined) {
      ttl = respCC.maxAge * 1000
    }

    if (respCC.noCache) {
      ttl = 0
    }

    const etag = generateETag(payload)
    reply.header('etag', etag)

    const contentType = reply.getHeader('content-type')
    lru.set(key, {
      body: payload,
      statusCode,
      headers: {
        'content-type': contentType || ''
      },
      etag,
      expiry: Date.now() + ttl
    })

    return done(null, payload)
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
