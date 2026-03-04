'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('purge removes specific entry and returns true', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  const removed = fastify.cache.purge('GET|/users|')
  t.assert.strictEqual(removed, true)

  const res = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
})

test('purge returns false for non-existent key', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  const removed = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(removed, false)
})

test('purgeByPrefix removes matching entries', async t => {
  t.plan(3)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => ({ users: [] }))
  fastify.get('/users/1', { config: { cache: true } }, async () => ({ id: 1 }))
  fastify.get('/users/2', { config: { cache: true } }, async () => ({ id: 2 }))
  fastify.get('/posts', { config: { cache: true } }, async () => ({ posts: [] }))

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  t.assert.strictEqual(fastify.cache.stats().items, 4)

  const count = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(count, 3)

  // /posts should still be cached
  const res = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
})

test('clear removes all entries and resets stats', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/a' })

  t.assert.strictEqual(fastify.cache.stats().items, 2)
  t.assert.strictEqual(fastify.cache.stats().hits, 1)

  fastify.cache.clear()

  t.assert.strictEqual(fastify.cache.stats().items, 0)
  t.assert.strictEqual(fastify.cache.stats().hits, 0)
})

test('stats track hits and misses correctly', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 42 }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2)
  t.assert.strictEqual(stats.misses, 1)
  t.assert.strictEqual(stats.items, 1)
  t.assert.strictEqual(stats.maxItems, 1000)
})
