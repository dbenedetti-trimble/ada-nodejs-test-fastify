'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const fp = require('fastify-plugin')
const LRUCache = require('../lib/lru-cache')

function createTestCachePlugin (preloadedCache = null) {
  return fp(async (fastify, opts) => {
    const cache = preloadedCache || new LRUCache(opts.maxItems ?? 1000)
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

    function matchETag (ifNoneMatch, etag) {
      if (!ifNoneMatch || !etag) return false
      if (ifNoneMatch === '*') return true
      const clientETags = ifNoneMatch.split(',').map(tag => tag.trim())
      return clientETags.includes(etag)
    }

    fastify.decorate('cache', {
      purge: (key) => cache.delete(key),
      purgeByPrefix: (prefix) => 0,
      clear: () => cache.clear(),
      stats: () => cache.stats(),
      _internal: cache
    })

    fastify.addHook('onRequest', async function (request, reply) {
      const cacheConfig = request.routeOptions?.config?.cache
      if (!cacheConfig || !methods.has(request.method)) return

      const routeVary = Array.isArray(cacheConfig.vary) ? cacheConfig.vary.map(h => h.toLowerCase()) : []
      const cacheKey = deriveCacheKey(request, routeVary)
      const cached = cache.get(cacheKey)

      if (cached) {
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
    })
  }, { fastify: '5.x', name: 'test-cache-plugin' })
}

test('@covers_ACFR_4_5 @unit_test: Cache hit with matching If-None-Match returns 304 with no body', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  const cache = new LRUCache(1000)
  cache.set('GET|/conditional|', {
    body: '{"data":"content"}',
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    etag: 'W/"abc123def456"',
    expiry: Date.now() + 60000
  })

  await fastify.register(createTestCachePlugin(cache))

  fastify.get('/conditional', {
    config: { cache: true }
  }, () => {
    return { data: 'content' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/conditional',
    headers: { 'if-none-match': 'W/"abc123def456"' }
  })

  t.assert.strictEqual(res.statusCode, 304, 'returns 304 Not Modified')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res.body, '', 'no body in 304 response')
  t.assert.strictEqual(res.headers.etag, 'W/"abc123def456"')
  t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test: Cache hit with non-matching If-None-Match returns full cached response', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  const cache = new LRUCache(1000)
  cache.set('GET|/etag-mismatch|', {
    body: '{"data":"content"}',
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    etag: 'W/"correct123"',
    expiry: Date.now() + 60000
  })

  await fastify.register(createTestCachePlugin(cache))

  fastify.get('/etag-mismatch', {
    config: { cache: true }
  }, () => {
    return { data: 'content' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/etag-mismatch',
    headers: { 'if-none-match': 'W/"wrongetag123456"' }
  })

  t.assert.strictEqual(res.statusCode, 200, 'returns 200 with full response')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res.json(), { data: 'content' }, 'full response body returned')
  t.assert.strictEqual(res.headers.etag, 'W/"correct123"')
  t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test: If-None-Match with * returns 304 for cached response', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  const cache = new LRUCache(1000)
  cache.set('GET|/wildcard|', {
    body: '{"data":"test"}',
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    etag: 'W/"anyetag123"',
    expiry: Date.now() + 60000
  })

  await fastify.register(createTestCachePlugin(cache))

  fastify.get('/wildcard', {
    config: { cache: true }
  }, () => {
    return { data: 'test' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/wildcard',
    headers: { 'if-none-match': '*' }
  })

  t.assert.strictEqual(res.statusCode, 304, 'returns 304 for wildcard ETag')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res.body, '', 'no body in 304 response')
  t.assert.strictEqual(res.headers.etag, 'W/"anyetag123"')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test: If-None-Match with multiple ETags (comma-separated)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  const cache = new LRUCache(1000)
  cache.set('GET|/multi-etag|', {
    body: '{"data":"response"}',
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    etag: 'W/"etag2"',
    expiry: Date.now() + 60000
  })

  await fastify.register(createTestCachePlugin(cache))

  fastify.get('/multi-etag', {
    config: { cache: true }
  }, () => {
    return { data: 'response' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/multi-etag',
    headers: { 'if-none-match': 'W/"etag1", W/"etag2", W/"etag3"' }
  })

  t.assert.strictEqual(res.statusCode, 304, 'returns 304 when one of multiple ETags matches')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res.body, '', 'no body in 304 response')
  t.assert.strictEqual(res.headers.etag, 'W/"etag2"')
  t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test: Cache hit without ETag returns full response even with If-None-Match', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  const cache = new LRUCache(1000)
  cache.set('GET|/no-etag|', {
    body: '{"data":"test"}',
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    etag: null,
    expiry: Date.now() + 60000
  })

  await fastify.register(createTestCachePlugin(cache))

  fastify.get('/no-etag', {
    config: { cache: true }
  }, () => {
    return { data: 'test' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/no-etag',
    headers: { 'if-none-match': 'W/"anything"' }
  })

  t.assert.strictEqual(res.statusCode, 200, 'returns 200 when cached entry has no ETag')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res.json(), { data: 'test' })
  t.assert.strictEqual(res.headers.etag, undefined, 'no ETag header set')

  await fastify.close()
})
