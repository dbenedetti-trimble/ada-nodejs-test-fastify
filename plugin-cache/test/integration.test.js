'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('VAL-06: vary header produces different cache entries', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: { vary: ['Accept'] } } }, async (request) => {
    return { accept: request.headers.accept || 'none' }
  })

  await fastify.ready()

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

test('global vary headers are used', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin, { vary: ['Accept-Language'] })

  fastify.get('/global-vary', { config: { cache: true } }, async () => {
    return { msg: 'hello' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/global-vary',
    headers: { 'accept-language': 'en' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/global-vary',
    headers: { 'accept-language': 'fr' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
})

test('route vary merged with global vary (no duplicates)', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin, { vary: ['accept'] })

  fastify.get('/merged', { config: { cache: { vary: ['Accept', 'X-Custom'] } } }, async () => {
    return { ok: true }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'x-custom': 'a' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'x-custom': 'b' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'x-custom': 'a' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
})

test('VAL-17: non-GET requests are not cached', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.post('/submit', { config: { cache: true } }, async () => {
    handlerCalls++
    return { submitted: true }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'POST', url: '/submit', payload: {} })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)

  await fastify.inject({ method: 'POST', url: '/submit', payload: {} })
  t.assert.strictEqual(handlerCalls, 2)
})

test('VAL-18: non-2xx responses are not cached', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/not-found', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.code(404)
    return { error: 'not found' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/not-found' })
  await fastify.inject({ method: 'GET', url: '/not-found' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('multiple routes with different cache configs', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/cached', { config: { cache: true } }, async () => ({ cached: true }))
  fastify.get('/uncached', async () => ({ uncached: true }))

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/uncached' })
  t.assert.strictEqual(res3.headers['x-cache'], undefined)

  const res4 = await fastify.inject({ method: 'GET', url: '/uncached' })
  t.assert.strictEqual(res4.headers['x-cache'], undefined)
})

test('cache with shorthand boolean true uses defaults', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/bool', { config: { cache: true } }, async () => ({ ok: true }))

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/bool' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/bool' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
})
