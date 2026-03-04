'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('TTL expiry: entry is hit before expiry', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: { ttl: 500 } } }, async () => {
    return { value: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await delay(50)

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res.statusCode, 200)
})

test('TTL expiry: entry is miss after expiry', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: { ttl: 100 } } }, async () => {
    handlerCalls++
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)

  await delay(150)

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
})

test('LRU eviction: oldest entry evicted when full', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/c' })

  // /b and /c are in cache; /a was evicted
  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'HIT')

  const resC = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(resC.headers['x-cache'], 'HIT')

  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS')
})

test('LRU access updates recency', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  // Access /a to refresh recency
  const hitA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(hitA.headers['x-cache'], 'HIT')

  // Add /c, should evict /b (least recent) not /a
  await fastify.inject({ method: 'GET', url: '/c' })

  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'MISS')
})

test('expired entries cleaned up on access (lazy eviction)', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: { ttl: 50 } } }, async () => {
    return { val: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  await delay(100)

  await fastify.inject({ method: 'GET', url: '/data' })
  // After access, the expired entry was removed and a new one stored
  t.assert.strictEqual(fastify.cache.stats().items, 1)
})
