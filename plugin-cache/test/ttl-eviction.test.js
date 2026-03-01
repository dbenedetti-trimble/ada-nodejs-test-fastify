'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// VAL-07: TTL expiry — hit before expiry, miss after
test('TTL expiry: hit before expiry, miss after', async t => {
  const fastify = await buildFastify()
  fastify.get('/ttl', { config: { cache: { ttl: 100 } } }, async () => ({ ts: Date.now() }))

  await fastify.inject({ method: 'GET', url: '/ttl' }) // miss

  const hit = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')

  await new Promise(r => setTimeout(r, 150))
  const expired = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

// VAL-08: LRU evicts least recently used
test('LRU evicts least recently used', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }
  await fastify.inject({ method: 'GET', url: '/a' }) // miss, stored
  await fastify.inject({ method: 'GET', url: '/b' }) // miss, stored, /a is LRU
  await fastify.inject({ method: 'GET', url: '/c' }) // miss, stored, /a evicted

  const aResult = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(aResult.headers['x-cache'], 'MISS') // evicted

  const bResult = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(bResult.headers['x-cache'], 'HIT') // still cached
  await fastify.close()
})

// VAL-09: LRU access updates recency
test('LRU access updates recency', async t => {
  const fastify = await buildFastify({ maxItems: 2 })
  for (const path of ['/a', '/b', '/c']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }
  await fastify.inject({ method: 'GET', url: '/a' }) // miss
  await fastify.inject({ method: 'GET', url: '/b' }) // miss
  await fastify.inject({ method: 'GET', url: '/a' }) // hit — refreshes /a, /b is now LRU
  await fastify.inject({ method: 'GET', url: '/c' }) // miss — evicts /b

  const a = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(a.headers['x-cache'], 'HIT')

  const b = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(b.headers['x-cache'], 'MISS')
  await fastify.close()
})
