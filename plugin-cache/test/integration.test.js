'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('Vary header produces different cache entries per value', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', {
    config: { cache: { vary: ['Accept'] } }
  }, async (req) => {
    return { format: req.headers.accept || 'none' }
  })

  await fastify.ready()

  const r1 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  const r2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS', 'different Accept = different entry')

  // Repeat application/json — hit
  const r3 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(r3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(r3.body, r1.body, 'body matches')

  t.assert.strictEqual(fastify.cache.stats().items, 2)
})

test('route-level vary headers merged with global vary headers', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { vary: ['accept-encoding'] })

  fastify.get('/merged', {
    config: { cache: { vary: ['Accept'] } }
  }, async (req) => {
    return { ok: true }
  })

  await fastify.ready()

  const r1 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-encoding': 'gzip' }
  })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  // Same global vary, different route vary — different entry
  const r2 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'text/html', 'accept-encoding': 'gzip' }
  })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS')

  // Hit for original combination
  const r3 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-encoding': 'gzip' }
  })
  t.assert.strictEqual(r3.headers['x-cache'], 'HIT')
})

test('non-GET requests are not cached (POST)', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.post('/create', { config: { cache: true } }, async () => {
    calls++
    return { created: true }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'POST', url: '/create' })
  t.assert.strictEqual(r1.statusCode, 200)
  t.assert.strictEqual(r1.headers['x-cache'], undefined, 'no X-Cache for POST')

  await fastify.inject({ method: 'POST', url: '/create' })
  t.assert.strictEqual(calls, 2, 'handler called twice — not cached')
})

test('non-2xx responses are not cached', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let calls = 0
  fastify.get('/maybe', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.code(404)
    return { error: 'not found' }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/maybe' })
  t.assert.strictEqual(r1.statusCode, 404)

  const r2 = await fastify.inject({ method: 'GET', url: '/maybe' })
  t.assert.strictEqual(r2.statusCode, 404)
  t.assert.strictEqual(calls, 2, 'handler called twice — 404 not cached')
})

test('custom methods option: PUT is cached when configured', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin, { methods: ['GET', 'PUT'] })

  let calls = 0
  fastify.put('/resource', { config: { cache: true } }, async () => {
    calls++
    return { ok: true }
  })

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'PUT', url: '/resource' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  const r2 = await fastify.inject({ method: 'PUT', url: '/resource' })
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(calls, 1)
})

test('missing Vary header in request treated as empty string', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/vary-missing', {
    config: { cache: { vary: ['Accept'] } }
  }, async () => ({ ok: true }))

  await fastify.ready()

  // No Accept header — treated as empty string
  await fastify.inject({ method: 'GET', url: '/vary-missing' })
  const r = await fastify.inject({ method: 'GET', url: '/vary-missing' })
  t.assert.strictEqual(r.headers['x-cache'], 'HIT', 'consistent key for missing header')
  t.assert.strictEqual(fastify.cache.stats().items, 1)
})
