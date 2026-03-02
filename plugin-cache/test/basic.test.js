'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('VAL-01: plugin registers with defaults', async t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.ok(fastify.cache)
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.maxItems, 1000)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)
})

test('VAL-02: plugin registers with custom options', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin, { maxItems: 50, ttl: 5000 })
  await fastify.ready()

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.maxItems, 50)
  t.assert.strictEqual(stats.items, 0)
})

test('plugin throws if cache decorator already exists', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.decorate('cache', {})
  fastify.register(cachePlugin)

  try {
    await fastify.ready()
    t.assert.fail('should have thrown')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_DEC_ALREADY_PRESENT')
  }
})

test('VAL-03: uncached route is unaffected', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/no-cache', async () => {
    handlerCalls++
    return { ok: true }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], undefined)
  t.assert.strictEqual(handlerCalls, 1)
})

test('VAL-04: basic cache miss then hit', async t => {
  t.plan(8)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: 42 }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.ok(res1.headers.etag)
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.body, res1.body)
  t.assert.strictEqual(handlerCalls, 1)
})

test('VAL-05: cache key includes query string', async t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/items', { config: { cache: true } }, async (request) => {
    handlerCalls++
    return { page: request.query.page || '1' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalls, 2)

  const res3 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res3.body, res1.body)
})

test('cache hit preserves content-type header', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/typed', { config: { cache: true } }, async (request, reply) => {
    reply.type('text/plain')
    return 'hello'
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/typed' })
  const res = await fastify.inject({ method: 'GET', url: '/typed' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.ok(res.headers['content-type'].includes('text/plain'))
})
