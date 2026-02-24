'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_2_1 - Routes with config.cache = true use the global default TTL', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, {
    ttl: 60000
  })

  let handlerCallCount = 0
  fastify.get('/default-ttl', {
    config: { cache: true }
  }, async () => {
    handlerCallCount++
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ url: '/default-ttl' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({ url: '/default-ttl' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(handlerCallCount, 1, 'handler not called again - using cached response')

  await fastify.close()
})

test('@covers_ACFR_2_2 - Routes with config.cache.ttl = N use the specified TTL', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, {
    ttl: 60000
  })

  let handlerCallCount = 0
  fastify.get('/custom-ttl', {
    config: {
      cache: {
        ttl: 100
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test', timestamp: Date.now() }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ url: '/custom-ttl' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  await new Promise(resolve => setTimeout(resolve, 50))

  const res2 = await fastify.inject({ url: '/custom-ttl' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'cache hit before TTL expires')
  t.assert.strictEqual(handlerCallCount, 1)

  await new Promise(resolve => setTimeout(resolve, 100))

  const res3 = await fastify.inject({ url: '/custom-ttl' })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'cache miss after custom TTL expires')
  t.assert.strictEqual(handlerCallCount, 2, 'handler called again after TTL expiry')

  await fastify.close()
})

test('@covers_ACFR_2_3 - Routes with config.cache.vary = [\'Accept\'] include those headers in the cache key', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/vary-accept', {
    config: {
      cache: {
        vary: ['Accept']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/vary-accept',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({
    url: '/vary-accept',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'different Accept header creates different cache entry')
  t.assert.strictEqual(handlerCallCount, 2)

  const res3 = await fastify.inject({
    url: '/vary-accept',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'same Accept header hits cache')
  t.assert.strictEqual(handlerCallCount, 2, 'handler not called for cache hit')

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'two separate cache entries exist')

  await fastify.close()
})

test('@covers_ACFR_2_4 - Routes without config.cache are not cached, and no hooks run for them', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  let handlerCallCount = 0
  fastify.get('/no-cache', async () => {
    handlerCallCount++
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ url: '/no-cache' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(res1.headers['x-cache'], undefined, 'no X-Cache header set')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({ url: '/no-cache' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(res2.headers['x-cache'], undefined, 'still no X-Cache header')
  t.assert.strictEqual(handlerCallCount, 2, 'handler called every time - no caching')

  t.assert.strictEqual(fastify.cache.stats().items, 0, 'no cache entries created')

  await fastify.close()
})

test('@covers_ACFR_2_5 - Route-level vary headers are merged with global vary headers (union, no duplicates)', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, {
    vary: ['Accept-Encoding']
  })

  let handlerCallCount = 0
  fastify.get('/merged-vary', {
    config: {
      cache: {
        vary: ['Accept', 'Accept-Encoding']
      }
    }
  }, async () => {
    handlerCallCount++
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    url: '/merged-vary',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip'
    }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(handlerCallCount, 1)

  const res2 = await fastify.inject({
    url: '/merged-vary',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'br'
    }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'different Accept-Encoding creates different entry')
  t.assert.strictEqual(handlerCallCount, 2)

  const res3 = await fastify.inject({
    url: '/merged-vary',
    headers: {
      accept: 'text/html',
      'accept-encoding': 'gzip'
    }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'different Accept creates different entry')
  t.assert.strictEqual(handlerCallCount, 3)

  const res4 = await fastify.inject({
    url: '/merged-vary',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip'
    }
  })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT', 'same Accept and Accept-Encoding hits cache')
  t.assert.strictEqual(handlerCallCount, 3, 'handler not called for cache hit')

  t.assert.strictEqual(fastify.cache.stats().items, 3, 'three separate cache entries based on both headers')

  await fastify.close()
})
