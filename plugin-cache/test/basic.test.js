'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// VAL-01: Plugin registers with defaults and exposes cache decorator
test('registers with defaults and exposes cache decorator', async t => {
  const fastify = await buildFastify()
  t.assert.ok(fastify.cache)
  t.assert.deepStrictEqual(fastify.cache.stats(), { items: 0, maxItems: 1000, hits: 0, misses: 0 })
  await fastify.close()
})

// VAL-02: Plugin registers with custom options
test('registers with custom maxItems and ttl', async t => {
  const fastify = await buildFastify({ maxItems: 50, ttl: 5000 })
  t.assert.strictEqual(fastify.cache.stats().maxItems, 50)
  await fastify.close()
})

// VAL-03: Uncached route is unaffected
test('uncached route has no X-Cache header', async t => {
  const fastify = await buildFastify()
  fastify.get('/no-cache', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], undefined)
  t.assert.strictEqual(fastify.cache.stats().misses, 0)
  await fastify.close()
})

// VAL-04: Basic cache miss then hit with handler call tracking
test('basic miss then hit with handler call tracking', async t => {
  const fastify = await buildFastify()
  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => { handlerCalls++; return { v: 1 } })

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.ok(r1.headers.etag)
  t.assert.strictEqual(handlerCalls, 1)

  const r2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(r2.json().v, 1)
  t.assert.strictEqual(handlerCalls, 1)
  await fastify.close()
})

// decorator visibility: plugin uses fastify-plugin, cache visible on parent scope
test('cache decorator is visible after plugin registration', async t => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)
  t.assert.ok(typeof fastify.cache.purge === 'function')
  t.assert.ok(typeof fastify.cache.purgeByPrefix === 'function')
  t.assert.ok(typeof fastify.cache.clear === 'function')
  t.assert.ok(typeof fastify.cache.stats === 'function')
  await fastify.close()
})
