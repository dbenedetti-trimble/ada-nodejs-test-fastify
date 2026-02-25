'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACFR_4_1 @unit_test: Cache hit serves the stored response body with original status code', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/users', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.code(200)
    return { users: ['alice', 'bob'], count: 2 }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(handlerCalls, 1, 'handler called on first request')
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.deepStrictEqual(res1.json(), { users: ['alice', 'bob'], count: 2 })

  const res2 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(handlerCalls, 1, 'handler not called on cache hit')
  t.assert.strictEqual(res2.statusCode, 200, 'status code preserved from cache')
  t.assert.deepStrictEqual(res2.json(), { users: ['alice', 'bob'], count: 2 }, 'response body preserved from cache')

  await fastify.close()
})

test('@covers_ACFR_4_2 @unit_test: Cache hit preserves the original Content-Type header', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/data', {
    config: { cache: true }
  }, (request, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8')
    return { data: 'test' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['content-type'], 'application/json; charset=utf-8')

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['content-type'], 'application/json; charset=utf-8', 'content-type preserved from cache')

  await fastify.close()
})

test('@covers_ACFR_4_3 @unit_test: Cache hit sets X-Cache: HIT response header', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/status', {
    config: { cache: true }
  }, () => {
    return { status: 'ok' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'cache hit sets X-Cache: HIT')
  t.assert.deepStrictEqual(res2.json(), { status: 'ok' })

  await fastify.close()
})

test('@covers_ACFR_4_4 @unit_test: Cache miss sets X-Cache: MISS response header', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/miss', {
    config: { cache: true }
  }, () => {
    return { result: 'data' }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/miss' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS', 'cache miss sets X-Cache: MISS')
  t.assert.strictEqual(res.statusCode, 200)

  await fastify.close()
})

test('@covers_ACFR_4_6 @unit_test: Cache hit skips the route handler entirely (verify handler is not called)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/skip', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { timestamp: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(handlerCalls, 1, 'handler called on cache miss')
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(handlerCalls, 1, 'handler NOT called on cache hit')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(handlerCalls, 1, 'handler still NOT called on subsequent cache hits')

  await fastify.close()
})

test('@covers_ACFR_4_7 @unit_test: Cache miss runs the route handler normally', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/dynamic', {
    config: { cache: true }
  }, (request) => {
    handlerCalls++
    const id = request.query.id || '1'
    return { id, timestamp: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/dynamic?id=1' })
  t.assert.strictEqual(handlerCalls, 1, 'handler called for first request')
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/dynamic?id=2' })
  t.assert.strictEqual(handlerCalls, 2, 'handler called for different query string')
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({ method: 'GET', url: '/dynamic?id=3' })
  t.assert.strictEqual(handlerCalls, 3, 'handler called for another different query string')
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('@covers_ACFR_4_1 @covers_ACFR_4_3 @unit_test: Cache hit with custom status code', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/created', {
    config: { cache: true }
  }, (request, reply) => {
    reply.code(201)
    return { resource: 'created' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/created' })
  t.assert.strictEqual(res1.statusCode, 201)

  const res2 = await fastify.inject({ method: 'GET', url: '/created' })
  t.assert.strictEqual(res2.statusCode, 201, 'custom status code preserved')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res2.json(), { resource: 'created' })

  await fastify.close()
})

test('@covers_ACFR_4_6 @covers_ACFR_4_7 @unit_test: Multiple routes with different cache states', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let cachedCalls = 0
  let uncachedCalls = 0

  fastify.get('/cached-route', {
    config: { cache: true }
  }, () => {
    cachedCalls++
    return { route: 'cached' }
  })

  fastify.get('/uncached-route', () => {
    uncachedCalls++
    return { route: 'uncached' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/cached-route' })
  t.assert.strictEqual(cachedCalls, 1)

  await fastify.inject({ method: 'GET', url: '/cached-route' })
  t.assert.strictEqual(cachedCalls, 1, 'cached route handler not called again')

  await fastify.inject({ method: 'GET', url: '/uncached-route' })
  t.assert.strictEqual(uncachedCalls, 1)

  await fastify.inject({ method: 'GET', url: '/uncached-route' })
  t.assert.strictEqual(uncachedCalls, 2, 'uncached route handler called every time')

  await fastify.inject({ method: 'GET', url: '/cached-route' })
  t.assert.strictEqual(cachedCalls, 1, 'cached route still not calling handler')

  await fastify.inject({ method: 'GET', url: '/uncached-route' })
  t.assert.strictEqual(uncachedCalls, 3)

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2, 'two cache hits')
  t.assert.strictEqual(stats.misses, 1, 'one cache miss')

  await fastify.close()
})
