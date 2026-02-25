'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('VAL-07: TTL expiry', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/ttl', { config: { cache: { ttl: 100 } } }, async () => {
    handlerCalled++
    return { ts: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 1)

  await sleep(50)
  const res2 = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 1)

  await sleep(100)
  const res3 = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  await fastify.close()
})

test('VAL-08: LRU eviction', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  t.assert.strictEqual(fastify.cache.stats().items, 2)

  await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(fastify.cache.stats().items, 2)

  // /b should still be cached (check before /a to avoid re-caching side effects)
  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'HIT')

  // /a should have been evicted (oldest)
  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('VAL-09: LRU access updates recency', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  // Fill cache: /a, /b
  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  // Access /a to refresh its recency
  const resAHit = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resAHit.headers['x-cache'], 'HIT')

  // Add /c, should evict /b (oldest after /a was refreshed)
  await fastify.inject({ method: 'GET', url: '/c' })

  // /a should still be cached
  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'HIT')

  // /b should be evicted
  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('expired entries are cleaned up on access (lazy eviction)', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10 })

  fastify.get('/lazy', { config: { cache: { ttl: 50 } } }, async () => {
    return { val: Date.now() }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/lazy' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  await sleep(100)

  // Access triggers lazy eviction
  const res = await fastify.inject({ method: 'GET', url: '/lazy' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')

  await fastify.close()
})
