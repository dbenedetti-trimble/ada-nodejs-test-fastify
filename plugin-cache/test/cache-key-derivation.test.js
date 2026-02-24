'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_3_1 - Same method + URL + Vary headers = cache hit', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/same-request', {
    config: {
      cache: {
        vary: ['Accept']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/same-request',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)
  const body1 = res1.json()

  const res2 = await fastify.inject({
    url: '/same-request',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'same method, URL, and Vary headers produce cache hit')
  t.assert.strictEqual(handlerCallCount, 1, 'handler not called for cache hit')
  const body2 = res2.json()
  t.assert.deepStrictEqual(body2, body1, 'cached response body matches original')

  await fastify.close()
})

test('@covers_ACFR_3_2 - Different query strings = different cache entries', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/with-query', {
    config: { cache: true }
  }, async (request) => {
    handlerCallCount++
    return { page: request.query.page || 'none', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ url: '/with-query?page=1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)
  t.assert.strictEqual(res1.json().page, '1')

  const res2 = await fastify.inject({ url: '/with-query?page=2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'different query string creates different cache entry')
  t.assert.strictEqual(handlerCallCount, 2)
  t.assert.strictEqual(res2.json().page, '2')

  const res3 = await fastify.inject({ url: '/with-query?page=1' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'same query string hits cache')
  t.assert.strictEqual(handlerCallCount, 2, 'handler not called for cache hit')
  t.assert.strictEqual(res3.json().count, 1, 'cached response from first request')

  const res4 = await fastify.inject({ url: '/with-query?page=2' })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT', 'second query string also hits cache')
  t.assert.strictEqual(handlerCallCount, 2)
  t.assert.strictEqual(res4.json().count, 2, 'cached response from second request')

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'two separate cache entries for different query strings')

  await fastify.close()
})

test('@covers_ACFR_3_3 - Different Vary header values = different cache entries', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/vary-headers', {
    config: {
      cache: {
        vary: ['Accept', 'Accept-Language']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/vary-headers',
    headers: {
      accept: 'application/json',
      'accept-language': 'en-US'
    }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({
    url: '/vary-headers',
    headers: {
      accept: 'application/json',
      'accept-language': 'fr-FR'
    }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'different Accept-Language creates different entry')
  t.assert.strictEqual(handlerCallCount, 2)

  const res3 = await fastify.inject({
    url: '/vary-headers',
    headers: {
      accept: 'text/html',
      'accept-language': 'en-US'
    }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'different Accept creates different entry')
  t.assert.strictEqual(handlerCallCount, 3)

  const res4 = await fastify.inject({
    url: '/vary-headers',
    headers: {
      accept: 'application/json',
      'accept-language': 'en-US'
    }
  })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT', 'same Vary header values hit cache')
  t.assert.strictEqual(handlerCallCount, 3, 'handler not called for cache hit')
  t.assert.strictEqual(res4.json().count, 1, 'cached response from first request')

  t.assert.strictEqual(fastify.cache.stats().items, 3, 'three separate cache entries for different Vary header combinations')

  await fastify.close()
})

test('@covers_ACFR_3_4 - Missing Vary headers in request = treated as empty string for that header', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/missing-vary', {
    config: {
      cache: {
        vary: ['Accept', 'X-Custom-Header']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/missing-vary',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({
    url: '/missing-vary',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'missing X-Custom-Header treated as empty, cache hit')
  t.assert.strictEqual(handlerCallCount, 1)

  const res3 = await fastify.inject({
    url: '/missing-vary',
    headers: {
      accept: 'application/json',
      'x-custom-header': 'value1'
    }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'presence of X-Custom-Header creates different entry')
  t.assert.strictEqual(handlerCallCount, 2)

  const res4 = await fastify.inject({
    url: '/missing-vary',
    headers: {
      accept: 'application/json',
      'x-custom-header': 'value1'
    }
  })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT', 'same X-Custom-Header value hits cache')
  t.assert.strictEqual(handlerCallCount, 2)

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'two cache entries: one with missing header, one with header present')

  await fastify.close()
})

test('@covers_ACFR_3_5 - Header names are lowercased for consistency', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/lowercase-headers', {
    config: {
      cache: {
        vary: ['Accept', 'X-Custom-Header']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/lowercase-headers',
    headers: {
      Accept: 'application/json',
      'X-Custom-Header': 'TestValue'
    }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({
    url: '/lowercase-headers',
    headers: {
      accept: 'application/json',
      'x-custom-header': 'TestValue'
    }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'header names normalized to lowercase, cache hit')
  t.assert.strictEqual(handlerCallCount, 1, 'handler not called, headers matched despite case difference')

  const res3 = await fastify.inject({
    url: '/lowercase-headers',
    headers: {
      ACCEPT: 'application/json',
      'X-CUSTOM-HEADER': 'TestValue'
    }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'all uppercase header names also normalized and hit cache')
  t.assert.strictEqual(handlerCallCount, 1)

  t.assert.strictEqual(fastify.cache.stats().items, 1, 'single cache entry for all header name case variations')

  await fastify.close()
})

test('@covers_ACFR_3_1 @covers_ACFR_3_2 @covers_ACFR_3_3 - Cache key format includes method, URL, and vary headers', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, {
    methods: ['GET', 'POST']
  })

  let getHandlerCount = 0
  let postHandlerCount = 0
  fastify.get('/key-format', {
    config: {
      cache: {
        vary: ['Accept']
      }
    }
  }, async () => {
    getHandlerCount++
    return { data: 'test', method: 'GET' }
  })

  fastify.post('/key-format', {
    config: { cache: true }
  }, async () => {
    postHandlerCount++
    return { data: 'post', method: 'POST' }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/key-format?page=1',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(getHandlerCount, 1)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/key-format?page=1',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'GET request with same URL and headers hits cache')
  t.assert.strictEqual(getHandlerCount, 1, 'GET handler not called again')

  const res3 = await fastify.inject({
    method: 'POST',
    url: '/key-format?page=1'
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'POST method creates different cache key than GET')
  t.assert.strictEqual(postHandlerCount, 1, 'POST handler called once')

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'two cache entries: one for GET, one for POST')

  await fastify.close()
})
