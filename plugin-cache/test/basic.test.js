'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Fastify = require('../..')
const cachePlugin = require('..')

// @covers_ACFR_1_1 @covers_ACAPI_1_1 @covers_ACAPI_1_2 @covers_ACAPI_1_3 @covers_ACAPI_1_4
test('registers without errors using defaults', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  await app.ready()
  assert.ok(app.cache, 'cache decorator exists')
  assert.equal(typeof app.cache.purge, 'function')
  assert.equal(typeof app.cache.purgeByPrefix, 'function')
  assert.equal(typeof app.cache.clear, 'function')
  assert.equal(typeof app.cache.stats, 'function')
  await app.close()
})

// @covers_ACFR_1_2 @covers_ACAPI_1_1 @covers_ACAPI_1_2
test('registers with custom options', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { maxItems: 50, ttl: 1000, methods: ['GET', 'POST'], vary: ['Accept'] })
  await app.ready()
  const s = app.cache.stats()
  assert.equal(s.maxItems, 50)
  await app.close()
})

// @covers_ACFR_1_3
test('throws if cache decorator already present', async (t) => {
  const app = Fastify()
  app.decorate('cache', {})
  await assert.rejects(
    () => app.register(cachePlugin).ready(),
    /FST_ERR_DEC_ALREADY_PRESENT/
  )
  await app.close()
})

// @covers_ACFR_1_4 @covers_ACTC_1_1 @covers_ACTC_1_2
test('cache decorator is visible to parent scope via fp wrapper', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  await app.ready()
  assert.ok(app.hasDecorator('cache'))
  await app.close()
})

// @covers_ACFR_1_5 @covers_ACFR_2_4
test('routes without config.cache are unaffected', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let handlerCalls = 0
  app.get('/no-cache', async () => {
    handlerCalls++
    return { ok: true }
  })
  await app.ready()
  const r1 = await app.inject({ method: 'GET', url: '/no-cache' })
  const r2 = await app.inject({ method: 'GET', url: '/no-cache' })
  assert.equal(handlerCalls, 2, 'handler called every time')
  assert.equal(r1.headers['x-cache'], undefined)
  assert.equal(r2.headers['x-cache'], undefined)
  await app.close()
})

// @covers_ACFR_2_1 @covers_ACFR_4_3 @covers_ACFR_4_4 @covers_ACFR_4_6 @covers_ACFR_4_7
// @covers_ACFR_5_1 @covers_ACFR_5_7 @covers_ACAPI_3_2 @covers_ACAPI_3_3
test('basic cache hit and miss with boolean shorthand', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { ttl: 60000 })
  let calls = 0
  app.get('/data', { config: { cache: true } }, async () => {
    calls++
    return { n: calls }
  })
  await app.ready()

  const miss = await app.inject({ method: 'GET', url: '/data' })
  assert.equal(miss.statusCode, 200)
  assert.equal(miss.headers['x-cache'], 'MISS')
  assert.equal(calls, 1)

  const hit = await app.inject({ method: 'GET', url: '/data' })
  assert.equal(hit.statusCode, 200)
  assert.equal(hit.headers['x-cache'], 'HIT')
  assert.equal(calls, 1, 'handler not called on cache hit')
  assert.deepEqual(JSON.parse(hit.body), { n: 1 })
  await app.close()
})

// @covers_ACFR_4_1 @covers_ACFR_4_2 @covers_ACFR_5_5
test('cache hit preserves status code and Content-Type', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/typed', { config: { cache: true } }, async (req, reply) => {
    reply.type('application/json')
    return { hello: 'world' }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/typed' })
  const hit = await app.inject({ method: 'GET', url: '/typed' })
  assert.equal(hit.statusCode, 200)
  assert.ok(hit.headers['content-type'].includes('application/json'))
  await app.close()
})

