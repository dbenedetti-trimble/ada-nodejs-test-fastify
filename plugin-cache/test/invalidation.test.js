'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// VAL-19: purge(key) removes specific entry and returns true
test('purge(key) removes entry and returns true', async t => {
  const fastify = await buildFastify()
  fastify.get('/u', { config: { cache: true } }, async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/u' }) // prime cache

  const removed = fastify.cache.purge('GET|/u|')
  t.assert.strictEqual(removed, true)
  const res = await fastify.inject({ method: 'GET', url: '/u' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
  await fastify.close()
})

// purge(key) returns false for non-existent key
test('purge(key) returns false for non-existent key', async t => {
  const fastify = await buildFastify()
  const removed = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(removed, false)
  await fastify.close()
})

// VAL-20: purgeByPrefix removes matching entries, leaves others
test('purgeByPrefix removes entries matching URL prefix', async t => {
  const fastify = await buildFastify()
  fastify.get('/users', { config: { cache: true } }, async () => ({ list: true }))
  fastify.get('/users/:id', { config: { cache: true } }, async (req) => ({ id: req.params.id }))
  fastify.get('/posts', { config: { cache: true } }, async () => ({ posts: true }))

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  fastify.cache.purgeByPrefix('/users')

  const u = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(u.headers['x-cache'], 'MISS')

  const u1 = await fastify.inject({ method: 'GET', url: '/users/1' })
  t.assert.strictEqual(u1.headers['x-cache'], 'MISS')

  const p = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(p.headers['x-cache'], 'HIT')
  await fastify.close()
})

// VAL-21: clear() removes all entries
test('clear() removes all entries and resets stats', async t => {
  const fastify = await buildFastify()
  fastify.get('/x', { config: { cache: true } }, async () => ({ x: 1 }))
  fastify.get('/y', { config: { cache: true } }, async () => ({ y: 1 }))
  await fastify.inject({ method: 'GET', url: '/x' })
  await fastify.inject({ method: 'GET', url: '/y' })

  fastify.cache.clear()
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  const x = await fastify.inject({ method: 'GET', url: '/x' })
  t.assert.strictEqual(x.headers['x-cache'], 'MISS')
  await fastify.close()
})

// VAL-22: stats() tracks hits and misses correctly
test('stats() tracks hits and misses correctly', async t => {
  const fastify = await buildFastify()
  fastify.get('/s', { config: { cache: true } }, async () => ({}))

  await fastify.inject({ method: 'GET', url: '/s' }) // miss
  await fastify.inject({ method: 'GET', url: '/s' }) // hit
  await fastify.inject({ method: 'GET', url: '/s' }) // hit

  const { hits, misses } = fastify.cache.stats()
  t.assert.strictEqual(hits, 2)
  t.assert.strictEqual(misses, 1)
  await fastify.close()
})
