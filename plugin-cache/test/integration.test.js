'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('multiple cached routes work independently', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/r1', { config: { cache: true } }, async () => ({ r: 1 }))
  fastify.get('/r2', { config: { cache: { ttl: 30000 } } }, async () => ({ r: 2 }))
  fastify.get('/r3', async () => ({ r: 3 }))

  await fastify.ready()

  const res1a = await fastify.inject({ method: 'GET', url: '/r1' })
  t.assert.strictEqual(res1a.headers['x-cache'], 'MISS')

  const res1b = await fastify.inject({ method: 'GET', url: '/r1' })
  t.assert.strictEqual(res1b.headers['x-cache'], 'HIT')

  const res2a = await fastify.inject({ method: 'GET', url: '/r2' })
  t.assert.strictEqual(res2a.headers['x-cache'], 'MISS')

  const res2b = await fastify.inject({ method: 'GET', url: '/r2' })
  t.assert.strictEqual(res2b.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({ method: 'GET', url: '/r3' })
  t.assert.strictEqual(res3.headers['x-cache'], undefined)

  t.assert.strictEqual(fastify.cache.stats().items, 2)

  await fastify.close()
})

test('global vary headers are merged with route vary headers', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { vary: ['Accept-Language'] })

  let handlerCalled = 0
  fastify.get('/merged', {
    config: { cache: { vary: ['Accept'] } }
  }, async () => {
    handlerCalled++
    return { merged: true }
  })

  await fastify.ready()

  // Request with specific Accept and Accept-Language
  await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(handlerCalled, 1)

  // Same headers - HIT
  const res2 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 1)

  // Different Accept-Language - MISS (global vary)
  const res3 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  // Different Accept - MISS (route vary)
  const res4 = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'text/html', 'accept-language': 'en' }
  })
  t.assert.strictEqual(res4.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 3)

  await fastify.close()
})

test('cache preserves content-type header', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/ct', { config: { cache: true } }, async (request, reply) => {
    reply.type('text/plain')
    return 'plain text response'
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/ct' })
  t.assert.ok(res1.headers['content-type'].includes('text/plain'))
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/ct' })
  t.assert.ok(res2.headers['content-type'].includes('text/plain'))
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('missing vary header in request treated as empty string', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/vary-missing', {
    config: { cache: { vary: ['X-Custom'] } }
  }, async () => {
    handlerCalled++
    return { ok: true }
  })

  await fastify.ready()

  // No X-Custom header
  await fastify.inject({ method: 'GET', url: '/vary-missing' })
  t.assert.strictEqual(handlerCalled, 1)

  // Same (no X-Custom) - HIT
  const res = await fastify.inject({ method: 'GET', url: '/vary-missing' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 1)

  // With X-Custom - MISS
  const res3 = await fastify.inject({
    method: 'GET',
    url: '/vary-missing',
    headers: { 'x-custom': 'value' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCalled, 2)

  await fastify.close()
})

test('cache hit skips handler entirely', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let sideEffect = 0
  fastify.get('/skip', { config: { cache: true } }, async () => {
    sideEffect++
    return { effect: sideEffect }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(sideEffect, 1)

  await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(sideEffect, 1, 'handler should not run on HIT')

  await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(sideEffect, 1, 'handler should still not run')

  await fastify.close()
})

test('ETag header is set on cached responses and cache hits', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/etag-set', { config: { cache: true } }, async () => {
    return { data: 'etag' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/etag-set' })
  t.assert.ok(res1.headers.etag, 'ETag should be set on MISS')
  t.assert.ok(res1.headers.etag.startsWith('W/"'))

  const res2 = await fastify.inject({ method: 'GET', url: '/etag-set' })
  t.assert.ok(res2.headers.etag, 'ETag should be set on HIT')
  t.assert.strictEqual(res1.headers.etag, res2.headers.etag)

  await fastify.close()
})

test('JSON response body is correctly cached and restored', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  const payload = { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], total: 2 }
  fastify.get('/json', { config: { cache: true } }, async () => {
    return payload
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/json' })
  const res2 = await fastify.inject({ method: 'GET', url: '/json' })
  t.assert.deepStrictEqual(res1.json(), payload)
  t.assert.deepStrictEqual(res2.json(), payload)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('duplicate vary headers are deduplicated', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { vary: ['accept'] })

  let handlerCalled = 0
  fastify.get('/dedup', {
    config: { cache: { vary: ['Accept'] } }
  }, async () => {
    handlerCalled++
    return { ok: true }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/dedup',
    headers: { accept: 'text/html' }
  })
  const res = await fastify.inject({
    method: 'GET',
    url: '/dedup',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCalled, 1)

  await fastify.close()
})
