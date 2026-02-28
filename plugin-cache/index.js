'use strict'

const fp = require('fastify-plugin')
const { Readable } = require('node:stream')
const LRUCache = require('./lib/lru-cache')
const { parse: parseCacheControl } = require('./lib/cache-control')
const { generateETag } = require('./lib/etag')

/**
 * Derive a cache key from request method, URL, and Vary headers.
 * Format: "METHOD|url-with-querystring|header-name:value|..."
 * @param {string} method
 * @param {string} url
 * @param {string[]} varyHeaders - lowercased header names
 * @param {object} requestHeaders
 * @returns {string}
 */
function buildCacheKey (method, url, varyHeaders, requestHeaders) {
  const varyPart = varyHeaders
    .map(h => h + ':' + (requestHeaders[h] || ''))
    .join('|')
  return method + '|' + url + '|' + varyPart
}

/**
 * Check whether the given ETag satisfies an If-None-Match header value.
 * Supports wildcard (*) and comma-separated lists.
 * @param {string} ifNoneMatch
 * @param {string} etag
 * @returns {boolean}
 */
function matchesETag (ifNoneMatch, etag) {
  if (ifNoneMatch === '*') return true
  return ifNoneMatch.split(',').map(e => e.trim()).includes(etag)
}

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const lru = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  // WeakSet to mark responses already served from cache (skip re-processing in onSend)
  const cacheHits = new WeakSet()

  // --- Cache decorator API ---

  function purge (key) {
    return lru.delete(key)
  }

  function purgeByPrefix (urlPrefix) {
    let count = 0
    for (const key of [...lru.keys()]) {
      const urlSegment = key.split('|')[1]
      if (urlSegment.startsWith(urlPrefix)) {
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

  // --- onRequest hook: serve cache hits ---

  fastify.addHook('onRequest', async function onRequestHook (request, reply) {
    const routeConfig = request.routeOptions.config.cache
    if (!routeConfig) return

    if (!methods.has(request.method.toUpperCase())) return

    const reqCC = parseCacheControl(request.headers['cache-control'])

    // no-store: bypass cache lookup entirely; onSend will also skip storage
    if (reqCC.noStore) return

    const routeVary = typeof routeConfig === 'object' && routeConfig.vary
      ? routeConfig.vary.map(h => h.toLowerCase())
      : []
    const varyHeaders = [...new Set([...globalVary, ...routeVary])]
    const key = buildCacheKey(request.method.toUpperCase(), request.url, varyHeaders, request.headers)

    // no-cache: bypass cache lookup but allow onSend to store the fresh response
    if (reqCC.noCache) {
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    const entry = lru.get(key)
    if (!entry || Date.now() > entry.expiry) {
      if (entry) lru.delete(key)
      misses++
      reply.header('x-cache', 'MISS')
      return
    }

    // Cache HIT
    hits++
    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch && entry.etag && matchesETag(ifNoneMatch, entry.etag)) {
      cacheHits.add(request)
      reply.code(304).header('x-cache', 'HIT').header('etag', entry.etag).send('')
      return reply
    }

    cacheHits.add(request)
    reply.code(entry.statusCode)
    for (const [k, v] of Object.entries(entry.headers)) {
      reply.header(k, v)
    }
    reply.header('x-cache', 'HIT').header('etag', entry.etag)
    reply.send(entry.body)
    return reply
  })

  // --- onSend hook: store responses ---

  fastify.addHook('onSend', async function onSendHook (request, reply, payload) {
    // Skip re-processing for responses already served from cache
    if (cacheHits.has(request)) {
      cacheHits.delete(request)
      return payload
    }

    const routeConfig = request.routeOptions.config.cache
    if (!routeConfig) return payload

    // Skip streams and null payloads
    if (payload instanceof Readable || payload === null) return payload

    if (!methods.has(request.method.toUpperCase())) return payload

    // Only cache 2xx responses
    const statusCode = reply.statusCode
    if (statusCode < 200 || statusCode >= 300) return payload

    // Honour request no-store: don't cache the response
    const reqCC = parseCacheControl(request.headers['cache-control'])
    if (reqCC.noStore) return payload

    // Honour response Cache-Control directives
    const rawCCHeader = reply.getHeader('cache-control')
    const resCCHeader = Array.isArray(rawCCHeader) ? rawCCHeader[0] : rawCCHeader
    const resCC = parseCacheControl(resCCHeader)
    if (resCC.noStore || resCC.isPrivate) return payload

    // Compute effective TTL (s-maxage > max-age > route ttl)
    const routeTtl = typeof routeConfig === 'object' && routeConfig.ttl != null
      ? routeConfig.ttl
      : defaultTtl

    let effectiveTtl
    if (resCC.sMaxAge !== null) {
      effectiveTtl = resCC.sMaxAge * 1000
    } else if (resCC.maxAge !== null) {
      effectiveTtl = resCC.maxAge * 1000
    } else {
      effectiveTtl = routeTtl
    }

    // no-cache response: store for ETag revalidation but mark as immediately expired
    if (resCC.noCache) effectiveTtl = 0

    const routeVary = typeof routeConfig === 'object' && routeConfig.vary
      ? routeConfig.vary.map(h => h.toLowerCase())
      : []
    const varyHeaders = [...new Set([...globalVary, ...routeVary])]
    const key = buildCacheKey(request.method.toUpperCase(), request.url, varyHeaders, request.headers)

    const etag = generateETag(payload)

    // Collect headers to store (exclude x-cache which is transient)
    const headers = {}
    for (const [k, v] of Object.entries(reply.getHeaders())) {
      if (k !== 'x-cache') headers[k] = v
    }

    lru.set(key, { body: payload, statusCode, headers, etag, expiry: Date.now() + effectiveTtl })

    reply.header('etag', etag)
    return payload
  })
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
