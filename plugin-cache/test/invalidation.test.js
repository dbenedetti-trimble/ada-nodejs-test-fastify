'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

test('purge(key) removes entry and returns true', async t => {
  const fastify = await buildFastify()
  fastify.get('/u', { config: { cache: true } }, async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/u' })

  const removed = fastify.cache.purge('GET|/u|')
  t.assert.strictEqual(removed, true)

  const res = await fastify.inject({ method: 'GET', url: '/u' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('purge(key) returns false if entry does not exist', async t => {
  const fastify = await buildFastify()
  const removed = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(removed, false)
  await fastify.close()
})

test('purgeByPrefix removes all matching entries', async t => {
  const fastify = await buildFastify()
  for (const path of ['/users', '/users/1', '/users/2', '/posts']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  const count = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(count, 3)

  const users = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(users.headers['x-cache'], 'MISS')

  const posts = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(posts.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('clear() removes all entries', async t => {
  const fastify = await buildFastify()
  fastify.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(fastify.cache.stats().items, 2)

  fastify.cache.clear()
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  const a = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(a.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('clear() resets stats counters', async t => {
  const fastify = await buildFastify()
  fastify.get('/c', { config: { cache: true } }, async () => ({}))

  await fastify.inject({ method: 'GET', url: '/c' })
  await fastify.inject({ method: 'GET', url: '/c' })

  fastify.cache.clear()
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)
  await fastify.close()
})

test('stats() tracks hits and misses correctly', async t => {
  const fastify = await buildFastify()
  fastify.get('/s', { config: { cache: true } }, async () => ({}))

  await fastify.inject({ method: 'GET', url: '/s' })
  await fastify.inject({ method: 'GET', url: '/s' })
  await fastify.inject({ method: 'GET', url: '/s' })

  const { hits, misses } = fastify.cache.stats()
  t.assert.strictEqual(hits, 2)
  t.assert.strictEqual(misses, 1)
  await fastify.close()
})

test('stats() returns correct maxItems', async t => {
  const fastify = await buildFastify({ maxItems: 42 })
  t.assert.strictEqual(fastify.cache.stats().maxItems, 42)
  await fastify.close()
})
