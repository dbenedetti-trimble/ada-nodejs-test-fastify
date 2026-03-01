'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-01: Plugin registers with defaults
test('plugin registers without error using default options', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  await fastify.ready()
  t.assert.ok(fastify.cache, 'cache decorator is present')
  const s = fastify.cache.stats()
  t.assert.deepStrictEqual(s, { items: 0, maxItems: 1000, hits: 0, misses: 0 })
})

// VAL-02: Plugin registers with custom options
test('plugin registers with custom maxItems and ttl', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin, { maxItems: 50, ttl: 5000 })
  await fastify.ready()
  t.assert.equal(fastify.cache.stats().maxItems, 50)
})

// VAL-03: Uncached route is unaffected
test('uncached route has no X-Cache header and handler always runs', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/uncached', async () => { calls++; return { ok: true } })
  const res = await fastify.inject({ method: 'GET', url: '/uncached' })
  t.assert.equal(res.statusCode, 200)
  t.assert.equal(res.headers['x-cache'], undefined)
  t.assert.equal(calls, 1)
})

// VAL-04: Basic cache miss then hit
test('first request is a cache miss; second is a hit and handler does not run', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/data', { config: { cache: true } }, async () => { calls++; return { value: 42 } })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(res1.headers['x-cache'], 'MISS')
  t.assert.ok(res1.headers['etag'], 'ETag header present on miss')

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(res2.headers['x-cache'], 'HIT')
  t.assert.equal(res2.json().value, 42)
  t.assert.equal(calls, 1, 'handler only called once')
})

// VAL-05: Cache key includes query string
test('different query strings produce different cache entries', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/items', { config: { cache: true } }, async (req) => {
    return { page: req.query.page }
  })

  const r1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  const r2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.equal(r1.headers['x-cache'], 'MISS')
  t.assert.equal(r2.headers['x-cache'], 'MISS')
  const r3 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.equal(r3.headers['x-cache'], 'HIT')
})

// VAL-06: Vary header produces different cache entries
test('different Vary header values produce different cache entries', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: { vary: ['Accept'] } } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'GET', url: '/data', headers: { accept: 'application/json' } })
  const r2 = await fastify.inject({ method: 'GET', url: '/data', headers: { accept: 'text/html' } })
  t.assert.equal(r1.headers['x-cache'], 'MISS')
  t.assert.equal(r2.headers['x-cache'], 'MISS')
  const r3 = await fastify.inject({ method: 'GET', url: '/data', headers: { accept: 'application/json' } })
  t.assert.equal(r3.headers['x-cache'], 'HIT')
})
