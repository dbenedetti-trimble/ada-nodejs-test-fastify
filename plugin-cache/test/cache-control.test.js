'use strict'

const { test } = require('node:test')
const FakeTimers = require('@sinonjs/fake-timers')
const Fastify = require('../..')
const cachePlugin = require('..')

test('VAL-12: response Cache-Control: no-store prevents caching', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/no-store', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'no-store')
    return { secret: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
})

test('VAL-13: response Cache-Control: private prevents caching', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/private', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'private')
    return { user: 'data' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/private' })
  await fastify.inject({ method: 'GET', url: '/private' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('VAL-14: response Cache-Control: max-age overrides route TTL', async t => {
  t.plan(2)
  const clock = FakeTimers.install({ shouldClearNativeTimers: true })

  try {
    const fastify = Fastify()
    fastify.register(cachePlugin)

    fastify.get('/maxage', { config: { cache: { ttl: 60000 } } }, async (request, reply) => {
      reply.header('cache-control', 'max-age=1')
      return { data: 'short-lived' }
    })

    await fastify.ready()

    await fastify.inject({ method: 'GET', url: '/maxage' })

    clock.tick(1500)
    const res = await fastify.inject({ method: 'GET', url: '/maxage' })
    t.assert.strictEqual(res.headers['x-cache'], 'MISS')
    t.assert.strictEqual(fastify.cache.stats().items, 1)
  } finally {
    clock.uninstall()
  }
})

test('VAL-15: s-maxage takes priority over max-age', async t => {
  t.plan(2)
  const clock = FakeTimers.install({ shouldClearNativeTimers: true })

  try {
    const fastify = Fastify()
    fastify.register(cachePlugin)

    fastify.get('/smaxage', { config: { cache: true } }, async (request, reply) => {
      reply.header('cache-control', 's-maxage=1, max-age=60')
      return { data: 'smaxage-test' }
    })

    await fastify.ready()

    await fastify.inject({ method: 'GET', url: '/smaxage' })

    clock.tick(500)
    const res1 = await fastify.inject({ method: 'GET', url: '/smaxage' })
    t.assert.strictEqual(res1.headers['x-cache'], 'HIT')

    clock.tick(600)
    const res2 = await fastify.inject({ method: 'GET', url: '/smaxage' })
    t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  } finally {
    clock.uninstall()
  }
})

test('VAL-16: request Cache-Control: no-cache bypasses cache', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/bypass', { config: { cache: true } }, async () => {
    handlerCalls++
    return { call: handlerCalls }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/bypass' })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({
    method: 'GET',
    url: '/bypass',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(handlerCalls, 2)

  const res3 = await fastify.inject({ method: 'GET', url: '/bypass' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
})

test('request Cache-Control: no-store bypasses and does not store', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/req-nostore', { config: { cache: true } }, async () => {
    handlerCalls++
    return { data: 'nostore' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/req-nostore',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  await fastify.inject({ method: 'GET', url: '/req-nostore' })
  t.assert.strictEqual(handlerCalls, 2)
})

test('response no-cache is stored but revalidated', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/no-cache-resp', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'no-cache')
    return { data: 'revalidate' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/no-cache-resp' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  await fastify.inject({ method: 'GET', url: '/no-cache-resp' })
  t.assert.strictEqual(handlerCalls, 2)
})

test('responses without Cache-Control use default TTL', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/default-ttl', { config: { cache: true } }, async () => {
    return { data: 'default' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/default-ttl' })
  const res = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
})
