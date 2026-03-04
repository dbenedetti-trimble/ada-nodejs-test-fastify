'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

test('response Cache-Control: no-store prevents caching', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'no-store')
    return { value: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })

  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('response Cache-Control: private prevents caching', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async (request, reply) => {
    reply.header('cache-control', 'private')
    return { value: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(fastify.cache.stats().items, 0)
})

test('response Cache-Control: max-age overrides route TTL', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: { ttl: 60000 } } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'max-age=1')
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await delay(1500)

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalls, 2)
})

test('response Cache-Control: s-maxage takes priority over max-age', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await delay(1500)

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalls, 2)
})

test('request Cache-Control: no-cache bypasses cache and stores fresh response', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(handlerCalls, 2)

  // Fresh response is now cached
  const res3 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res3.json().value, 2)
})

test('request Cache-Control: no-store bypasses cache and does not store', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })

  await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'cache-control': 'no-store' }
  })

  t.assert.strictEqual(handlerCalls, 2)

  // Original cached entry should still be there (not replaced by no-store request)
  const res3 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res3.json().value, 1)
})

test('response Cache-Control: no-cache stores but always revalidates', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'no-cache')
    return { value: handlerCalls }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  // Next request should revalidate (noCache flag means entry treated as miss)
  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 2)
})

test('responses without Cache-Control use route default TTL', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 1 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
})
