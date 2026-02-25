'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_4_1 @unit_test - Cache hit serves the stored response body with original status code', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { message: 'Hello, cached world!' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')
  t.assert.deepStrictEqual(firstResponse.json(), { message: 'Hello, cached world!' })

  const secondResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(secondResponse.statusCode, 200, 'Status code preserved from cache')
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(secondResponse.json(), { message: 'Hello, cached world!' }, 'Body preserved from cache')

  await fastify.close()
})

test('@covers_ACFR_4_1 @unit_test - Cache hit preserves custom status codes', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/custom-status', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(201)
    return { created: true }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/custom-status' })
  t.assert.strictEqual(firstResponse.statusCode, 201)
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')

  const secondResponse = await fastify.inject({ url: '/custom-status' })
  t.assert.strictEqual(secondResponse.statusCode, 201, 'Custom status code (201) preserved from cache')
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(secondResponse.json(), { created: true })

  await fastify.close()
})

test('@covers_ACFR_4_2 @unit_test - Cache hit preserves the original Content-Type header', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/json', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.type('application/json')
    return { type: 'json' }
  })

  fastify.get('/text', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.type('text/plain')
    return 'plain text'
  })

  await fastify.listen({ port: 0 })

  const firstJsonResponse = await fastify.inject({ url: '/json' })
  t.assert.strictEqual(firstJsonResponse.headers['content-type'], 'application/json; charset=utf-8')

  const secondJsonResponse = await fastify.inject({ url: '/json' })
  t.assert.strictEqual(secondJsonResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(secondJsonResponse.headers['content-type'], 'application/json; charset=utf-8', 'Content-Type preserved')

  const firstTextResponse = await fastify.inject({ url: '/text' })
  const firstTextContentType = firstTextResponse.headers['content-type']
  t.assert.ok(firstTextContentType.startsWith('text/plain'), 'Content-Type starts with text/plain')

  const secondTextResponse = await fastify.inject({ url: '/text' })
  t.assert.strictEqual(secondTextResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(secondTextResponse.headers['content-type'], firstTextContentType, 'Custom Content-Type preserved')

  await fastify.close()
})

test('@covers_ACFR_4_3 @unit_test - Cache hit sets X-Cache: HIT response header', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/test' })

  const hitResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(hitResponse.headers['x-cache'], 'HIT', 'X-Cache header is HIT on cache hit')

  await fastify.close()
})

test('@covers_ACFR_4_4 @unit_test - Cache miss sets X-Cache: MISS response header', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(missResponse.headers['x-cache'], 'MISS', 'X-Cache header is MISS on cache miss')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test - Cache hit with matching If-None-Match returns 304 with no body', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  const etag = firstResponse.headers.etag
  t.assert.ok(etag, 'ETag header present on first response')

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Returns 304 Not Modified')
  t.assert.strictEqual(conditionalResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(conditionalResponse.body, '', 'Response body is empty')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test - Cache hit with non-matching If-None-Match returns full response', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/test' })

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: { 'if-none-match': 'W/"different-etag"' }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 200, 'Returns 200 OK')
  t.assert.strictEqual(conditionalResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(conditionalResponse.json(), { data: 'test' }, 'Response body is present')

  await fastify.close()
})

