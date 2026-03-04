'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const { parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  if (typeof maxItems !== 'number' || maxItems < 1 || !Number.isInteger(maxItems)) {
    throw new TypeError('maxItems must be a positive integer')
  }

  const defaultTtl = opts.ttl ?? 60000
  if (typeof defaultTtl !== 'number' || defaultTtl < 0) {
    throw new TypeError('ttl must be a non-negative number')
  }

  const methodsOpt = opts.methods ?? ['GET']
  if (!Array.isArray(methodsOpt) || methodsOpt.some(m => typeof m !== 'string')) {
    throw new TypeError('methods must be an array of strings')
  }
  const methods = new Set(methodsOpt.map(m => m.toUpperCase()))

  const varyOpt = opts.vary ?? []
  if (!Array.isArray(varyOpt) || varyOpt.some(h => typeof h !== 'string')) {
    throw new TypeError('vary must be an array of strings')
  }
  const globalVary = varyOpt.map(h => h.toLowerCase())

  const cache = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  fastify.decorate('cache', {
    purge (key) {
      if (typeof key !== 'string') {
        throw new TypeError('purge key must be a string')
      }
      return cache.delete(key)
    },
    purgeByPrefix (urlPrefix) {
      if (typeof urlPrefix !== 'string') {
        throw new TypeError('purgeByPrefix urlPrefix must be a string')
      }
      let count = 0
      for (const key of Array.from(cache.keys())) {
        const urlPart = key.split('|')[1]
        if (urlPart && urlPart.startsWith(urlPrefix)) {
          cache.delete(key)
          count++
        }
      }
      return count
    },
    clear () {
      cache.clear()
      hits = 0
      misses = 0
    },
    stats () {
      return { items: cache.size, maxItems, hits, misses }
    }
  })

  fastify.addHook('onRequest', async function onRequestHook (request, reply) {
    const routeConfig = request.routeOptions.config
    if (!routeConfig || !routeConfig.cache) return

    if (!methods.has(request.method)) return

    const reqCc = parseCacheControl(request.headers['cache-control'])
    if (reqCc['no-store']) {
      request._cacheBypass = true
      request._cacheNoStore = true
      return
    }
    if (reqCc['no-cache']) {
      request._cacheBypass = true
      return
    }

    const key = buildCacheKey(request, routeConfig.cache, globalVary)
    request._cacheKey = key

    const entry = cache.get(key)
    if (!entry || entry.noCache) {
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    hits++

    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch) {
      if (etagMatches(ifNoneMatch, entry.etag)) {
        reply
          .code(304)
          .header('etag', entry.etag)
          .header('x-cache', 'HIT')
          .send('')
        return reply
      }
    }

    reply
      .code(entry.statusCode)
      .header('content-type', entry.headers['content-type'])
      .header('etag', entry.etag)
      .header('x-cache', 'HIT')
      .send(entry.body)
    return reply
  })

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    const routeConfig = request.routeOptions.config
    if (!routeConfig || !routeConfig.cache) return payload
    if (!methods.has(request.method)) return payload
    if (request._cacheNoStore) return payload

    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return payload

    const resCc = parseCacheControl(reply.getHeader('cache-control'))
    if (resCc['no-store'] || resCc.private) return payload

    const body = payload
    const etag = generateETag(body)
    reply.header('etag', etag)

    if (!reply.hasHeader('x-cache')) {
      reply.header('x-cache', 'MISS')
      misses++
    }

    let ttl = getRouteTtl(routeConfig.cache, defaultTtl)
    if (resCc['s-maxage'] !== undefined) {
      ttl = parseInt(resCc['s-maxage'], 10) * 1000
    } else if (resCc['max-age'] !== undefined) {
      ttl = parseInt(resCc['max-age'], 10) * 1000
    }

    const noCache = resCc['no-cache'] === true

    const key = request._cacheKey || buildCacheKey(request, routeConfig.cache, globalVary)
    cache.set(key, {
      body,
      statusCode,
      headers: { 'content-type': reply.getHeader('content-type') },
      etag,
      expiry: noCache ? 0 : Date.now() + ttl,
      noCache
    })

    return payload
  })
}

function buildCacheKey (request, routeCache, globalVary) {
  const routeVary = (routeCache !== true && routeCache.vary)
    ? routeCache.vary.map(h => h.toLowerCase())
    : []
  const allVary = [...new Set([...globalVary, ...routeVary])]
  const varyParts = allVary
    .sort()
    .map(h => h + ':' + (request.headers[h] || ''))
    .join(',')
  return request.method + '|' + request.url + '|' + varyParts
}

function getRouteTtl (routeCache, defaultTtl) {
  if (routeCache === true) return defaultTtl
  return routeCache.ttl ?? defaultTtl
}

function etagMatches (ifNoneMatch, storedEtag) {
  if (ifNoneMatch === '*') return true
  const tags = ifNoneMatch.split(',').map(t => t.trim())
  return tags.includes(storedEtag)
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
