'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACFR_5_1 @unit_test: Successful GET responses on cached routes are stored in the cache', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/data', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { message: 'success' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1, 'handler called on first request')
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1, 'handler not called on second request - served from cache')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'response served from cache')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test: Non-2xx responses are not cached (404)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/not-found', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.code(404)
    return { error: 'Not Found' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/not-found' })
  t.assert.strictEqual(res1.statusCode, 404)
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/not-found' })
  t.assert.strictEqual(res2.statusCode, 404)
  t.assert.strictEqual(handlerCalls, 2, 'handler called again - 404 not cached')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'no items cached')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test: Non-2xx responses are not cached (500)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/error', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.code(500)
    return { error: 'Internal Server Error' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/error' })
  t.assert.strictEqual(res1.statusCode, 500)
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/error' })
  t.assert.strictEqual(res2.statusCode, 500)
  t.assert.strictEqual(handlerCalls, 2, 'handler called again - 500 not cached')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'no items cached')

  await fastify.close()
})

test('@covers_ACFR_5_2 @unit_test: 2xx responses (201, 204) are cached', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/created', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.code(201)
    return { resource: 'created' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/created' })
  t.assert.strictEqual(res1.statusCode, 201)
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/created' })
  t.assert.strictEqual(res2.statusCode, 201)
  t.assert.strictEqual(handlerCalls, 1, '201 response cached')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_5_3 @unit_test: Responses with Cache-Control: no-store are not cached', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/sensitive', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'no-store')
    return { secret: 'data' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/sensitive' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/sensitive' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 2, 'handler called again - no-store respected')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'no items cached due to no-store')

  await fastify.close()
})

test('@covers_ACFR_5_3 @unit_test: Cache-Control: no-store with other directives', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/mixed', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.header('cache-control', 'max-age=3600, no-store, public')
    return { data: 'test' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/mixed' })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({ method: 'GET', url: '/mixed' })
  t.assert.strictEqual(handlerCalls, 2, 'no-store takes precedence')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test: POST responses are not cached', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.post('/data', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { created: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  t.assert.strictEqual(handlerCalls, 2, 'POST not cached')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.misses, 0, 'POST requests do not count as misses')

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test: PUT responses are not cached', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.put('/data/:id', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { updated: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'PUT', url: '/data/1', payload: {} })
  await fastify.inject({ method: 'PUT', url: '/data/1', payload: {} })

  t.assert.strictEqual(handlerCalls, 2, 'PUT not cached')
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test: DELETE responses are not cached', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.delete('/data/:id', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { deleted: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'DELETE', url: '/data/1' })
  await fastify.inject({ method: 'DELETE', url: '/data/1' })

  t.assert.strictEqual(handlerCalls, 2, 'DELETE not cached')
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('@covers_ACFR_5_4 @unit_test: PATCH responses are not cached', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.patch('/data/:id', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { patched: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'PATCH', url: '/data/1', payload: {} })
  await fastify.inject({ method: 'PATCH', url: '/data/1', payload: {} })

  t.assert.strictEqual(handlerCalls, 2, 'PATCH not cached')
  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('@covers_ACFR_5_5 @unit_test: Stored entry includes status code, Content-Type, body, and ETag', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/entry', {
    config: { cache: true }
  }, (request, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8')
    reply.code(200)
    return { test: 'data' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/entry' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.ok(res1.headers.etag, 'ETag should be set')
  t.assert.ok(res1.headers.etag.startsWith('W/"'), 'ETag should be weak')

  const res2 = await fastify.inject({ method: 'GET', url: '/entry' })
  t.assert.strictEqual(res2.statusCode, 200, 'status code preserved')
  t.assert.strictEqual(res2.headers['content-type'], 'application/json; charset=utf-8', 'Content-Type preserved')
  t.assert.strictEqual(res2.headers.etag, res1.headers.etag, 'ETag preserved')

  await fastify.close()
})

test('@covers_ACFR_5_6 @unit_test: ETag header is set on the response sent to the client', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/with-etag', {
    config: { cache: true }
  }, () => {
    return { data: 'test' }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/with-etag' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(res.headers.etag, 'ETag header should be present')
  t.assert.match(res.headers.etag, /^W\/"[a-f0-9]{16}"$/, 'ETag should match format W/"16-char-hex"')

  await fastify.close()
})

test('@covers_ACFR_5_6 @unit_test: ETag generation is consistent for same response body', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/consistent', {
    config: { cache: true }
  }, () => {
    return { message: 'hello', count: 42 }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/consistent' })
  const etag1 = res1.headers.etag
  t.assert.ok(etag1)

  fastify.cache.clear()

  const res2 = await fastify.inject({ method: 'GET', url: '/consistent' })
  const etag2 = res2.headers.etag
  t.assert.ok(etag2)

  t.assert.strictEqual(etag1, etag2, 'ETag should be consistent for same body')
  t.assert.match(etag1, /^W\/"[a-f0-9]{16}"$/)

  await fastify.close()
})

test('@covers_ACFR_5_7 @unit_test: Subsequent identical requests return the cached response', async (t) => {
  t.plan(10)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/cached', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { data: 'value', timestamp: Date.now() }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  const body1 = res1.json()

  const res2 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1, 'handler not called')
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  const body2 = res2.json()
  t.assert.deepStrictEqual(body2, body1, 'response body identical')

  const res3 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res3.statusCode, 200)
  t.assert.strictEqual(handlerCalls, 1, 'handler still not called')
  const body3 = res3.json()
  t.assert.deepStrictEqual(body3, body1, 'response body still identical')

  await fastify.close()
})

test('@covers_ACFR_5_1 @covers_ACFR_5_2 @unit_test: Only 2xx responses are cached, not 3xx redirects', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/redirect', {
    config: { cache: true }
  }, (request, reply) => {
    handlerCalls++
    reply.code(302)
    reply.header('location', '/new-location')
    return ''
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/redirect' })
  t.assert.strictEqual(handlerCalls, 1)

  await fastify.inject({ method: 'GET', url: '/redirect' })
  t.assert.strictEqual(handlerCalls, 2, '3xx redirect not cached')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0, 'no cached items')
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.close()
})

test('@covers_ACFR_5_5 @covers_ACFR_5_6 @unit_test: ETag format validation', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/etag-test', {
    config: { cache: true }
  }, () => {
    return { test: 'etag' }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/etag-test' })
  const etag = res.headers.etag

  t.assert.ok(etag, 'ETag present')
  t.assert.ok(etag.startsWith('W/"'), 'ETag is weak (starts with W/")')
  t.assert.ok(etag.endsWith('"'), 'ETag ends with quote')
  t.assert.match(etag, /^W\/"[a-f0-9]{16}"$/, 'ETag matches expected format')

  await fastify.close()
})
