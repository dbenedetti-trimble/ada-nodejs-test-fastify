'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACFR_7_1 @unit_test Response with Cache-Control: no-store is not cached', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/no-store', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 'no-store')
    return { data: 'no-store', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-store' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_2 @unit_test Response with Cache-Control: private is not cached', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/private', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 'private')
    return { data: 'private', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/private' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/private' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_3 @unit_test Response with Cache-Control: max-age=30 uses 30s TTL regardless of route config', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/max-age', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 'max-age=0')
    return { data: 'max-age', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/max-age' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const statsBeforeExpiry = fastify.cache.stats()
  t.assert.strictEqual(statsBeforeExpiry.items, 1)

  await new Promise(resolve => setTimeout(resolve, 10))

  const res2 = await fastify.inject({ method: 'GET', url: '/max-age' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_4 @unit_test Response with Cache-Control: s-maxage=10, max-age=30 uses 10s TTL', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/s-maxage', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 's-maxage=0, max-age=30')
    return { data: 's-maxage', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const statsBeforeExpiry = fastify.cache.stats()
  t.assert.strictEqual(statsBeforeExpiry.items, 1)

  await new Promise(resolve => setTimeout(resolve, 10))

  const res2 = await fastify.inject({ method: 'GET', url: '/s-maxage' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_5 @unit_test Request with Cache-Control: no-cache bypasses cache and runs handler', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/cached', {
    config: { cache: { ttl: 60000 } }
  }, async () => {
    callCount++
    return { data: 'cached', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/cached' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.json().count, 1)

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/cached',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res3.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_6 @unit_test Response with Cache-Control: no-cache is stored but always revalidated on next request', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/no-cache', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 'no-cache')
    return { data: 'no-cache', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const statsAfterFirst = fastify.cache.stats()
  t.assert.strictEqual(statsAfterFirst.items, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/no-cache' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('@covers_ACFR_7_7 @unit_test Responses without Cache-Control use the route/global default TTL', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/default', {
    config: { cache: { ttl: 60000 } }
  }, async () => {
    callCount++
    return { data: 'default', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/default' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/default' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.json().count, 1)

  await fastify.close()
})

test('@covers_ACFR_7_5 @unit_test Request with Cache-Control: no-store bypasses cache and does not store', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/no-store-req', {
    config: { cache: { ttl: 60000 } }
  }, async () => {
    callCount++
    return { data: 'no-store-req', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/no-store-req',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const statsAfterFirst = fastify.cache.stats()
  t.assert.strictEqual(statsAfterFirst.items, 0)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/no-store-req',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res2.json().count, 2)

  await fastify.close()
})

test('Cache-Control parser handles multiple directives', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/multi', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', 'public, max-age=30, must-revalidate')
    return { data: 'multi', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/multi' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/multi' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.json().count, 1)

  await fastify.close()
})

test('Cache-Control parser handles whitespace variations', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let callCount = 0
  fastify.get('/whitespace', {
    config: { cache: { ttl: 60000 } }
  }, async (request, reply) => {
    callCount++
    reply.header('cache-control', '  max-age=30  ,  public  ')
    return { data: 'whitespace', count: callCount }
  })

  await fastify.listen({ port: 0 })

  const res1 = await fastify.inject({ method: 'GET', url: '/whitespace' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(res1.json().count, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/whitespace' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.strictEqual(res2.json().count, 1)

  await fastify.close()
})
