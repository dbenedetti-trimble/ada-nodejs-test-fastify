'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

test('TTL expiry: hit before expiry, miss after', async t => {
  const fastify = await buildFastify()
  fastify.get('/ttl', { config: { cache: { ttl: 100 } } }, async () => ({ ts: Date.now() }))

  await fastify.inject({ method: 'GET', url: '/ttl' })

  const hit = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 150))
  const expired = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('entry with long TTL is still hit before expiry', async t => {
  const fastify = await buildFastify()
  fastify.get('/long', { config: { cache: { ttl: 10000 } } }, async () => ({ v: 1 }))

  await fastify.inject({ method: 'GET', url: '/long' })
  const hit = await fastify.inject({ method: 'GET', url: '/long' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('LRU evicts least recently used', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/c' })

  // Check /b before /a — checking /a (miss) re-stores it and would evict /b
  const bResult = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(bResult.headers['x-cache'], 'HIT')

  const aResult = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(aResult.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('LRU access updates recency', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/c' })

  const a = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(a.headers['x-cache'], 'HIT')

  const b = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(b.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('stats items count reflects current cache size', async t => {
  const fastify = await buildFastify({ maxItems: 5 })
  for (const path of ['/x', '/y', '/z']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }

  await fastify.inject({ method: 'GET', url: '/x' })
  await fastify.inject({ method: 'GET', url: '/y' })
  t.assert.strictEqual(fastify.cache.stats().items, 2)

  await fastify.inject({ method: 'GET', url: '/z' })
  t.assert.strictEqual(fastify.cache.stats().items, 3)
  await fastify.close()
})
