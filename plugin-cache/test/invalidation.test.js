'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-19: Purge removes specific entry
test('purge(key) removes the exact entry and returns true', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/users', { config: { cache: true } }, async () => ([{ id: 1 }]))

  await fastify.inject({ method: 'GET', url: '/users' })
  const removed = fastify.cache.purge('GET|/users|')
  t.assert.equal(removed, true)
  const r = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.equal(r.headers['x-cache'], 'MISS', 'entry purged')
})

test('purge(key) returns false when key does not exist', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  const removed = fastify.cache.purge('GET|/nonexistent|')
  t.assert.equal(removed, false)
})

// VAL-20: Purge by prefix removes matching entries
test('purgeByPrefix removes all entries with matching URL prefix', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/users', { config: { cache: true } }, async () => ([]))
  fastify.get('/users/1', { config: { cache: true } }, async () => ({ id: 1 }))
  fastify.get('/users/2', { config: { cache: true } }, async () => ({ id: 2 }))
  fastify.get('/posts', { config: { cache: true } }, async () => ([]))

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'GET', url: '/users/2' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  fastify.cache.purgeByPrefix('/users')

  const ru = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.equal(ru.headers['x-cache'], 'MISS', '/users purged')
  const rp = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.equal(rp.headers['x-cache'], 'HIT', '/posts not purged')
})

// VAL-21: Clear removes all entries
test('clear() empties cache and stats().items becomes 0', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/a', { config: { cache: true } }, async () => ({ r: 'a' }))
  fastify.get('/b', { config: { cache: true } }, async () => ({ r: 'b' }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  fastify.cache.clear()
  t.assert.equal(fastify.cache.stats().items, 0)

  const ra = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.equal(ra.headers['x-cache'], 'MISS', '/a is a miss after clear')
})

// VAL-22: Stats track hits and misses
test('stats().hits and stats().misses increment correctly', async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/data' }) // miss
  await fastify.inject({ method: 'GET', url: '/data' }) // hit
  await fastify.inject({ method: 'GET', url: '/data' }) // hit

  const s = fastify.cache.stats()
  t.assert.equal(s.misses, 1)
  t.assert.equal(s.hits, 2)
})
