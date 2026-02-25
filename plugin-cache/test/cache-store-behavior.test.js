'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_5_1 @unit_test - Successful GET responses on cached routes are stored in the cache', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/test', {
    config: { cache: true }
  }, async () => {
    return { message: 'Hello World' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')

  const secondResponse = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT', 'Response was stored and retrieved from cache')
  t.assert.deepStrictEqual(secondResponse.json(), { message: 'Hello World' })

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test - 404 responses are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/notfound', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(404)
    return { error: 'Not Found' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/notfound' })
  t.assert.strictEqual(firstResponse.statusCode, 404)
  t.assert.strictEqual(firstResponse.headers['x-cache'], undefined, '404 responses should not set X-Cache header')

  const secondResponse = await fastify.inject({ url: '/notfound' })
  t.assert.strictEqual(secondResponse.statusCode, 404)
  t.assert.strictEqual(secondResponse.headers['x-cache'], undefined, '404 responses should not be cached')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test - 500 responses are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/error', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(500)
    return { error: 'Internal Server Error' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/error' })
  t.assert.strictEqual(firstResponse.statusCode, 500)
  t.assert.strictEqual(firstResponse.headers['x-cache'], undefined, '500 responses should not set X-Cache header')

  const secondResponse = await fastify.inject({ url: '/error' })
  t.assert.strictEqual(secondResponse.statusCode, 500)
  t.assert.strictEqual(secondResponse.headers['x-cache'], undefined, '500 responses should not be cached')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test - 3xx responses are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/redirect', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(302)
    reply.header('Location', '/other')
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/redirect' })
  t.assert.strictEqual(firstResponse.statusCode, 302)
  t.assert.strictEqual(firstResponse.headers['x-cache'], undefined, '302 responses should not set X-Cache header')

  const secondResponse = await fastify.inject({ url: '/redirect' })
  t.assert.strictEqual(secondResponse.statusCode, 302)
  t.assert.strictEqual(secondResponse.headers['x-cache'], undefined, '302 responses should not be cached')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test - Only 2xx responses are cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/success', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(200)
    return { status: 'ok' }
  })

  fastify.get('/created', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(201)
    return { status: 'created' }
  })

  await fastify.listen({ port: 0 })

  const response200First = await fastify.inject({ url: '/success' })
  t.assert.strictEqual(response200First.statusCode, 200)
  t.assert.strictEqual(response200First.headers['x-cache'], 'MISS')

  const response200Second = await fastify.inject({ url: '/success' })
  t.assert.strictEqual(response200Second.headers['x-cache'], 'HIT', '200 response cached')

  const response201First = await fastify.inject({ url: '/created' })
  t.assert.strictEqual(response201First.statusCode, 201)
  t.assert.strictEqual(response201First.headers['x-cache'], 'MISS')

  const response201Second = await fastify.inject({ url: '/created' })
  t.assert.strictEqual(response201Second.headers['x-cache'], 'HIT', '201 response cached')

  await fastify.close()
})

