'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('registers with default options', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)
  await fastify.ready()

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.maxItems, 1000)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)
})

test('registers with custom options', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 50, ttl: 5000 })
  await fastify.ready()

  t.assert.strictEqual(fastify.cache.stats().maxItems, 50)
})

test('throws if cache decorator already exists', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  fastify.decorate('cache', {})
  await t.assert.rejects(
    async () => {
      await fastify.register(cachePlugin)
      await fastify.ready()
    },
    { code: 'FST_ERR_DEC_ALREADY_PRESENT' }
  )
})

test('uncached route is unaffected', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/no-cache', async () => {
    handlerCalls++
    return { ok: true }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)

  await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(handlerCalls, 2)
})

test('basic cache miss then hit', async t => {
  t.plan(8)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: 42 }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.ok(res1.headers.etag)
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.payload, res1.payload)
  t.assert.strictEqual(handlerCalls, 1)
})

test('cache key includes query string', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/items', { config: { cache: true } }, async (request) => {
    return { page: request.query.page || '1' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  const res4 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT')
})

test('vary header produces different cache entries', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: { vary: ['accept'] } } }, async (request) => {
    return { accept: request.headers.accept }
  })

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
})

test('route-level vary merges with global vary', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { vary: ['accept-language'] })

  fastify.get('/data', { config: { cache: { vary: ['accept'] } } }, async () => {
    return { ok: true }
  })

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
})

test('non-GET requests are not cached', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.post('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { created: true }
  })

  const res1 = await fastify.inject({ method: 'POST', url: '/data' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)

  await fastify.inject({ method: 'POST', url: '/data' })
  t.assert.strictEqual(handlerCalls, 2)
})

test('non-2xx responses are not cached', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/notfound', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.code(404)
    return { error: 'not found' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(res1.statusCode, 404)

  await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('boolean true config uses default TTL', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/status', { config: { cache: true } }, async () => {
    return { status: 'ok' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
})
