'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('plugin registers with default options', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.ok(fastify.cache, 'cache decorator exists')
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.maxItems, 1000)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)
})

test('plugin registers with custom options', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 50, ttl: 5000 })
  await fastify.ready()

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.maxItems, 50)
  t.assert.strictEqual(stats.items, 0)
})

test('plugin uses fastify-plugin so decorator is not encapsulated (visible to sibling plugins)', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  // fp causes the decorator to bubble up to fastify so sibling plugins can see it
  fastify.register(cachePlugin)

  let siblingSawCache = false
  fastify.register(async (instance) => {
    siblingSawCache = instance.hasDecorator('cache')
  })

  await fastify.ready()
  t.assert.ok(siblingSawCache, 'sibling plugin sees cache decorator (fp not encapsulated)')
})

test('uncached route is completely unaffected', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/no-cache', async () => {
    handlerCalls++
    return { hello: 'world' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined, 'no X-Cache header')
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(handlerCalls, 2, 'handler called again (not cached)')
})

test('basic cache miss then hit', async (t) => {
  t.plan(9)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/items', { config: { cache: true } }, async () => {
    handlerCalls++
    return { items: [1, 2, 3] }
  })

  await fastify.ready()

  // First request — cache miss
  const res1 = await fastify.inject({ method: 'GET', url: '/items' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.ok(res1.headers.etag, 'ETag header set')
  t.assert.strictEqual(handlerCalls, 1)

  // Second request — cache hit
  const res2 = await fastify.inject({ method: 'GET', url: '/items' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.body, res1.body, 'body matches')
  t.assert.strictEqual(handlerCalls, 1, 'handler not called again')
  t.assert.strictEqual(res2.headers.etag, res1.headers.etag, 'same ETag')
})

test('cache key includes query string', async (t) => {
  t.plan(6)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/paged', { config: { cache: true } }, async (request) => {
    handlerCalls++
    return { page: request.query.page }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/paged?page=1' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/paged?page=2' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'different query = different entry')

  // Repeat page=1 — should hit
  const res3 = await fastify.inject({ method: 'GET', url: '/paged?page=1' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalls, 2)
})

test('cache shorthand config.cache = true uses global defaults', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/status', { config: { cache: true } }, async () => ({ status: 'ok' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/status' })
  const res = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(fastify.cache.stats().items, 1)
})

test('content-type header is preserved on cache hit', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/typed', { config: { cache: true } }, async (req, reply) => {
    reply.type('application/json')
    return { ok: true }
  })

  await fastify.ready()

  const miss = await fastify.inject({ method: 'GET', url: '/typed' })
  const hit = await fastify.inject({ method: 'GET', url: '/typed' })

  t.assert.ok(miss.headers['content-type'].includes('application/json'))
  t.assert.ok(hit.headers['content-type'].includes('application/json'))
})
