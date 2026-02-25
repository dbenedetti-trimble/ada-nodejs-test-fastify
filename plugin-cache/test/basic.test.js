'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('VAL-01: plugin registers with defaults', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.ok(fastify.cache, 'cache decorator should exist')
  const s = fastify.cache.stats()
  t.assert.strictEqual(s.items, 0)
  t.assert.strictEqual(s.maxItems, 1000)
  t.assert.strictEqual(s.hits, 0)
  t.assert.strictEqual(s.misses, 0)
  await fastify.close()
})

test('VAL-02: plugin registers with custom options', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 50, ttl: 5000 })
  await fastify.ready()

  const s = fastify.cache.stats()
  t.assert.strictEqual(s.maxItems, 50)
  await fastify.close()
})

test('plugin throws if cache decorator already exists', async (t) => {
  const fastify = Fastify()
  fastify.decorate('cache', {})
  fastify.register(cachePlugin)
  await t.assert.rejects(
    fastify.ready(),
    (err) => {
      t.assert.ok(err.message.includes('already'))
      return true
    }
  )
})

test('VAL-03: uncached route is unaffected', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/no-cache', async () => {
    handlerCalled++
    return { ok: true }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], undefined)
  t.assert.strictEqual(handlerCalled, 2)

  t.assert.strictEqual(fastify.cache.stats().items, 0)
  await fastify.close()
})

test('VAL-04: basic cache miss then hit', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/cached', { config: { cache: true } }, async () => {
    handlerCalled++
    return { data: 'hello' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.ok(res1.headers.etag, 'ETag should be set')
  t.assert.strictEqual(handlerCalled, 1)
  const body1 = res1.json()
  t.assert.deepStrictEqual(body1, { data: 'hello' })

  const res2 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.ok(res2.headers.etag)
  t.assert.strictEqual(handlerCalled, 1, 'handler should not run on cache hit')
  const body2 = res2.json()
  t.assert.deepStrictEqual(body2, { data: 'hello' })

  await fastify.close()
})

test('VAL-05: cache key includes query string', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/items', { config: { cache: true } }, async (request) => {
    handlerCalled++
    return { page: request.query.page || '1' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  const res3 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 2)

  await fastify.close()
})

test('VAL-06: vary header produces different cache entries', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/data', {
    config: { cache: { vary: ['Accept'] } }
  }, async (request) => {
    handlerCalled++
    return { accept: request.headers.accept }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 2)

  await fastify.close()
})

test('VAL-17: non-GET requests are not cached', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.post('/submit', { config: { cache: true } }, async () => {
    handlerCalled++
    return { ok: true }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'POST', url: '/submit', payload: {} })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined)
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({ method: 'POST', url: '/submit', payload: {} })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], undefined)
  t.assert.strictEqual(handlerCalled, 2)

  await fastify.close()
})

test('VAL-18: non-2xx responses are not cached', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/notfound', { config: { cache: true } }, async (request, reply) => {
    handlerCalled++
    reply.code(404)
    return { error: 'not found' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(res1.statusCode, 404)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(res2.statusCode, 404)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  t.assert.strictEqual(fastify.cache.stats().items, 0)
  await fastify.close()
})

test('route-level config with boolean true uses global defaults', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 5000 })

  fastify.get('/bool', { config: { cache: true } }, async () => {
    return { val: 1 }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/bool' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/bool' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})
