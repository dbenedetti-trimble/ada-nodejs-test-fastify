'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('plugin registers with default options', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  t.assert.ok(fastify.cache, 'cache decorator should exist')
  t.assert.strictEqual(typeof fastify.cache.purge, 'function')
  t.assert.strictEqual(typeof fastify.cache.purgeByPrefix, 'function')
  t.assert.strictEqual(typeof fastify.cache.clear, 'function')
  t.assert.deepStrictEqual(fastify.cache.stats(), {
    items: 0,
    maxItems: 1000,
    hits: 0,
    misses: 0
  })

  await fastify.close()
})

test('plugin registers with custom options', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(require('../index'), {
    maxItems: 50,
    ttl: 5000,
    methods: ['GET', 'POST'],
    vary: ['Accept']
  })

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.maxItems, 50)
  t.assert.strictEqual(stats.items, 0)

  await fastify.close()
})

test('plugin throws if cache decorator already exists', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.decorate('cache', { existing: true })

  await t.assert.rejects(
    async () => {
      await fastify.register(require('../index'))
    },
    {
      code: 'FST_ERR_DEC_ALREADY_PRESENT'
    }
  )

  await fastify.close()
})

test('plugin uses fastify-plugin wrapper (decorator visible to parent)', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(require('../index'))
  await fastify.ready()

  t.assert.ok(fastify.cache, 'decorator should be visible when using fastify-plugin')

  await fastify.close()
})

test('uncached route is unaffected by plugin', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(require('../index'))

  let handlerCalled = false
  fastify.get('/', (request, reply) => {
    handlerCalled = true
    reply.send({ hello: 'world' })
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.ok(handlerCalled, 'handler should be called')
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], undefined, 'should not have x-cache header')
  t.assert.strictEqual(fastify.cache.stats().items, 0, 'nothing should be cached')

  await fastify.close()
})

test('plugin with cache: true does not affect non-cached routes', async (t) => {
  t.plan(6)
  const fastify = Fastify()
  await fastify.register(require('../index'))

  let cachedHandlerCalled = 0
  let uncachedHandlerCalled = 0

  fastify.get('/cached', {
    config: { cache: true }
  }, (request, reply) => {
    cachedHandlerCalled++
    reply.send({ route: 'cached' })
  })

  fastify.get('/uncached', (request, reply) => {
    uncachedHandlerCalled++
    reply.send({ route: 'uncached' })
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/uncached' })
  await fastify.inject({ method: 'GET', url: '/uncached' })

  t.assert.strictEqual(uncachedHandlerCalled, 2, 'uncached route handler called twice')
  t.assert.strictEqual(cachedHandlerCalled, 0, 'cached route not called yet')

  const res1 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(cachedHandlerCalled, 1, 'cached route handler called once')
  t.assert.strictEqual(res1.statusCode, 200)

  const res2 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(cachedHandlerCalled, 1, 'cached route handler still only called once')
  t.assert.strictEqual(res2.statusCode, 200)

  await fastify.close()
})