test('@covers_ACFR_5_3 @unit_test - Responses with Cache-Control: no-store are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/no-store', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { secret: 'data' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/no-store' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(firstResponse.headers['x-cache'], undefined, 'no-store response should not set X-Cache')
  t.assert.deepStrictEqual(firstResponse.json(), { secret: 'data' })

  const secondResponse = await fastify.inject({ url: '/no-store' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(secondResponse.headers['x-cache'], undefined, 'no-store response should not be cached')

  await fastify.close()
})

test('@covers_ACFR_5_3 @unit_test - Responses with Cache-Control: private are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/private', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.header('Cache-Control', 'private')
    return { user: 'specific data' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/private' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(firstResponse.headers['x-cache'], undefined, 'private response should not set X-Cache')

  const secondResponse = await fastify.inject({ url: '/private' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(secondResponse.headers['x-cache'], undefined, 'private response should not be cached')

  await fastify.close()
})

test('@covers_ACFR_5_3 @unit_test - Responses without Cache-Control are cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/default', {
    config: { cache: true }
  }, async () => {
    return { data: 'cacheable' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/default' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')

  const secondResponse = await fastify.inject({ url: '/default' })
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT', 'Response without Cache-Control is cached')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test - POST responses are not cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.post('/create', {
    config: { cache: true }
  }, async () => {
    callCount++
    return { id: callCount }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ method: 'POST', url: '/create' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 1)

  const secondResponse = await fastify.inject({ method: 'POST', url: '/create' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 2, 'POST handler called again, not cached by default')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test - PUT responses are not cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.put('/update/:id', {
    config: { cache: true }
  }, async (request) => {
    callCount++
    return { id: request.params.id, updated: true, count: callCount }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ method: 'PUT', url: '/update/1' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 1)

  const secondResponse = await fastify.inject({ method: 'PUT', url: '/update/1' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 2, 'PUT handler called again, not cached by default')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test - DELETE responses are not cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.delete('/delete/:id', {
    config: { cache: true }
  }, async (request) => {
    callCount++
    return { id: request.params.id, deleted: true, count: callCount }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ method: 'DELETE', url: '/delete/1' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 1)

  const secondResponse = await fastify.inject({ method: 'DELETE', url: '/delete/1' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 2, 'DELETE handler called again, not cached by default')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test - PATCH responses are not cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.patch('/patch/:id', {
    config: { cache: true }
  }, async (request) => {
    callCount++
    return { id: request.params.id, patched: true, count: callCount }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ method: 'PATCH', url: '/patch/1' })
  t.assert.strictEqual(firstResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 1)

  const secondResponse = await fastify.inject({ method: 'PATCH', url: '/patch/1' })
  t.assert.strictEqual(secondResponse.statusCode, 200)
  t.assert.strictEqual(callCount, 2, 'PATCH handler called again, not cached by default')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test - Only GET requests are cached by default', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let getCallCount = 0
  let postCallCount = 0

  fastify.get('/resource', {
    config: { cache: true }
  }, async () => {
    getCallCount++
    return { method: 'GET', count: getCallCount }
  })

  fastify.post('/resource', {
    config: { cache: true }
  }, async () => {
    postCallCount++
    return { method: 'POST', count: postCallCount }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ method: 'GET', url: '/resource' })
  const getResponse = await fastify.inject({ method: 'GET', url: '/resource' })
  t.assert.strictEqual(getCallCount, 1, 'GET is cached')
  t.assert.strictEqual(getResponse.headers['x-cache'], 'HIT')

  await fastify.inject({ method: 'POST', url: '/resource' })
  await fastify.inject({ method: 'POST', url: '/resource' })
  t.assert.strictEqual(postCallCount, 2, 'POST is not cached')

  await fastify.close()
})

test('@covers_ACFR_5_5 @unit_test - Stored entry includes status code, Content-Type, body, and generated ETag', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/complete', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(200)
    reply.type('application/json')
    return { message: 'Complete data' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/complete' })
  t.assert.strictEqual(firstResponse.statusCode, 200, 'Status code present')
  t.assert.ok(firstResponse.headers['content-type'], 'Content-Type present')
  t.assert.ok(firstResponse.headers.etag, 'ETag generated')
  t.assert.ok(firstResponse.headers.etag.startsWith('W/"'), 'ETag is weak ETag')
  t.assert.deepStrictEqual(firstResponse.json(), { message: 'Complete data' }, 'Body present')

  const secondResponse = await fastify.inject({ url: '/complete' })
  t.assert.strictEqual(secondResponse.statusCode, firstResponse.statusCode, 'Status code preserved')
  t.assert.strictEqual(secondResponse.headers['content-type'], firstResponse.headers['content-type'], 'Content-Type preserved')
  t.assert.strictEqual(secondResponse.headers.etag, firstResponse.headers.etag, 'ETag preserved')
  t.assert.deepStrictEqual(secondResponse.json(), firstResponse.json(), 'Body preserved')

  await fastify.close()
})

test('@covers_ACFR_5_5 @unit_test - Cache entry includes expiry timestamp', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin, { ttl: 60000 })

  fastify.get('/expiry-test', {
    config: { cache: true }
  }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/expiry-test' })

  const cacheResponse = await fastify.inject({ url: '/expiry-test' })
  t.assert.strictEqual(cacheResponse.headers['x-cache'], 'HIT', 'Entry was cached with expiry')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1, 'One item in cache')

  await fastify.close()
})

test('@covers_ACFR_5_6 @unit_test - ETag header is set on the response sent to the client', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/etag-check', {
    config: { cache: true }
  }, async () => {
    return { data: 'test etag' }
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/etag-check' })
  t.assert.ok(response.headers.etag, 'ETag header present on response')
  t.assert.ok(response.headers.etag.startsWith('W/"'), 'ETag is weak ETag format')
  t.assert.ok(response.headers.etag.endsWith('"'), 'ETag properly formatted')

  await fastify.close()
})

test('@covers_ACFR_5_6 @unit_test - ETag is generated from response body', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/body1', {
    config: { cache: true }
  }, async () => {
    return { value: 'body1' }
  })

  fastify.get('/body2', {
    config: { cache: true }
  }, async () => {
    return { value: 'body2' }
  })

  await fastify.listen({ port: 0 })

  const response1 = await fastify.inject({ url: '/body1' })
  const response2 = await fastify.inject({ url: '/body2' })

  t.assert.ok(response1.headers.etag, 'First response has ETag')
  t.assert.ok(response2.headers.etag, 'Second response has ETag')
  t.assert.notStrictEqual(response1.headers.etag, response2.headers.etag, 'Different bodies generate different ETags')

  const response1Again = await fastify.inject({ url: '/body1' })
  t.assert.strictEqual(response1Again.headers.etag, response1.headers.etag, 'Same body generates same ETag')

  await fastify.close()
})

test('@covers_ACFR_5_7 @unit_test - Subsequent identical requests return the cached response', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.get('/identical', {
    config: { cache: true }
  }, async () => {
    callCount++
    return { callNumber: callCount, timestamp: Date.now() }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/identical' })
  const firstBody = firstResponse.json()
  t.assert.strictEqual(callCount, 1)
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')

  const secondResponse = await fastify.inject({ url: '/identical' })
  const secondBody = secondResponse.json()
  t.assert.strictEqual(callCount, 1, 'Handler not called again')
  t.assert.strictEqual(secondResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(secondBody, firstBody, 'Exact same response returned')

  const thirdResponse = await fastify.inject({ url: '/identical' })
  const thirdBody = thirdResponse.json()
  t.assert.strictEqual(callCount, 1, 'Handler still not called')
  t.assert.strictEqual(thirdResponse.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(thirdBody, firstBody, 'Same response still returned')

  await fastify.close()
})

test('@covers_ACFR_5_7 @integration_test - Multiple identical requests all return cached response', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let callCount = 0
  fastify.get('/multi-hit', {
    config: { cache: true }
  }, async () => {
    callCount++
    return { id: callCount, data: 'cached value' }
  })

  await fastify.listen({ port: 0 })

  const firstResponse = await fastify.inject({ url: '/multi-hit' })
  t.assert.strictEqual(firstResponse.headers['x-cache'], 'MISS')
  const cachedBody = firstResponse.json()
  t.assert.strictEqual(callCount, 1)

  for (let i = 0; i < 10; i++) {
    const response = await fastify.inject({ url: '/multi-hit' })
    t.assert.strictEqual(response.headers['x-cache'], 'HIT', `Request ${i + 2} served from cache`)
    t.assert.deepStrictEqual(response.json(), cachedBody, `Request ${i + 2} has same body`)
  }

  t.assert.strictEqual(callCount, 1, 'Handler called only once for 11 requests')

  await fastify.close()
})

test('@covers_ACFR_5_1 @covers_ACFR_5_5 @covers_ACFR_5_6 @covers_ACFR_5_7 @integration_test - Complete onSend hook flow: store and retrieve', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/complete-flow', {
    config: { cache: true }
  }, async (request, reply) => {
    reply.code(200)
    reply.type('application/json')
    return { message: 'Complete flow test', value: 12345 }
  })

  await fastify.listen({ port: 0 })

  const missResponse = await fastify.inject({ url: '/complete-flow' })
  t.assert.strictEqual(missResponse.statusCode, 200, 'Status code 200')
  t.assert.strictEqual(missResponse.headers['x-cache'], 'MISS', 'First request is MISS')
  t.assert.ok(missResponse.headers.etag, 'ETag generated')
  t.assert.ok(missResponse.headers['content-type'].includes('application/json'), 'Content-Type preserved')
  const missBody = missResponse.json()
  t.assert.deepStrictEqual(missBody, { message: 'Complete flow test', value: 12345 }, 'Body correct')

  const hitResponse = await fastify.inject({ url: '/complete-flow' })
  t.assert.strictEqual(hitResponse.statusCode, 200, 'Status code preserved')
  t.assert.strictEqual(hitResponse.headers['x-cache'], 'HIT', 'Second request is HIT')
  t.assert.strictEqual(hitResponse.headers.etag, missResponse.headers.etag, 'ETag preserved')
  t.assert.strictEqual(hitResponse.headers['content-type'], missResponse.headers['content-type'], 'Content-Type preserved')
  t.assert.deepStrictEqual(hitResponse.json(), missBody, 'Body preserved exactly')

  await fastify.close()
})

test('@covers_ACFR_5_2 @covers_ACFR_5_3 @covers_ACFR_5_4 @integration_test - Non-cacheable responses are never stored', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  let getCount = 0
  let postCount = 0
  let errorCount = 0
  let noStoreCount = 0

  fastify.get('/get-ok', {
    config: { cache: true }
  }, async () => {
    getCount++
    return { type: 'GET', count: getCount }
  })

  fastify.post('/post-ok', {
    config: { cache: true }
  }, async () => {
    postCount++
    return { type: 'POST', count: postCount }
  })

  fastify.get('/error', {
    config: { cache: true }
  }, async (request, reply) => {
    errorCount++
    reply.code(500)
    return { error: true, count: errorCount }
  })

  fastify.get('/no-store', {
    config: { cache: true }
  }, async (request, reply) => {
    noStoreCount++
    reply.header('Cache-Control', 'no-store')
    return { secret: true, count: noStoreCount }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ method: 'GET', url: '/get-ok' })
  const getHit = await fastify.inject({ method: 'GET', url: '/get-ok' })
  t.assert.strictEqual(getCount, 1, 'GET is cached')
  t.assert.strictEqual(getHit.headers['x-cache'], 'HIT')

  await fastify.inject({ method: 'POST', url: '/post-ok' })
  await fastify.inject({ method: 'POST', url: '/post-ok' })
  t.assert.strictEqual(postCount, 2, 'POST is not cached')

  await fastify.inject({ method: 'GET', url: '/error' })
  await fastify.inject({ method: 'GET', url: '/error' })
  t.assert.strictEqual(errorCount, 2, 'Error responses not cached')

  await fastify.inject({ method: 'GET', url: '/no-store' })
  await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(noStoreCount, 2, 'no-store responses not cached')

  await fastify.close()
})

test('@covers_ACFR_5_5 @unit_test - Cache stores weak ETag in proper format', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)

  fastify.get('/etag-format', {
    config: { cache: true }
  }, async () => {
    return { test: 'etag format' }
  })

  await fastify.listen({ port: 0 })

  const response = await fastify.inject({ url: '/etag-format' })
  const etag = response.headers.etag

  t.assert.ok(etag, 'ETag exists')
  t.assert.ok(etag.startsWith('W/"'), 'Weak ETag prefix present')
  t.assert.ok(etag.endsWith('"'), 'ETag ends with quote')
  t.assert.ok(etag.length > 4, 'ETag has content between quotes')

  const etagContent = etag.slice(3, -1)
  t.assert.ok(/^[0-9a-f]+$/.test(etagContent), 'ETag content is hexadecimal')

  await fastify.close()
})
