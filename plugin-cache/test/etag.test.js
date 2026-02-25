'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')
const { generateETag, etagMatches } = require('../lib/etag')

test('generateETag produces W/"<16-hex>" format', (t) => {
  const etag = generateETag('hello world')
  t.assert.ok(etag.startsWith('W/"'), 'should start with W/"')
  t.assert.ok(etag.endsWith('"'), 'should end with "')
  const hash = etag.slice(3, -1)
  t.assert.strictEqual(hash.length, 16)
  t.assert.ok(/^[0-9a-f]{16}$/.test(hash), 'hash should be 16 hex chars')
})

test('generateETag is deterministic', (t) => {
  const a = generateETag('test data')
  const b = generateETag('test data')
  t.assert.strictEqual(a, b)
})

test('generateETag differs for different content', (t) => {
  const a = generateETag('content A')
  const b = generateETag('content B')
  t.assert.notStrictEqual(a, b)
})

test('etagMatches with exact match', (t) => {
  t.assert.ok(etagMatches('W/"abc123def456gh78"', 'W/"abc123def456gh78"'))
})

test('etagMatches with * wildcard', (t) => {
  t.assert.ok(etagMatches('*', 'W/"anything"'))
})

test('etagMatches with comma-separated list', (t) => {
  t.assert.ok(etagMatches('W/"aaa", W/"bbb", W/"ccc"', 'W/"bbb"'))
  t.assert.ok(!etagMatches('W/"aaa", W/"bbb"', 'W/"ccc"'))
})

test('etagMatches with no header', (t) => {
  t.assert.ok(!etagMatches(null, 'W/"abc"'))
  t.assert.ok(!etagMatches(undefined, 'W/"abc"'))
})

test('VAL-10: ETag conditional request returns 304', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  let handlerCalled = 0
  fastify.get('/etag', { config: { cache: true } }, async () => {
    handlerCalled++
    return { data: 'etag-test' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/etag' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalled, 1)
  const etag = res1.headers.etag
  t.assert.ok(etag)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/etag',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(res2.statusCode, 304)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.body, '')
  t.assert.strictEqual(handlerCalled, 1, 'handler should not run for 304')

  await fastify.close()
})

test('VAL-11: ETag mismatch returns full response', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/etag2', { config: { cache: true } }, async () => {
    return { data: 'etag-mismatch' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/etag2' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/etag2',
    headers: { 'if-none-match': 'W/"nonexistent12345"' }
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
  const body = res.json()
  t.assert.deepStrictEqual(body, { data: 'etag-mismatch' })

  await fastify.close()
})

test('If-None-Match with * returns 304 for any cached entry', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/star', { config: { cache: true } }, async () => {
    return { val: 1 }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/star' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/star',
    headers: { 'if-none-match': '*' }
  })
  t.assert.strictEqual(res.statusCode, 304)

  await fastify.close()
})

test('Multiple ETags in If-None-Match are all checked', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin)

  fastify.get('/multi-etag', { config: { cache: true } }, async () => {
    return { multi: true }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/multi-etag' })
  const etag = res1.headers.etag

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/multi-etag',
    headers: { 'if-none-match': `W/"wrong1234567890", ${etag}, W/"wrong2345678901"` }
  })
  t.assert.strictEqual(res2.statusCode, 304)

  await fastify.close()
})
