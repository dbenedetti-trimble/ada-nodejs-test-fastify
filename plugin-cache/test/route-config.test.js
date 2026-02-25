'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('ACFR-2-1: route with cache: true uses global default TTL', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 50000 })

  let handlerCalls = 0
  fastify.get('/default-ttl', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { data: 'cached with default ttl' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res2.json(), { data: 'cached with default ttl' })

  await fastify.close()
})

test('ACFR-2-2: route with cache.ttl uses specified TTL', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let handlerCalls = 0
  fastify.get('/custom-ttl', {
    config: { cache: { ttl: 30000 } }
  }, () => {
    handlerCalls++
    return { data: 'cached with custom ttl' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/custom-ttl' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/custom-ttl' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('ACFR-2-3: route with cache.vary includes headers in cache key', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/vary-accept', {
    config: { cache: { vary: ['Accept'] } }
  }, (request) => {
    handlerCalls++
    return { accept: request.headers.accept }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/vary-accept', headers: { accept: 'application/json' } })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.deepStrictEqual(res1.json(), { accept: 'application/json' })

  const res2 = await fastify.inject({ method: 'GET', url: '/vary-accept', headers: { accept: 'application/json' } })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/vary-accept', headers: { accept: 'text/html' } })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('ACFR-2-4: routes without config.cache are not cached', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/uncached', () => {
    handlerCalls++
    return { status: 'not cached' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/uncached' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)
  t.assert.deepStrictEqual(res1.json(), { status: 'not cached' })

  const res2 = await fastify.inject({ method: 'GET', url: '/uncached' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], undefined)
  t.assert.deepStrictEqual(res2.json(), { status: 'not cached' })

  await fastify.close()
})

test('ACFR-2-5: route-level vary merged with global vary (no duplicates)', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'), { vary: ['User-Agent'] })

  let handlerCalls = 0
  fastify.get('/merged-vary', {
    config: { cache: { vary: ['Accept', 'User-Agent'] } }
  }, (request) => {
    handlerCalls++
    return { ua: request.headers['user-agent'], accept: request.headers.accept }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/merged-vary',
    headers: { 'user-agent': 'test-agent-1', accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/merged-vary',
    headers: { 'user-agent': 'test-agent-1', accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/merged-vary',
    headers: { 'user-agent': 'test-agent-2', accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  const res4 = await fastify.inject({
    method: 'GET',
    url: '/merged-vary',
    headers: { 'user-agent': 'test-agent-1', accept: 'text/html' }
  })
  t.assert.strictEqual(handlerCalls, 3)
  t.assert.strictEqual(res4.headers['x-cache'], 'MISS')

  await fastify.close()
})
