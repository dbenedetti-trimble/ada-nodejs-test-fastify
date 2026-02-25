'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { generateETag } = require('../lib/etag')

test('@covers_ACFR_9_1 @unit_test: ETag is set on every cached response (W/"16-char-hex" format)', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/data', {
    config: { cache: true }
  }, () => {
    return { message: 'hello' }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/data' })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(res.headers.etag, 'ETag header is present')
  t.assert.ok(res.headers.etag.startsWith('W/"'), 'ETag is weak format')
  t.assert.match(res.headers.etag, /^W\/"[a-f0-9]{16}"$/, 'ETag matches W/"16-char-hex" format')

  await fastify.close()
})

test('@covers_ACFR_9_2 @unit_test: If-None-Match with matching ETag returns 304 with no body', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/resource', {
    config: { cache: true }
  }, () => {
    return { data: 'content' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/resource' })
  const etag = res1.headers.etag
  t.assert.ok(etag, 'First request returns ETag')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/resource',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(res2.statusCode, 304, '304 Not Modified returned')
  t.assert.strictEqual(res2.body, '', 'No response body')
  t.assert.strictEqual(res2.headers.etag, etag, 'ETag header still present')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'Response served from cache')

  await fastify.close()
})

test('@covers_ACFR_9_3 @unit_test: If-None-Match with non-matching ETag returns full cached response (200)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/resource', {
    config: { cache: true }
  }, () => {
    return { data: 'content' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/resource' })
  t.assert.ok(res1.headers.etag, 'First request returns ETag')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/resource',
    headers: { 'if-none-match': 'W/"0000000000000000"' }
  })

  t.assert.strictEqual(res2.statusCode, 200, '200 OK returned for non-matching ETag')
  t.assert.deepStrictEqual(res2.json(), { data: 'content' }, 'Full response body returned')
  t.assert.ok(res2.headers.etag, 'ETag header present')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'Response served from cache')

  await fastify.close()
})

test('@covers_ACFR_9_4 @unit_test: If-None-Match with * value returns 304 if any cached response exists for the route', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/exists', {
    config: { cache: true }
  }, () => {
    return { data: 'test' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/exists' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/exists',
    headers: { 'if-none-match': '*' }
  })

  t.assert.strictEqual(res.statusCode, 304, '304 returned for wildcard If-None-Match')
  t.assert.strictEqual(res.body, '', 'No response body')
  t.assert.ok(res.headers.etag, 'ETag header present')
  t.assert.strictEqual(res.headers['x-cache'], 'HIT', 'Response served from cache')

  await fastify.close()
})

test('@covers_ACFR_9_5 @unit_test: Multiple ETags in If-None-Match (comma-separated) are all checked', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/multi', {
    config: { cache: true }
  }, () => {
    return { data: 'value' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/multi' })
  const correctEtag = res1.headers.etag
  t.assert.ok(correctEtag)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': 'W/"aaaaaaaaaaaaaaaa", W/"bbbbbbbbbbbbbbbb"' }
  })
  t.assert.strictEqual(res2.statusCode, 200, 'Returns 200 when no ETags match')
  t.assert.deepStrictEqual(res2.json(), { data: 'value' })

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': `W/"aaaaaaaaaaaaaaaa", ${correctEtag}, W/"bbbbbbbbbbbbbbbb"` }
  })
  t.assert.strictEqual(res3.statusCode, 304, 'Returns 304 when one ETag matches (middle)')
  t.assert.strictEqual(res3.body, '')

  const res4 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': `${correctEtag}, W/"bbbbbbbbbbbbbbbb", W/"cccccccccccccccc"` }
  })
  t.assert.strictEqual(res4.statusCode, 304, 'Returns 304 when one ETag matches (first)')
  t.assert.strictEqual(res4.body, '')

  await fastify.close()
})

test('@covers_ACFR_9_1 @unit_test: ETag generation utility produces correct format', async (t) => {
  t.plan(6)

  const etag1 = generateETag('test string')
  t.assert.ok(etag1.startsWith('W/"'), 'String input produces weak ETag')
  t.assert.match(etag1, /^W\/"[a-f0-9]{16}"$/, 'String ETag matches format')

  const etag2 = generateETag({ key: 'value' })
  t.assert.ok(etag2.startsWith('W/"'), 'Object input produces weak ETag')
  t.assert.match(etag2, /^W\/"[a-f0-9]{16}"$/, 'Object ETag matches format')

  const etag3 = generateETag('test string')
  t.assert.strictEqual(etag1, etag3, 'Same input produces same ETag')

  const etag4 = generateETag('different')
  t.assert.notStrictEqual(etag1, etag4, 'Different input produces different ETag')
})

test('@covers_ACFR_9_2 @covers_ACFR_9_3 @unit_test: ETag comparison handles spaces in If-None-Match', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/spaces', {
    config: { cache: true }
  }, () => {
    return { test: 'data' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/spaces' })
  const etag = res1.headers.etag
  t.assert.ok(etag)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/spaces',
    headers: { 'if-none-match': `  ${etag}  , W/"other"  ` }
  })
  t.assert.strictEqual(res2.statusCode, 304, '304 returned even with spaces around ETags')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/spaces',
    headers: { 'if-none-match': 'W/"wrong1" , W/"wrong2"' }
  })
  t.assert.strictEqual(res3.statusCode, 200, '200 returned when no ETags match')
  t.assert.deepStrictEqual(res3.json(), { test: 'data' })

  await fastify.close()
})

test('@covers_ACFR_9_1 @unit_test: ETag persists through cache hits', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let callCount = 0
  fastify.get('/persist', {
    config: { cache: true }
  }, () => {
    callCount++
    return { count: callCount }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/persist' })
  const etag1 = res1.headers.etag
  t.assert.ok(etag1, 'ETag set on first request')
  t.assert.strictEqual(callCount, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/persist' })
  const etag2 = res2.headers.etag
  t.assert.ok(etag2, 'ETag set on cached response')
  t.assert.strictEqual(etag1, etag2, 'ETag unchanged for cached response')
  t.assert.strictEqual(callCount, 1, 'Handler not called on cache hit')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_9_2 @unit_test: If-None-Match without cached entry still runs handler', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/no-cache', {
    config: { cache: true }
  }, () => {
    return { fresh: 'data' }
  })

  await fastify.ready()

  const res = await fastify.inject({
    method: 'GET',
    url: '/no-cache',
    headers: { 'if-none-match': 'W/"nonexistent"' }
  })

  t.assert.strictEqual(res.statusCode, 200, 'Returns 200 when no cache entry exists')
  t.assert.deepStrictEqual(res.json(), { fresh: 'data' })
  t.assert.strictEqual(res.headers['x-cache'], 'MISS')

  await fastify.close()
})
