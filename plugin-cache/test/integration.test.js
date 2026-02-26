'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Fastify = require('../..')
const cachePlugin = require('..')

// @covers_ACFR_2_1 @covers_ACFR_5_7 @integration_test
test('multiple routes cached independently', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let aCount = 0
  let bCount = 0
  app.get('/a', { config: { cache: true } }, async () => { aCount++; return { route: 'a', n: aCount } })
  app.get('/b', { config: { cache: true } }, async () => { bCount++; return { route: 'b', n: bCount } })
  await app.ready()

  await app.inject({ method: 'GET', url: '/a' })
  await app.inject({ method: 'GET', url: '/b' })

  const hitA = await app.inject({ method: 'GET', url: '/a' })
  const hitB = await app.inject({ method: 'GET', url: '/b' })
  assert.equal(hitA.headers['x-cache'], 'HIT')
  assert.equal(hitB.headers['x-cache'], 'HIT')
  assert.equal(aCount, 1)
  assert.equal(bCount, 1)
  await app.close()
})

// @covers_ACFR_2_4 @integration_test
test('uncached route handler always runs, cached route uses cache', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let cachedCalls = 0
  let uncachedCalls = 0
  app.get('/cached', { config: { cache: true } }, async () => { cachedCalls++; return { cached: true } })
  app.get('/uncached', async () => { uncachedCalls++; return { uncached: true } })
  await app.ready()

  await app.inject({ method: 'GET', url: '/cached' })
  await app.inject({ method: 'GET', url: '/cached' })
  await app.inject({ method: 'GET', url: '/uncached' })
  await app.inject({ method: 'GET', url: '/uncached' })

  assert.equal(cachedCalls, 1)
  assert.equal(uncachedCalls, 2)
  await app.close()
})

// @covers_ACFR_4_5 @unit_test
test('If-None-Match with * returns 304', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/star', { config: { cache: true } }, async () => ({ data: 1 }))
  await app.ready()

  await app.inject({ method: 'GET', url: '/star' })
  const r = await app.inject({
    method: 'GET',
    url: '/star',
    headers: { 'if-none-match': '*' }
  })
  assert.equal(r.statusCode, 304)
  await app.close()
})

// @covers_ACFR_4_5 @unit_test
test('If-None-Match with non-matching ETag returns full 200 response', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/nomatch', { config: { cache: true } }, async () => ({ data: 1 }))
  await app.ready()

  await app.inject({ method: 'GET', url: '/nomatch' })
  const r = await app.inject({
    method: 'GET',
    url: '/nomatch',
    headers: { 'if-none-match': 'W/"badetag00000000"' }
  })
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['x-cache'], 'HIT')
  await app.close()
})

// @covers_ACFR_4_5 @unit_test
test('If-None-Match with comma-separated ETags checks all', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/multi-etag', { config: { cache: true } }, async () => ({ x: 1 }))
  await app.ready()

  const first = await app.inject({ method: 'GET', url: '/multi-etag' })
  const etag = first.headers['etag']

  const r = await app.inject({
    method: 'GET',
    url: '/multi-etag',
    headers: { 'if-none-match': 'W/"badone00000000", ' + etag }
  })
  assert.equal(r.statusCode, 304)
  await app.close()
})

// @covers_ACFR_3_3 @integration_test
test('vary header differences produce separate cache entries', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let n = 0
  app.get('/vary', { config: { cache: { vary: ['accept'] } } }, async () => { n++; return { n } })
  await app.ready()

  const r1 = await app.inject({ method: 'GET', url: '/vary', headers: { accept: 'application/json' } })
  const r2 = await app.inject({ method: 'GET', url: '/vary', headers: { accept: 'text/html' } })
  assert.equal(r1.headers['x-cache'], 'MISS')
  assert.equal(r2.headers['x-cache'], 'MISS')
  assert.equal(n, 2)

  const r3 = await app.inject({ method: 'GET', url: '/vary', headers: { accept: 'application/json' } })
  assert.equal(r3.headers['x-cache'], 'HIT')
  await app.close()
})

// @covers_ACFR_2_5 @unit_test
test('global and route vary headers are merged without duplicates', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { vary: ['accept'] })
  let n = 0
  app.get('/merge', { config: { cache: { vary: ['Accept', 'accept-language'] } } }, async () => {
    n++
    return { n }
  })
  await app.ready()

  const r1 = await app.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  assert.equal(r1.headers['x-cache'], 'MISS')

  const r2 = await app.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  assert.equal(r2.headers['x-cache'], 'HIT')
  assert.equal(n, 1, 'merged without duplicates, same key matches')

  const r3 = await app.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  assert.equal(r3.headers['x-cache'], 'MISS', 'different accept-language = different entry')
  await app.close()
})

// @covers_ACFR_5_3 @covers_ACFR_5_2 @integration_test
test('private Cache-Control response is not cached', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.get('/private', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'private')
    return { n: calls }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/private' })
  const r2 = await app.inject({ method: 'GET', url: '/private' })
  assert.equal(r2.headers['x-cache'], 'MISS')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_7_5 (request no-cache bypass) @integration_test
test('request Cache-Control: no-cache bypasses cache, stores fresh response', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.get('/nc', { config: { cache: true } }, async () => { calls++; return { n: calls } })
  await app.ready()

  await app.inject({ method: 'GET', url: '/nc' })
  const r2 = await app.inject({
    method: 'GET',
    url: '/nc',
    headers: { 'cache-control': 'no-cache' }
  })
  assert.equal(r2.headers['x-cache'], 'MISS', 'no-cache bypasses cache lookup')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_7_5 (request no-store bypass) @integration_test
test('request Cache-Control: no-store bypasses cache and does not store', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.get('/nst', { config: { cache: true } }, async () => { calls++; return { n: calls } })
  await app.ready()

  await app.inject({ method: 'GET', url: '/nst' })

  await app.inject({
    method: 'GET',
    url: '/nst',
    headers: { 'cache-control': 'no-store' }
  })
  assert.equal(calls, 2)

  const r3 = await app.inject({ method: 'GET', url: '/nst' })
  assert.equal(r3.headers['x-cache'], 'HIT', 'first MISS stored, no-store request bypassed but earlier entry still valid')
  await app.close()
})

// @covers_ACFR_7_3 (max-age TTL override) @unit_test
test('response Cache-Control: max-age overrides route TTL', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { ttl: 60000 })
  let calls = 0
  app.get('/maxage', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'max-age=0')
    return { n: calls }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/maxage' })
  await new Promise(resolve => setTimeout(resolve, 5))
  const r2 = await app.inject({ method: 'GET', url: '/maxage' })
  assert.equal(r2.headers['x-cache'], 'MISS', 'max-age=0 means expired immediately')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_7_4 (s-maxage priority) @unit_test
test('response Cache-Control: s-maxage takes priority over max-age', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { ttl: 60000 })
  let calls = 0
  app.get('/smaxage', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 's-maxage=0, max-age=3600')
    return { n: calls }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/smaxage' })
  await new Promise(resolve => setTimeout(resolve, 5))
  const r2 = await app.inject({ method: 'GET', url: '/smaxage' })
  assert.equal(r2.headers['x-cache'], 'MISS', 's-maxage=0 takes priority, entry expired')
  assert.equal(calls, 2)
  await app.close()
})
