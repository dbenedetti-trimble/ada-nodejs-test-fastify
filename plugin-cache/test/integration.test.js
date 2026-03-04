'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('multiple routes cached independently', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))

  const resA1 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA1.headers['x-cache'], 'MISS')

  const resB1 = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB1.headers['x-cache'], 'MISS')

  const resA2 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA2.headers['x-cache'], 'HIT')

  const resB2 = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB2.headers['x-cache'], 'HIT')
})

test('cache hit preserves original content-type', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 1 }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  const contentType = res1.headers['content-type']

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.headers['content-type'], contentType)
  t.assert.ok(contentType.includes('application/json'))
})

test('cache hit skips handler entirely', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)
})

test('mixed cached and uncached routes coexist', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let cachedCalls = 0
  let uncachedCalls = 0

  fastify.get('/cached', { config: { cache: true } }, async () => {
    cachedCalls++
    return { cached: true }
  })

  fastify.get('/uncached', async () => {
    uncachedCalls++
    return { cached: false }
  })

  await fastify.inject({ method: 'GET', url: '/cached' })
  await fastify.inject({ method: 'GET', url: '/cached' })
  await fastify.inject({ method: 'GET', url: '/uncached' })
  await fastify.inject({ method: 'GET', url: '/uncached' })

  t.assert.strictEqual(cachedCalls, 1)
  t.assert.strictEqual(uncachedCalls, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 1)
  t.assert.strictEqual(fastify.cache.stats().hits, 1)
})

test('route with config.cache.ttl overrides default', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/fast', { config: { cache: { ttl: 100 } } }, async () => {
    return { value: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/fast' })

  await new Promise(resolve => setTimeout(resolve, 150))

  const res = await fastify.inject({ method: 'GET', url: '/fast' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
})

test('missing vary header treated as empty string', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: { vary: ['accept'] } } }, async () => {
    return { ok: true }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
})

test('ETag conditional request with cache hit returns correct headers', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  const etag = res1.headers.etag

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(res2.statusCode, 304)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.headers.etag, etag)
})
