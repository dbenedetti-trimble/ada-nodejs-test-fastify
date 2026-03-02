'use strict'

const { test } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const Fastify = require('../..')
const cachePlugin = require('..')

test('VAL-07: TTL expiry', async t => {
  t.plan(3)
  const clock = FakeTimers.install({ shouldClearNativeTimers: true })

  try {
    const fastify = Fastify()
    fastify.register(cachePlugin)

    fastify.get('/ttl', { config: { cache: { ttl: 100 } } }, async () => {
      return { ts: Date.now() }
    })

    await fastify.ready()

    const res1 = await fastify.inject({ method: 'GET', url: '/ttl' })
    t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

    clock.tick(50)
    const res2 = await fastify.inject({ method: 'GET', url: '/ttl' })
    t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

    clock.tick(100)
    const res3 = await fastify.inject({ method: 'GET', url: '/ttl' })
    t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  } finally {
    clock.uninstall()
  }
})

test('VAL-08: LRU eviction', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/c' })

  // Check /b before /a — /b should still be cached, /a was evicted by /c
  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'HIT')

  const resC = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(resC.headers['x-cache'], 'HIT')

  // /a was evicted when /c was stored
  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS')

  t.assert.strictEqual(fastify.cache.stats().items, 2)
})

test('VAL-09: LRU access updates recency', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ route: 'c' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  // Access /a to refresh its recency
  await fastify.inject({ method: 'GET', url: '/a' })

  // /c evicts /b (least recently used), not /a
  await fastify.inject({ method: 'GET', url: '/c' })

  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'HIT')

  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'MISS')
})
