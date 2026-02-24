'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_9_1 - ETag is set on every cached response (W/"16-char-hex" format)', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test response' }
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/test' })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(response.headers.etag, 'ETag header is present')
  t.assert.match(response.headers.etag, /^W\/"[0-9a-f]{16}"$/, 'ETag format is W/"16-char-hex"')

  await fastify.close()
})

test('@covers_ACFR_9_2 - If-None-Match with matching ETag returns 304 with no body', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test response' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  const etag = firstResponse.headers.etag
  t.assert.ok(etag, 'First response has ETag')

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': etag
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Returns 304 Not Modified')
  t.assert.strictEqual(conditionalResponse.headers.etag, etag, 'ETag header still present')
  t.assert.strictEqual(conditionalResponse.body, '', 'Response body is empty')

  await fastify.close()
})

test('@covers_ACFR_9_3 - If-None-Match with non-matching ETag returns full cached response (200)', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test response' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  const etag = firstResponse.headers.etag

  const wrongEtag = 'W/"0000000000000000"'
  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': wrongEtag
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 200, 'Returns 200 OK')
  t.assert.strictEqual(conditionalResponse.headers.etag, etag, 'Returns correct ETag')
  t.assert.deepStrictEqual(conditionalResponse.json(), { data: 'test response' }, 'Full response body returned')

  await fastify.close()
})

test('@covers_ACFR_9_4 - If-None-Match with * value returns 304 if any cached response exists for the route', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test response' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.ok(firstResponse.headers.etag, 'First response has ETag')

  const wildcardResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': '*'
    }
  })

  t.assert.strictEqual(wildcardResponse.statusCode, 304, 'Returns 304 Not Modified with wildcard')
  t.assert.strictEqual(wildcardResponse.body, '', 'Response body is empty')

  await fastify.close()
})

test('@covers_ACFR_9_5 - Multiple ETags in If-None-Match (comma-separated) are all checked', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test response' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  const etag = firstResponse.headers.etag

  const multipleEtags = `W/"0000000000000000", ${etag}, W/"1111111111111111"`
  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': multipleEtags
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Returns 304 when one ETag matches')
  t.assert.strictEqual(conditionalResponse.body, '', 'Response body is empty')

  await fastify.close()
})

test('ETag generation produces consistent hashes for identical bodies', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'consistent data' }
  })

  await fastify.listen({ port: 0 })

  fastify.cache.clear()

  const response1 = await fastify.inject({ url: '/test' })
  const etag1 = response1.headers.etag

  fastify.cache.clear()

  const response2 = await fastify.inject({ url: '/test' })
  const etag2 = response2.headers.etag

  t.assert.strictEqual(etag1, etag2, 'ETags are consistent for identical responses')

  await fastify.close()
})

test('ETag generation produces different hashes for different bodies', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  let counter = 0
  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: `response ${counter++}` }
  })

  await fastify.listen({ port: 0 })

  const response1 = await fastify.inject({ url: '/test' })
  const etag1 = response1.headers.etag

  fastify.cache.clear()

  const response2 = await fastify.inject({ url: '/test' })
  const etag2 = response2.headers.etag

  t.assert.notStrictEqual(etag1, etag2, 'ETags are different for different responses')

  await fastify.close()
})

test('ETag works with string response bodies', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async (request, reply) => {
    reply.type('text/plain')
    return 'plain text response'
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/test' })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(response.headers.etag, 'ETag header is present for string response')
  t.assert.match(response.headers.etag, /^W\/"[0-9a-f]{16}"$/, 'ETag format is correct')

  await fastify.close()
})

test('304 response includes ETag header but no body', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { large: 'response with lots of data'.repeat(100) }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  const etag = firstResponse.headers.etag
  const bodyLength = firstResponse.body.length

  t.assert.ok(bodyLength > 0, 'First response has body content')

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': etag
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304)
  t.assert.strictEqual(conditionalResponse.headers.etag, etag, 'ETag header present in 304')
  t.assert.strictEqual(conditionalResponse.body, '', '304 response has no body')
  t.assert.ok(conditionalResponse.headers['x-cache'], 'X-Cache header present')

  await fastify.close()
})

test('If-None-Match header is case-insensitive', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  const etag = firstResponse.headers.etag

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'If-None-Match': etag
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Works with capitalized header name')

  await fastify.close()
})

test('ETag conditional requests work with cache hits', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0
  fastify.get('/test', { config: { cache: true } }, async () => {
    handlerCallCount++
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  const etag = firstResponse.headers.etag
  t.assert.strictEqual(handlerCallCount, 1, 'Handler called once for miss')

  const cachedResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(cachedResponse.statusCode, 200)
  t.assert.strictEqual(handlerCallCount, 1, 'Handler not called for cache hit')
  t.assert.strictEqual(cachedResponse.headers.etag, etag, 'Same ETag on cache hit')

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: {
      'if-none-match': etag
    }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Returns 304 from cached entry')
  t.assert.strictEqual(handlerCallCount, 1, 'Handler still not called')
  t.assert.strictEqual(conditionalResponse.headers.etag, etag, 'ETag preserved in 304')

  await fastify.close()
})
