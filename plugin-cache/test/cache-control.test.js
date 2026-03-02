'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('response Cache-Control: no-store prevents caching', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/no-store', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-store')
    return { v: calls }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(r1.statusCode, 200)

  const r2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(r2.statusCode, 200)
  t.assert.strictEqual(calls, 2, 'handler called twice — not cached')
})

test('response Cache-Control: private prevents caching', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/private', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'private')
    return { v: calls }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/private' })
  await fastify.inject({ method: 'GET', url: '/private' })
  t.assert.strictEqual(calls, 2, 'not cached due to private')
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('response Cache-Control: max-age overrides route TTL', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/maxage', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 'max-age=1')
    return { v: 1 }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/maxage' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  // Still within 1s — hit
  const r2 = await fastify.inject({ method: 'GET', url: '/maxage' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')

  // Wait for max-age to expire
  await new Promise(resolve => setTimeout(resolve, 1100))

  const r3 = await fastify.inject({ method: 'GET', url: '/maxage' })
  t.assert.strictEqual(r3.headers['x-cache'], 'MISS', 'expired after max-age')
})

test('response Cache-Control: s-maxage takes priority over max-age', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/smaxage', { config: { cache: true } }, async (req, reply) => {
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { v: 1 }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/smaxage' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  const r2 = await fastify.inject({ method: 'GET', url: '/smaxage' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')

  // s-maxage=1 expires after 1s (not max-age=60)
  await new Promise(resolve => setTimeout(resolve, 1100))

  const r3 = await fastify.inject({ method: 'GET', url: '/smaxage' })
  t.assert.strictEqual(r3.headers['x-cache'], 'MISS', 'expired per s-maxage=1')
})

test('request Cache-Control: no-cache bypasses cache and runs handler', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/req-nocache', { config: { cache: true } }, async () => {
    calls++
    return { v: calls }
  })

  await fastify.ready()

  // Prime cache
  await fastify.inject({ method: 'GET', url: '/req-nocache' })
  t.assert.strictEqual(calls, 1)

  // no-cache on request — bypasses cache
  const r2 = await fastify.inject({
    method: 'GET',
    url: '/req-nocache',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(calls, 2, 'handler called despite cached entry')
})

test('response Cache-Control: no-cache is stored but immediately expires', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/res-nocache', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-cache')
    return { v: calls }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/res-nocache' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  // Should be expired immediately (TTL=0), so always a miss / re-validates
  const r2 = await fastify.inject({ method: 'GET', url: '/res-nocache' })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS', 'entry expired immediately')
  t.assert.strictEqual(calls, 2)
})

test('request Cache-Control: no-store bypasses cache and does not store', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/req-nostore', { config: { cache: true } }, async () => {
    calls++
    return { v: calls }
  })

  await fastify.ready()

  // no-store on request — skip cache and do not store
  const r1 = await fastify.inject({
    method: 'GET',
    url: '/req-nostore',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(fastify.cache.stats().items, 0, 'nothing stored')

  // Normal request — still a miss (nothing was stored before)
  const r2 = await fastify.inject({ method: 'GET', url: '/req-nostore' })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(calls, 2)
})

test('responses without Cache-Control use route/global default TTL', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/default-ttl', { config: { cache: true } }, async () => ({ v: 1 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/default-ttl' })
  const r = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  t.assert.strictEqual(r.headers['x-cache'], 'HIT')
  t.assert.strictEqual(fastify.cache.stats().items, 1)
})