test('@covers_ACFR_4_5 @unit_test - Cache hit with wildcard If-None-Match returns 304', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/test' })

  const conditionalResponse = await fastify.inject({
    url: '/test',
    headers: { 'if-none-match': '*' }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, 'Returns 304 for wildcard ETag')
  t.assert.strictEqual(conditionalResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(conditionalResponse.body, '', 'Response body is empty')

  await fastify.close()
})

test('@covers_ACFR_4_6 @unit_test - Cache hit skips the route handler entirely', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let handlerCallCount = 0

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    handlerCallCount++
    return { callNumber: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(handlerCallCount, 1, 'Handler called on first request (MISS)')
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')
  t.assert.deepStrictEqual(firstResponse.json(), { callNumber: 1 })

  const secondResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(handlerCallCount, 1, 'Handler NOT called on second request (HIT)')
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(secondResponse.json(), { callNumber: 1 }, 'Cached response returned')

  const thirdResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(handlerCallCount, 1, 'Handler still NOT called on third request (HIT)')
  t.assert.strictEqual(thirdResponse.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_4_7 @unit_test - Cache miss runs the route handler normally', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let handlerCallCount = 0

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    handlerCallCount++
    return { message: 'Handler executed', callNumber: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/test' })

  t.assert.strictEqual(handlerCallCount, 1, 'Handler called on cache miss')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(response.headers['x-cache'], 'MISS')
  t.assert.deepStrictEqual(response.json(), { message: 'Handler executed', callNumber: 1 })

  await fastify.close()
})

test('@covers_ACFR_4_6 @covers_ACFR_4_7 @integration_test - Handler execution: cache miss vs cache hit comparison', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  const handlerCallTimestamps = []

  fastify.get('/counter', {
    config: { cache: true }
  }, async () => {
    handlerCallCount++
    handlerCallTimestamps.push(Date.now())
    return { count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/counter' })
  t.assert.strictEqual(missResponse.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1, 'Handler called once on MISS')

  const hitResponse1 = await fastify.inject({ url: '/counter' })
  t.assert.strictEqual(hitResponse1.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCallCount, 1, 'Handler NOT called again on HIT')
  t.assert.deepStrictEqual(hitResponse1.json(), { count: 1 }, 'Cached value returned')

  const hitResponse2 = await fastify.inject({ url: '/counter' })
  t.assert.strictEqual(hitResponse2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCallCount, 1, 'Handler still NOT called')
  t.assert.deepStrictEqual(hitResponse2.json(), { count: 1 }, 'Same cached value returned')

  t.assert.strictEqual(handlerCallTimestamps.length, 1, 'Handler executed exactly once')

  await fastify.close()
})

test('@covers_ACFR_4_1 @covers_ACFR_4_2 @covers_ACFR_4_3 @integration_test - Complete cache hit flow with all headers', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/full-test', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(200)
    reply.type('application/json')
    return { message: 'Complete test', timestamp: Date.now() }
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/full-test' })
  t.assert.strictEqual(missResponse.statusCode, 200)
  t.assert.strictEqual(missResponse.headers['x-cache'], 'MISS')
  t.assert.ok(missResponse.headers.etag, 'ETag present')
  t.assert.ok(missResponse.headers['content-type'].includes('application/json'), 'Content-Type present')
  const missBody = missResponse.json()
  t.assert.ok(missBody.message, 'Response body present')

  const hitResponse = await fastify.inject({ url: '/full-test' })
  t.assert.strictEqual(hitResponse.statusCode, 200, 'Status code preserved')
  t.assert.strictEqual(hitResponse.headers['x-cache'], 'HIT', 'X-Cache is HIT')
  t.assert.strictEqual(hitResponse.headers.etag, missResponse.headers.etag, 'ETag preserved')
  t.assert.strictEqual(hitResponse.headers['content-type'], missResponse.headers['content-type'], 'Content-Type preserved')
  t.assert.deepStrictEqual(hitResponse.json(), missBody, 'Body preserved exactly')

  await fastify.close()
})

test('@covers_ACFR_4_5 @covers_ACFR_4_6 @integration_test - Conditional request with 304 skips handler', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let handlerCallCount = 0

  fastify.get('/conditional', {
    config: { cache: true }
  }, async () => {
    handlerCallCount++
    return { data: 'expensive computation' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/conditional' })
  t.assert.strictEqual(handlerCallCount, 1, 'Handler called on first request')
  const etag = firstResponse.headers.etag

  const conditionalResponse = await fastify.inject({
    url: '/conditional',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(conditionalResponse.statusCode, 304, '304 returned')
  t.assert.strictEqual(conditionalResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCallCount, 1, 'Handler NOT called for 304 response')
  t.assert.strictEqual(conditionalResponse.body, '', 'No body in 304 response')

  await fastify.close()
})

test('@covers_ACFR_4_4 @covers_ACFR_4_7 @unit_test - Multiple cache misses each execute handler', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let handlerCallCount = 0

  fastify.get('/dynamic/:id', {
    config: { cache: true }
  }, async (request) => {
    handlerCallCount++
    return { id: request.params.id, callCount: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const response1 = await fastify.inject({ url: '/dynamic/1' })
  t.assert.strictEqual(response1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const response2 = await fastify.inject({ url: '/dynamic/2' })
  t.assert.strictEqual(response2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 2, 'Different URL causes cache miss and handler execution')

  const response3 = await fastify.inject({ url: '/dynamic/3' })
  t.assert.strictEqual(response3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 3, 'Each unique URL executes handler')

  await fastify.close()
})

test('@covers_ACFR_4_3 @covers_ACFR_4_6 @unit_test - ETag header present on cache hit', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/test' })
  const originalEtag = missResponse.headers.etag
  t.assert.ok(originalEtag, 'ETag present on MISS')

  const hitResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(hitResponse.headers['x-cache'], 'HIT')
  t.assert.strictEqual(hitResponse.headers.etag, originalEtag, 'ETag preserved on HIT')

  await fastify.close()
})

test('@covers_ACFR_4_1 @covers_ACFR_4_2 @integration_test - Cache preserves response with complex body', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  const complexData = {
    user: { id: 123, name: 'Test User', roles: ['admin', 'user'] },
    metadata: { version: '1.0', timestamp: 1234567890 },
    items: [{ id: 1, value: 'a' }, { id: 2, value: 'b' }]
  }

  fastify.get('/complex', {
    config: { cache: true }
  }, async () => {
    return complexData
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/complex' })
  t.assert.strictEqual(missResponse.headers['x-cache'], 'MISS')
  t.assert.deepStrictEqual(missResponse.json(), complexData)

  const hitResponse = await fastify.inject({ url: '/complex' })
  t.assert.strictEqual(hitResponse.statusCode, 200, 'Status code preserved')
  t.assert.strictEqual(hitResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(hitResponse.json(), complexData, 'Complex body preserved exactly')

  await fastify.close()
})
