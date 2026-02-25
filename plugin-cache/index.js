'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl, computeTtl } = require('./lib/cache-control')
const { generateETag, etagMatches } = require('./lib/etag')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const cache = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function deriveCacheKey (request, routeVary) {
    const merged = [...new Set([...globalVary, ...routeVary])]
    let varyPart = ''
    if (merged.length > 0) {
      const parts = merged
        .sort()
        .map(h => h + ':' + (request.headers[h] || ''))
      varyPart = parts.join(',')
    }
    return request.method + '|' + request.url + '|' + varyPart
  }

  function getRouteCache (request) {
    const config = request.routeOptions?.config?.cache
    if (!config) return null
    if (config === true) return { ttl: defaultTtl, vary: [] }
    return {
      ttl: config.ttl ?? defaultTtl,
      vary: (config.vary ?? []).map(h => h.toLowerCase())
    }
  }

  function purge (key) {
    return cache.delete(key)
  }

  function purgeByPrefix (prefix) {
    const keysToDelete = []
    for (const key of cache.keys()) {
      const pipeIdx = key.indexOf('|')
      if (pipeIdx !== -1) {
        const urlPart = key.slice(pipeIdx + 1)
        const secondPipe = urlPart.indexOf('|')
        const url = secondPipe !== -1 ? urlPart.slice(0, secondPipe) : urlPart
        if (url.startsWith(prefix)) {
          keysToDelete.push(key)
        }
      }
    }
    for (const key of keysToDelete) {
      cache.delete(key)
    }
    return keysToDelete.length
  }

  function clear () {
    cache.clear()
    hits = 0
    misses = 0
  }

  function stats () {
    return { items: cache.size, maxItems, hits, misses }
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  fastify.addHook('onRequest', function onCacheRequest (request, reply, done) {
    const routeCache = getRouteCache(request)
    if (!routeCache) return done()
    if (!methods.has(request.method)) return done()

    const reqCc = parseCacheControl(request.headers['cache-control'])
    if (reqCc['no-store']) {
      request._cacheBypassNoStore = true
      reply.header('X-Cache', 'MISS')
      misses++
      return done()
    }

    const key = deriveCacheKey(request, routeCache.vary)
    request._cacheKey = key
    request._routeCache = routeCache

    if (reqCc['no-cache']) {
      request._cacheBypass = true
      reply.header('X-Cache', 'MISS')
      misses++
      return done()
    }

    const entry = cache.get(key)
    if (!entry) {
      reply.header('X-Cache', 'MISS')
      misses++
      return done()
    }

    hits++
    request._cacheHit = true
    const ifNoneMatch = request.headers['if-none-match']
    if (etagMatches(ifNoneMatch, entry.etag)) {
      reply
        .code(304)
        .header('ETag', entry.etag)
        .header('X-Cache', 'HIT')
        .send('')
      return
    }

    for (const [name, value] of Object.entries(entry.headers)) {
      reply.header(name, value)
    }
    reply
      .code(entry.statusCode)
      .header('ETag', entry.etag)
      .header('X-Cache', 'HIT')
      .send(entry.body)
  })

  fastify.addHook('onSend', function onCacheStore (request, reply, payload, done) {
    if (request._cacheHit) return done(null, payload)
    const routeCache = request._routeCache ?? getRouteCache(request)
    if (!routeCache) return done(null, payload)
    if (!methods.has(request.method)) return done(null, payload)
    if (request._cacheBypassNoStore) return done(null, payload)

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return done(null, payload)

    const resCc = parseCacheControl(reply.getHeader('cache-control'))
    if (resCc['no-store'] || resCc.private) return done(null, payload)

    const ttl = computeTtl(resCc, routeCache.ttl)
    if (ttl === -1) return done(null, payload)

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const etag = generateETag(body)

    const key = request._cacheKey ?? deriveCacheKey(request, routeCache.vary)
    const expiry = ttl === 0 ? 0 : Date.now() + ttl

    cache.set(key, {
      statusCode,
      headers: {
        'content-type': reply.getHeader('content-type') || 'application/json; charset=utf-8'
      },
      body,
      etag,
      expiry
    })

    reply.header('ETag', etag)
    return done(null, payload)
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
