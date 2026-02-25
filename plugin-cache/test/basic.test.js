'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('Plugin registration with default options', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  t.assert.ok(fastify.cache, 'cache decorator exists')
  t.assert.strictEqual(typeof fastify.cache.purge, 'function')
  t.assert.strictEqual(typeof fastify.cache.purgeByPrefix, 'function')
  t.assert.strictEqual(typeof fastify.cache.clear, 'function')
  t.assert.strictEqual(typeof fastify.cache.stats, 'function')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.maxItems, 1000, 'default maxItems is 1000')
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('Plugin registration with custom options', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, {
    maxItems: 500,
    ttl: 30000,
    methods: ['GET', 'POST'],
    vary: ['Accept', 'Accept-Encoding']
  })

  t.assert.ok(fastify.cache, 'cache decorator exists')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.maxItems, 500, 'custom maxItems is 500')

  await fastify.close()
})

test('Plugin throws error if cache decorator already exists', async t => {
  const fastify = Fastify({ logger: false })

  fastify.decorate('cache', {})

  await t.assert.rejects(
    async () => await fastify.register(cachePlugin),
    { code: 'FST_ERR_DEC_ALREADY_PRESENT' },
    'throws FST_ERR_DEC_ALREADY_PRESENT'
  )

  await fastify.close()
})

test('Cache decorator visible to parent scope', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  t.assert.ok(fastify.cache, 'cache decorator visible at root level')

  await fastify.register(async (instance) => {
    t.assert.ok(instance.cache, 'cache decorator visible in child context')
  })

  await fastify.close()
})

test('Plugin does not affect routes without caching', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCalled = false
  fastify.get('/test', async () => {
    handlerCalled = true
    return { ok: true }
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/test' })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(handlerCalled, 'handler was called')
  t.assert.deepStrictEqual(response.json(), { ok: true })

  await fastify.close()
})
