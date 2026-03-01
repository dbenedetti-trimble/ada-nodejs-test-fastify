'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

test('registers with defaults and exposes cache decorator', async t => {
  const fastify = await buildFastify()
  t.assert.ok(fastify.cache)
  t.assert.deepStrictEqual(fastify.cache.stats(), { items: 0, maxItems: 1000, hits: 0, misses: 0 })
  await fastify.close()
})

test('registers with custom maxItems and ttl', async t => {
  const fastify = await buildFastify({ maxItems: 50, ttl: 5000 })
  t.assert.strictEqual(fastify.cache.stats().maxItems, 50)
  await fastify.close()
})

test('plugin registers without errors with no config', async t => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)
  t.assert.ok(fastify.cache)
  await fastify.close()
})

test('decorator is visible to parent scope via fastify-plugin', async t => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)
  t.assert.ok(fastify.cache)
  t.assert.strictEqual(typeof fastify.cache.stats, 'function')
  await fastify.close()
})

test('duplicate decorator registration throws FST_ERR_DEC_ALREADY_PRESENT', async t => {
  const fastify = Fastify()
  fastify.register(cachePlugin)
  fastify.register(cachePlugin)
  await t.assert.rejects(
    () => fastify.ready(),
    /FST_ERR_DEC_ALREADY_PRESENT/
  )
  await fastify.close()
})

test('uncached route has no X-Cache header', async t => {
  const fastify = await buildFastify()
  fastify.get('/no-cache', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], undefined)
  t.assert.strictEqual(fastify.cache.stats().misses, 0)
  await fastify.close()
})

test('uncached route does not store anything in the cache', async t => {
  const fastify = await buildFastify()
  fastify.get('/no-cache', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(fastify.cache.stats().items, 0)
  await fastify.close()
})

test('basic miss then hit with handler call tracking', async t => {
  const fastify = await buildFastify()
  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { v: 1 }
  })

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.ok(r1.headers.etag)
  t.assert.strictEqual(handlerCalls, 1)

  const r2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(r2.json(), { v: 1 })
  t.assert.strictEqual(handlerCalls, 1)
  await fastify.close()
})

test('cache hit preserves original status code and content-type', async t => {
  const fastify = await buildFastify()
  fastify.get('/typed', { config: { cache: true } }, async (req, reply) => {
    reply.header('content-type', 'application/json')
    return { x: 42 }
  })

  await fastify.inject({ method: 'GET', url: '/typed' })
  const hit = await fastify.inject({ method: 'GET', url: '/typed' })
  t.assert.strictEqual(hit.statusCode, 200)
  t.assert.ok(hit.headers['content-type'].includes('application/json'))
  await fastify.close()
})

test('config.cache = true uses global default TTL', async t => {
  const fastify = await buildFastify({ ttl: 50000 })
  fastify.get('/def', { config: { cache: true } }, async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/def' })
  const hit = await fastify.inject({ method: 'GET', url: '/def' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  await fastify.close()
})