// @covers_ACFR_2_2
test('route-level ttl override', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { ttl: 60000 })
  let calls = 0
  app.get('/short', { config: { cache: { ttl: 1 } } }, async () => {
    calls++
    return { n: calls }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/short' })
  await new Promise(resolve => setTimeout(resolve, 10))
  const r2 = await app.inject({ method: 'GET', url: '/short' })
  assert.equal(r2.headers['x-cache'], 'MISS', 'entry expired with short TTL')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_2_3 @covers_ACFR_2_5 @covers_ACFR_3_3 @covers_ACFR_3_5
test('route-level vary headers merge with global vary', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { vary: ['accept-language'] })
  app.get('/v', { config: { cache: { vary: ['Accept'] } } }, async () => {
    return { ok: true }
  })
  await app.ready()

  const r1 = await app.inject({
    method: 'GET',
    url: '/v',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  assert.equal(r1.headers['x-cache'], 'MISS')

  const r2 = await app.inject({
    method: 'GET',
    url: '/v',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  assert.equal(r2.headers['x-cache'], 'HIT')

  const r3 = await app.inject({
    method: 'GET',
    url: '/v',
    headers: { accept: 'text/html', 'accept-language': 'en' }
  })
  assert.equal(r3.headers['x-cache'], 'MISS', 'different Accept = different entry')
  await app.close()
})

// @covers_ACFR_3_1 @covers_ACFR_3_4
test('same method+url+vary = cache hit; missing vary header treated as empty', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin, { vary: ['accept'] })
  app.get('/k', { config: { cache: true } }, async () => ({ ok: 1 }))
  await app.ready()

  const r1 = await app.inject({ method: 'GET', url: '/k' })
  assert.equal(r1.headers['x-cache'], 'MISS')

  const r2 = await app.inject({ method: 'GET', url: '/k' })
  assert.equal(r2.headers['x-cache'], 'HIT')
  await app.close()
})

// @covers_ACFR_3_2
test('different query strings produce different cache entries', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/qs', { config: { cache: true } }, async (req) => ({ q: req.query.page }))
  await app.ready()

  const r1 = await app.inject({ method: 'GET', url: '/qs?page=1' })
  const r2 = await app.inject({ method: 'GET', url: '/qs?page=2' })
  assert.equal(r1.headers['x-cache'], 'MISS')
  assert.equal(r2.headers['x-cache'], 'MISS')
  const r3 = await app.inject({ method: 'GET', url: '/qs?page=1' })
  assert.equal(r3.headers['x-cache'], 'HIT')
  await app.close()
})

// @covers_ACFR_4_5 @covers_ACAPI_3_1
test('If-None-Match with matching ETag returns 304', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/etag', { config: { cache: true } }, async () => ({ data: 42 }))
  await app.ready()

  const first = await app.inject({ method: 'GET', url: '/etag' })
  const etag = first.headers['etag']
  assert.ok(etag, 'ETag set on first response')
  assert.match(etag, /^W\/"[0-9a-f]{16}"$/)

  const conditional = await app.inject({
    method: 'GET',
    url: '/etag',
    headers: { 'if-none-match': etag }
  })
  assert.equal(conditional.statusCode, 304)
  assert.equal(conditional.body, '')
  await app.close()
})

// @covers_ACFR_5_2
test('non-2xx responses are not cached', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.get('/err', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.code(404)
    return { error: 'not found' }
  })
  await app.ready()

  const r1 = await app.inject({ method: 'GET', url: '/err' })
  const r2 = await app.inject({ method: 'GET', url: '/err' })
  assert.equal(r1.statusCode, 404)
  assert.equal(r2.headers['x-cache'], 'MISS', '404 responses not cached')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_5_4
test('POST responses are not cached', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.post('/data', { config: { cache: true } }, async () => {
    calls++
    return { ok: true }
  })
  await app.ready()

  await app.inject({ method: 'POST', url: '/data' })
  const r2 = await app.inject({ method: 'POST', url: '/data' })
  assert.equal(r2.headers['x-cache'], undefined, 'POST not cached')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_5_3
test('Cache-Control: no-store response is not cached', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  let calls = 0
  app.get('/ns', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-store')
    return { n: calls }
  })
  await app.ready()

  await app.inject({ method: 'GET', url: '/ns' })
  const r2 = await app.inject({ method: 'GET', url: '/ns' })
  assert.equal(r2.headers['x-cache'], 'MISS')
  assert.equal(calls, 2)
  await app.close()
})

// @covers_ACFR_5_6
test('ETag is set on first (MISS) response from onSend', async (t) => {
  const app = Fastify()
  await app.register(cachePlugin)
  app.get('/etag2', { config: { cache: true } }, async () => ({ hello: 1 }))
  await app.ready()

  const r = await app.inject({ method: 'GET', url: '/etag2' })
  assert.ok(r.headers['etag'], 'ETag header present on MISS response')
  await app.close()
})

// @covers_ACTC_3_1 @covers_ACNFR_1_1
test('plugin directory structure and zero runtime deps', async (t) => {
  const path = require('node:path')
  const fs = require('node:fs')
  const base = path.join(__dirname, '..')
  const required = [
    'index.js',
    'lib/lru-cache.js',
    'lib/cache-control.js',
    'lib/etag.js',
    'types/index.d.ts',
    'README.md',
    'package.json'
  ]
  for (const f of required) {
    assert.ok(fs.existsSync(path.join(base, f)), f + ' exists')
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'))
  const deps = Object.keys(pkg.dependencies || {})
  assert.equal(deps.length, 0, 'no runtime dependencies')
})
