'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('purge(key) removes specific entry and returns true', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => ({ users: [] }))

  await fastify.ready()

  // Prime cache
  await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  const key = 'GET|/users|'
  t.assert.strictEqual(fastify.cache.purge(key), true, 'returns true when entry existed')
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  // Now a miss again
  const r = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(r.headers['x-cache'], 'MISS')
})

test('purge(key) returns false when entry does not exist', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.strictEqual(fastify.cache.purge('GET|/nonexistent|'), false)
})

test('purgeByPrefix removes all entries matching URL prefix', async (t) => {
  t.plan(6)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => ({ all: true }))
  fastify.get('/users/1', { config: { cache: true } }, async () => ({ id: 1 }))
  fastify.get('/users/2', { config: { cache: true } }, async () => ({ id: 2 }))
  fastify.get('/posts', { config: { cache: true } }, async () => ({ posts: [] }))

  await fastify.ready()

  // Prime all routes
  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(fastify.cache.stats().items, 4)

  const removed = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(removed, 3, 'removed 3 /users entries')
  t.assert.strictEqual(fastify.cache.stats().items, 1, 'only /posts remains')

  const rUsers = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(rUsers.headers['x-cache'], 'MISS', '/users is a miss')

  const rPosts = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(rPosts.headers['x-cache'], 'HIT', '/posts still cached')

  t.assert.strictEqual(fastify.cache.stats().items, 2)
})

test('clear() removes all entries and resets stats counters', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  await fastify.inject({ method: 'GET', url: '/a' }) // hit

  const before = fastify.cache.stats()
  t.assert.strictEqual(before.items, 2)
  t.assert.ok(before.hits > 0)

  fastify.cache.clear()

  const after = fastify.cache.stats()
  t.assert.strictEqual(after.items, 0)
  t.assert.strictEqual(after.hits, 0)
  t.assert.strictEqual(after.misses, 0)
})

test('stats() tracks hits and misses correctly', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/counted', { config: { cache: true } }, async () => ({ v: 1 }))

  await fastify.ready()

  // 1 miss
  await fastify.inject({ method: 'GET', url: '/counted' })
  // 2 hits
  await fastify.inject({ method: 'GET', url: '/counted' })
  await fastify.inject({ method: 'GET', url: '/counted' })

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2)
  t.assert.strictEqual(stats.misses, 1)
  t.assert.strictEqual(stats.items, 1)
})
