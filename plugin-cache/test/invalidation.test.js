'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('VAL-19: purge removes specific entry', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  const removed = fastify.cache.purge('GET|/users|')
  t.assert.strictEqual(removed, true)
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  const res = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('purge returns false for non-existent key', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)
  await fastify.ready()

  const removed = fastify.cache.purge('nonexistent|key|')
  t.assert.strictEqual(removed, false)

  await fastify.close()
})

test('VAL-20: purgeByPrefix removes matching entries', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => ({ users: [] }))
  fastify.get('/users/1', { config: { cache: true } }, async () => ({ id: 1 }))
  fastify.get('/users/2', { config: { cache: true } }, async () => ({ id: 2 }))
  fastify.get('/posts', { config: { cache: true } }, async () => ({ posts: [] }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(fastify.cache.stats().items, 4)

  const count = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(count, 3)
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  // /posts should still be cached
  const resPosts = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(resPosts.headers['x-cache'], 'HIT')

  // /users should be a miss
  const resUsers = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(resUsers.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('VAL-21: clear removes all entries', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(fastify.cache.stats().items, 2)

  fastify.cache.clear()
  const s = fastify.cache.stats()
  t.assert.strictEqual(s.items, 0)
  t.assert.strictEqual(s.hits, 0)
  t.assert.strictEqual(s.misses, 0)

  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('VAL-22: stats track hits and misses', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/stats', { config: { cache: true } }, async () => {
    return { val: 1 }
  })

  await fastify.ready()

  // First request: miss
  await fastify.inject({ method: 'GET', url: '/stats' })
  t.assert.strictEqual(fastify.cache.stats().misses, 1)
  t.assert.strictEqual(fastify.cache.stats().hits, 0)

  // Second request: hit
  await fastify.inject({ method: 'GET', url: '/stats' })
  t.assert.strictEqual(fastify.cache.stats().hits, 1)
  t.assert.strictEqual(fastify.cache.stats().misses, 1)

  // Third request: hit
  await fastify.inject({ method: 'GET', url: '/stats' })
  t.assert.strictEqual(fastify.cache.stats().hits, 2)
  t.assert.strictEqual(fastify.cache.stats().misses, 1)

  await fastify.close()
})
