'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Fastify = require('../..')
const cachePlugin = require('..')

async function buildApp (opts) {
  const app = Fastify()
  await app.register(cachePlugin, opts)
  return app
}

// @covers_ACFR_8_1 @covers_ACAPI_2_1
test('purge(key) removes exact entry and returns true/false', async (t) => {
  const app = await buildApp()
  app.get('/purge', { config: { cache: true } }, async () => ({ ok: 1 }))
  await app.ready()

  await app.inject({ method: 'GET', url: '/purge' })
  const hit = await app.inject({ method: 'GET', url: '/purge' })
  assert.equal(hit.headers['x-cache'], 'HIT')

  const removed = app.cache.purge('GET|/purge|')
  assert.equal(removed, true)

  const removedAgain = app.cache.purge('GET|/purge|')
  assert.equal(removedAgain, false, 'already removed returns false')

  const miss = await app.inject({ method: 'GET', url: '/purge' })
  assert.equal(miss.headers['x-cache'], 'MISS')
  await app.close()
})

// @covers_ACFR_8_2 @covers_ACAPI_2_2
test('purgeByPrefix removes all entries whose URL starts with prefix', async (t) => {
  const app = await buildApp()
  app.get('/users', { config: { cache: true } }, async () => ({ list: true }))
  app.get('/users/1', { config: { cache: true } }, async () => ({ id: 1 }))
  app.get('/other', { config: { cache: true } }, async () => ({ other: true }))
  await app.ready()

  await app.inject({ method: 'GET', url: '/users' })
  await app.inject({ method: 'GET', url: '/users/1' })
  await app.inject({ method: 'GET', url: '/other' })

  app.cache.purgeByPrefix('/users')

  const r1 = await app.inject({ method: 'GET', url: '/users' })
  assert.equal(r1.headers['x-cache'], 'MISS', '/users purged')

  const r2 = await app.inject({ method: 'GET', url: '/users/1' })
  assert.equal(r2.headers['x-cache'], 'MISS', '/users/1 purged')

  const r3 = await app.inject({ method: 'GET', url: '/other' })
  assert.equal(r3.headers['x-cache'], 'HIT', '/other untouched')
  await app.close()
})

// @covers_ACFR_8_3 @covers_ACAPI_2_3
test('clear() removes all entries and resets stats counters', async (t) => {
  const app = await buildApp()
  app.get('/a', { config: { cache: true } }, async () => ({ a: 1 }))
  app.get('/b', { config: { cache: true } }, async () => ({ b: 2 }))
  await app.ready()

  await app.inject({ method: 'GET', url: '/a' })
  await app.inject({ method: 'GET', url: '/a' })
  await app.inject({ method: 'GET', url: '/b' })

  let s = app.cache.stats()
  assert.equal(s.items, 2)
  assert.ok(s.hits > 0)
  assert.ok(s.misses > 0)

  app.cache.clear()
  s = app.cache.stats()
  assert.equal(s.items, 0)
  assert.equal(s.hits, 0)
  assert.equal(s.misses, 0)

  const r = await app.inject({ method: 'GET', url: '/a' })
  assert.equal(r.headers['x-cache'], 'MISS', 'entries removed by clear')
  await app.close()
})

// @covers_ACFR_8_4 @covers_ACFR_8_5 @covers_ACAPI_2_4
test('stats() returns correct item count, maxItems, hits and misses', async (t) => {
  const app = await buildApp({ maxItems: 100 })
  app.get('/s1', { config: { cache: true } }, async () => ({ s: 1 }))
  app.get('/s2', { config: { cache: true } }, async () => ({ s: 2 }))
  await app.ready()

  let s = app.cache.stats()
  assert.equal(s.items, 0)
  assert.equal(s.maxItems, 100)
  assert.equal(s.hits, 0)
  assert.equal(s.misses, 0)

  await app.inject({ method: 'GET', url: '/s1' })
  s = app.cache.stats()
  assert.equal(s.misses, 1)
  assert.equal(s.hits, 0)
  assert.equal(s.items, 1)

  await app.inject({ method: 'GET', url: '/s1' })
  s = app.cache.stats()
  assert.equal(s.hits, 1)
  assert.equal(s.misses, 1)

  await app.inject({ method: 'GET', url: '/s2' })
  s = app.cache.stats()
  assert.equal(s.items, 2)
  assert.equal(s.misses, 2)

  await app.inject({ method: 'GET', url: '/s2' })
  s = app.cache.stats()
  assert.equal(s.hits, 2)
  assert.equal(s.misses, 2)
  await app.close()
})
