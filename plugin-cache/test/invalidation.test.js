'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('VAL-19: purge removes specific entry', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)

  const removed = fastify.cache.purge('GET|/users|')
  t.assert.strictEqual(removed, true)

  const res = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
})

test('purge returns false for non-existent key', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(cachePlugin)
  await fastify.ready()

  t.assert.strictEqual(fastify.cache.purge('nonexistent'), false)
})

test('VAL-20: purgeByPrefix removes matching entries', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(cachePlugin)

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

  const res = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
})

test('VAL-21: clear removes all entries', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(fastify.cache.stats().items, 2)

  fastify.cache.clear()
  t.assert.strictEqual(fastify.cache.stats().items, 0)

  const res = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
})

test('VAL-22: stats track hits and misses', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/counted', { config: { cache: true } }, async () => {
    return { counted: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/counted' })
  await fastify.inject({ method: 'GET', url: '/counted' })
  await fastify.inject({ method: 'GET', url: '/counted' })

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 1)
  t.assert.strictEqual(stats.hits, 2)
})

test('clear resets hit/miss counters', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/reset', { config: { cache: true } }, async () => ({ ok: true }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/reset' })
  await fastify.inject({ method: 'GET', url: '/reset' })
  fastify.cache.clear()

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)
})
