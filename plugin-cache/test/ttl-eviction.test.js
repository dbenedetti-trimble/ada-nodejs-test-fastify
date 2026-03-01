'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-07: TTL expiry
test('entry is a miss after TTL expires', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: { ttl: 100 } } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r1.headers['x-cache'], 'MISS')

  await new Promise(resolve => setTimeout(resolve, 50))
  const r2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 100))
  const r3 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r3.headers['x-cache'], 'MISS', 'entry expired')
})

// VAL-08: LRU eviction
test('LRU evicts least recently used entry when maxItems exceeded', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ r: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ r: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ r: 'c' }))

  await fastify.inject({ method: 'GET', url: '/a' }) // miss, stored
  await fastify.inject({ method: 'GET', url: '/b' }) // miss, stored (evicts nothing; size=2)
  await fastify.inject({ method: 'GET', url: '/c' }) // miss, stored (evicts /a)

  const rb = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.equal(rb.headers['x-cache'], 'HIT', '/b still cached')
  const ra = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.equal(ra.headers['x-cache'], 'MISS', '/a was evicted')
})

// VAL-09: LRU access updates recency
test('accessing an entry refreshes its recency and prevents eviction', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin, { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, async () => ({ r: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ r: 'b' }))
  fastify.get('/c', { config: { cache: true } }, async () => ({ r: 'c' }))

  await fastify.inject({ method: 'GET', url: '/a' }) // miss
  await fastify.inject({ method: 'GET', url: '/b' }) // miss
  await fastify.inject({ method: 'GET', url: '/a' }) // HIT — moves /a to most-recent
  await fastify.inject({ method: 'GET', url: '/c' }) // miss, evicts /b (oldest)

  const ra = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.equal(ra.headers['x-cache'], 'HIT', '/a still cached after recency refresh')
  const rb = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.equal(rb.headers['x-cache'], 'MISS', '/b was evicted')
})
