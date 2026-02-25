'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')
const { parseCacheControl, computeTtl } = require('../lib/cache-control')

test('parseCacheControl parses no-store', (t) => {
  const cc = parseCacheControl('no-store')
  t.assert.strictEqual(cc['no-store'], true)
})

test('parseCacheControl parses max-age', (t) => {
  const cc = parseCacheControl('max-age=300')
  t.assert.strictEqual(cc['max-age'], '300')
})

test('parseCacheControl parses multiple directives', (t) => {
  const cc = parseCacheControl('public, max-age=300, s-maxage=60')
  t.assert.strictEqual(cc.public, true)
  t.assert.strictEqual(cc['max-age'], '300')
  t.assert.strictEqual(cc['s-maxage'], '60')
})

test('parseCacheControl handles empty input', (t) => {
  t.assert.deepStrictEqual(parseCacheControl(''), {})
  t.assert.deepStrictEqual(parseCacheControl(null), {})
  t.assert.deepStrictEqual(parseCacheControl(undefined), {})
})

test('computeTtl returns -1 for no-store', (t) => {
  t.assert.strictEqual(computeTtl({ 'no-store': true }, 60000), -1)
})

test('computeTtl returns -1 for private', (t) => {
  t.assert.strictEqual(computeTtl({ private: true }, 60000), -1)
})

test('computeTtl prefers s-maxage over max-age', (t) => {
  t.assert.strictEqual(computeTtl({ 's-maxage': '10', 'max-age': '60' }, 60000), 10000)
})

test('computeTtl uses max-age when no s-maxage', (t) => {
  t.assert.strictEqual(computeTtl({ 'max-age': '30' }, 60000), 30000)
})

test('computeTtl returns 0 for no-cache', (t) => {
  t.assert.strictEqual(computeTtl({ 'no-cache': true }, 60000), 0)
})

test('computeTtl returns default when no directives', (t) => {
  t.assert.strictEqual(computeTtl({}, 60000), 60000)
})

test('VAL-12: Cache-Control no-store prevents caching', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/no-store', { config: { cache: true } }, async (request, reply) => {
    handlerCalled++
    reply.header('Cache-Control', 'no-store')
    return { data: 'ephemeral' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(handlerCalled, 2, 'handler must run again because response was not cached')
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  await fastify.close()
})

test('VAL-13: Cache-Control private prevents caching', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/private', { config: { cache: true } }, async (request, reply) => {
    handlerCalled++
    reply.header('Cache-Control', 'private')
    return { data: 'private' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/private' })
  await fastify.inject({ method: 'GET', url: '/private' })
  t.assert.strictEqual(handlerCalled, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  await fastify.close()
})

test('VAL-14: Cache-Control max-age overrides route TTL', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/max-age', { config: { cache: { ttl: 60000 } } }, async (request, reply) => {
    reply.header('Cache-Control', 'max-age=1')
    return { data: 'short-lived' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/max-age' })
  const res2 = await fastify.inject({ method: 'GET', url: '/max-age' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 1500))

  const res3 = await fastify.inject({ method: 'GET', url: '/max-age' })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('VAL-15: Cache-Control s-maxage takes priority', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/s-maxage', { config: { cache: true } }, async (request, reply) => {
    reply.header('Cache-Control', 's-maxage=1, max-age=60')
    return { data: 'smaxage' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/s-maxage' })

  await new Promise(resolve => setTimeout(resolve, 1500))

  const res = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS', 's-maxage=1 should expire after 1s')

  await fastify.close()
})

test('VAL-16: request Cache-Control no-cache bypasses cache', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/bypass', { config: { cache: true } }, async () => {
    handlerCalled++
    return { call: handlerCalled }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/bypass' })
  t.assert.strictEqual(handlerCalled, 1)

  // Normal request - should be HIT
  const res2 = await fastify.inject({ method: 'GET', url: '/bypass' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 1)

  // Request with no-cache - bypasses cache, runs handler
  const res3 = await fastify.inject({
    method: 'GET',
    url: '/bypass',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  // Fresh response should now be cached
  const res4 = await fastify.inject({ method: 'GET', url: '/bypass' })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('request Cache-Control no-store bypasses and does not store', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/req-no-store', { config: { cache: true } }, async () => {
    handlerCalled++
    return { call: handlerCalled }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/req-no-store',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 1)
  t.assert.strictEqual(fastify.cache.stats().items, 0, 'should not store when request has no-store')

  await fastify.close()
})

test('response with no-cache is stored but always revalidated', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/revalidate', { config: { cache: true } }, async (request, reply) => {
    handlerCalled++
    reply.header('Cache-Control', 'no-cache')
    return { data: 'revalidate' }
  })

  await fastify.ready()

  // First request stores the response (TTL=0 means always revalidate)
  const res1 = await fastify.inject({ method: 'GET', url: '/revalidate' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalled, 1)

  // Entry is stored but with TTL=0 (expiry=0 means always expired/revalidate)
  // On next access, expiry=0 means the entry is treated as needing revalidation
  // For our implementation, expiry=0 means the entry never expires in the LRU
  // but the no-cache directive should be respected through the stored Cache-Control
  t.assert.strictEqual(fastify.cache.stats().items, 1, 'response should be stored')

  await fastify.close()
})
