'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
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

test('purge(key) returns false for non-existent key', async t => {
  const fastify = await buildFastify()
  const removed = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(removed, false)
  await fastify.close()
})

test('purgeByPrefix removes matching entries and leaves others', async t => {
  const fastify = await buildFastify()
  for (const path of ['/users', '/users/1', '/users/2', '/posts']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
  }
  for (const path of ['/users', '/users/1', '/users/2', '/posts']) {
    await fastify.inject({ method: 'GET', url: path })
  }

  const count = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(count, 3)

  const usersRes = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(usersRes.headers['x-cache'], 'MISS')

  const postsRes = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(postsRes.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('clear() removes all entries and resets stats', async t => {
  const fastify = await buildFastify()
  for (const path of ['/a', '/b']) {
    fastify.get(path, { config: { cache: true } }, async () => ({ path }))
    await fastify.inject({ method: 'GET', url: path })
    await fastify.inject({ method: 'GET', url: path })
  }

  fastify.cache.clear()
  const s = fastify.cache.stats()
  t.assert.strictEqual(s.items, 0)
  t.assert.strictEqual(s.hits, 0)
  t.assert.strictEqual(s.misses, 0)

  const res = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')
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
