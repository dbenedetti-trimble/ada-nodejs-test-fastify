'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('ETag is set on every cached response in W/"hex" format', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/etag', { config: { cache: true } }, async () => ({ data: 'hello' }))

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/etag' })
  t.assert.ok(res.headers.etag, 'ETag header present')
  t.assert.match(res.headers.etag, /^W\/"[0-9a-f]{16}"$/, 'ETag format is W/"16-char-hex"')
})

test('If-None-Match with matching ETag returns 304 with no body', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/conditional', { config: { cache: true } }, async () => {
    handlerCalls++
    return { data: 'value' }
  })

  await fastify.ready()

  // Prime the cache
  const r1 = await fastify.inject({ method: 'GET', url: '/conditional' })
  t.assert.strictEqual(r1.statusCode, 200)
  const etag = r1.headers.etag

  // Conditional request with matching ETag
  const r2 = await fastify.inject({
    method: 'GET',
    url: '/conditional',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(r2.statusCode, 304)
  t.assert.strictEqual(r2.body, '', 'no body on 304')
  t.assert.strictEqual(handlerCalls, 1, 'handler not called for conditional hit')
})

test('If-None-Match with non-matching ETag returns full cached response', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/full', { config: { cache: true } }, async () => ({ data: 'value' }))

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/full' })
  t.assert.strictEqual(r1.statusCode, 200)

  const r2 = await fastify.inject({
    method: 'GET',
    url: '/full',
    headers: { 'if-none-match': 'W/"aabbccdd11223344"' }
  })
  t.assert.strictEqual(r2.statusCode, 200, 'full response returned for mismatch')
  t.assert.strictEqual(r2.body, r1.body, 'body matches cached response')
})

test('If-None-Match: * returns 304 when any cached entry exists', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/wildcard', { config: { cache: true } }, async () => ({ data: 'x' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/wildcard' })

  const r = await fastify.inject({
    method: 'GET',
    url: '/wildcard',
    headers: { 'if-none-match': '*' }
  })
  t.assert.strictEqual(r.statusCode, 304)
  t.assert.strictEqual(r.body, '')
})

test('If-None-Match with multiple ETags checks all values', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/multi-etag', { config: { cache: true } }, async () => ({ data: 'multi' }))

  await fastify.ready()

  const r1 = await fastify.inject({ method: 'GET', url: '/multi-etag' })
  const etag = r1.headers.etag

  // Send two ETags in If-None-Match; one matches
  const r2 = await fastify.inject({
    method: 'GET',
    url: '/multi-etag',
    headers: { 'if-none-match': 'W/"000000000000dead", ' + etag }
  })
  t.assert.strictEqual(r2.statusCode, 304, '304 because one ETag matched')
  t.assert.strictEqual(r2.body, '')
})
