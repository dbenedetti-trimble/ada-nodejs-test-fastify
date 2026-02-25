'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Fastify = require('fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_7_1 - Response with Cache-Control: no-store is not cached', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/no-store', { config: { cache: true } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 'no-store')
    return { message: 'no-store response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-store' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  assert.equal(res1.headers['x-cache'], undefined)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  assert.equal(res2.statusCode, 200)
  assert.equal(handlerCallCount, 2)

  await fastify.close()
})

test('@covers_ACFR_7_2 - Response with Cache-Control: private is not cached', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/private', { config: { cache: true } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 'private')
    return { message: 'private response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/private' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/private' })
  assert.equal(res2.statusCode, 200)
  assert.equal(handlerCallCount, 2)

  await fastify.close()
})

test('@covers_ACFR_7_3 - Response with Cache-Control: max-age=30 uses 30s TTL regardless of route config', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/max-age', { config: { cache: { ttl: 10000 } } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 'max-age=1')
    return { message: 'max-age response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/max-age' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/max-age' })
  assert.equal(res2.statusCode, 200)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 1)
  assert.equal(res2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 1100))

  const res3 = await fastify.inject({ method: 'GET', url: '/max-age' })
  assert.equal(res3.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body3 = JSON.parse(res3.body)
  assert.equal(body3.count, 2)
  assert.equal(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('@covers_ACFR_7_4 - Response with Cache-Control: s-maxage=10, max-age=30 uses 10s TTL', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/s-maxage', { config: { cache: true } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 's-maxage=1, max-age=30')
    return { message: 's-maxage response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  assert.equal(res2.statusCode, 200)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 1)
  assert.equal(res2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 1100))

  const res3 = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  assert.equal(res3.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body3 = JSON.parse(res3.body)
  assert.equal(body3.count, 2)
  assert.equal(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('@covers_ACFR_7_5 - Request with Cache-Control: no-cache bypasses cache and runs handler', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/bypass', { config: { cache: true } }, async () => {
    handlerCallCount++
    return { message: 'response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/bypass' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)
  assert.equal(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/bypass',
    headers: { 'cache-control': 'no-cache' }
  })
  assert.equal(res2.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 2)
  assert.equal(res2.headers['x-cache'], 'BYPASS')

  const res3 = await fastify.inject({ method: 'GET', url: '/bypass' })
  assert.equal(res3.statusCode, 200)
  const body3 = JSON.parse(res3.body)
  assert.equal(body3.count, 2)
  assert.equal(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_7_6 - Response with Cache-Control: no-cache is stored but always revalidated on next request', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/no-cache-response', { config: { cache: true } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 'no-cache')
    return { message: 'no-cache response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-cache-response' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)

  const etag = res1.headers.etag
  assert.ok(etag, 'ETag should be set')

  const res2 = await fastify.inject({ method: 'GET', url: '/no-cache-response' })
  assert.equal(res2.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_7 - Responses without Cache-Control use the route/global default TTL', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 2000 })

  let handlerCallCount = 0

  fastify.get('/default-ttl', { config: { cache: true } }, async () => {
    handlerCallCount++
    return { message: 'default ttl response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  assert.equal(res2.statusCode, 200)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 1)
  assert.equal(res2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 2100))

  const res3 = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  assert.equal(res3.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body3 = JSON.parse(res3.body)
  assert.equal(body3.count, 2)

  await fastify.close()
})

test('Request with Cache-Control: no-store bypasses cache and does not store response', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/no-store-request', { config: { cache: true } }, async () => {
    handlerCallCount++
    return { message: 'response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-store-request' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)
  const body1 = JSON.parse(res1.body)
  assert.equal(body1.count, 1)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/no-store-request',
    headers: { 'cache-control': 'no-store' }
  })
  assert.equal(res2.statusCode, 200)
  assert.equal(handlerCallCount, 2)
  const body2 = JSON.parse(res2.body)
  assert.equal(body2.count, 2)
  assert.equal(res2.headers['x-cache'], 'BYPASS')

  const res3 = await fastify.inject({ method: 'GET', url: '/no-store-request' })
  assert.equal(res3.statusCode, 200)
  const body3 = JSON.parse(res3.body)
  assert.equal(body3.count, 1)
  assert.equal(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('Cache-Control parser handles multiple directives', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { ttl: 60000 })

  let handlerCallCount = 0

  fastify.get('/multi-directive', { config: { cache: true } }, async (request, reply) => {
    handlerCallCount++
    reply.header('cache-control', 'public, max-age=1, must-revalidate')
    return { message: 'multi-directive response', count: handlerCallCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/multi-directive' })
  assert.equal(res1.statusCode, 200)
  assert.equal(handlerCallCount, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/multi-directive' })
  assert.equal(res2.statusCode, 200)
  assert.equal(res2.headers['x-cache'], 'HIT')

  await new Promise(resolve => setTimeout(resolve, 1100))

  const res3 = await fastify.inject({ method: 'GET', url: '/multi-directive' })
  assert.equal(res3.statusCode, 200)
  assert.equal(handlerCallCount, 2)

  await fastify.close()
})
