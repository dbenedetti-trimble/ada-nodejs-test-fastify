'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('TTL expiry: entry is a miss after TTL elapses', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/short', { config: { cache: { ttl: 100 } } }, async () => ({ v: 1 }))

  await fastify.ready()

  // First request — miss
  const r1 = await fastify.inject({ method: 'GET', url: '/short' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  // Within TTL — hit
  const r2 = await fastify.inject({ method: 'GET', url: '/short' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')

  // Wait for TTL to expire
  await new Promise(resolve => setTimeout(resolve, 150))

  // After TTL — miss
  const r3 = await fastify.inject({ method: 'GET', url: '/short' })
  t.assert.strictEqual(r3.headers['x-cache'], 'MISS')

  // And now it's cached again
  const r4 = await fastify.inject({ method: 'GET', url: '/short' })
  t.assert.strictEqual(r4.headers['x-cache'], 'HIT')
})

test('TTL expiry: entry before TTL is still a hit', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/long', { config: { cache: { ttl: 10000 } } }, async () => ({ v: 1 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/long' })

  await new Promise(resolve => setTimeout(resolve, 50))

  const r = await fastify.inject({ method: 'GET', url: '/long' })
  t.assert.strictEqual(r.headers['x-cache'], 'HIT')
  t.assert.strictEqual(fastify.cache.stats().items, 1)
})

test('LRU eviction: oldest entry is evicted when maxItems is reached', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  // Fill cache: /a then /b
  const rA1 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(rA1.headers['x-cache'], 'MISS')

  const rB1 = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(rB1.headers['x-cache'], 'MISS')

  // Add /c — should evict /a (LRU)
  const rC1 = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(rC1.headers['x-cache'], 'MISS')

  // Check /b FIRST — still cached; then check /a (miss)
  // (checking /a re-stores it, which could evict /b, so order matters)
  const rB2 = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(rB2.headers['x-cache'], 'HIT', '/b still cached')

  const rA2 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(rA2.headers['x-cache'], 'MISS', '/a was evicted')
})

test('LRU access updates recency (prevents eviction)', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  // Fill cache: /a (LRU), /b (MRU)
  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  // Access /a — moves /a to MRU; /b becomes LRU
  const rA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(rA.headers['x-cache'], 'HIT')

  // Add /c — should evict /b (now LRU), not /a
  const rC = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(rC.headers['x-cache'], 'MISS')

  // /a still cached
  const rA2 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(rA2.headers['x-cache'], 'HIT', '/a still cached')

  // /c still cached (check before /b to avoid /b re-store evicting /c)
  const rC2 = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(rC2.headers['x-cache'], 'HIT', '/c still cached')

  // /b evicted
  const rB2 = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(rB2.headers['x-cache'], 'MISS', '/b was evicted')
})
