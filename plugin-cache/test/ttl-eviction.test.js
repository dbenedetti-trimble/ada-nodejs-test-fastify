'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
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

  await new Promise(r => setTimeout(r, 150))
  const expired = await fastify.inject({ method: 'GET', url: '/ttl' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
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
