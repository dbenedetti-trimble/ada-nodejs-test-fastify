'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACFR_3_1 @unit_test: Same method + URL + Vary headers = cache hit', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { vary: ['Accept'] })

  let handlerCalls = 0
  fastify.get('/users', {
    config: { cache: true }
  }, () => {
    handlerCalls++
    return { users: ['alice', 'bob'] }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/users',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/users',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res2.json(), { users: ['alice', 'bob'] })

  await fastify.close()
})

test('@covers_ACFR_3_2 @unit_test: Different query strings = different cache entries', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/users', {
    config: { cache: true }
  }, (request) => {
    handlerCalls++
    const page = request.query.page || '1'
    return { users: [`user-page-${page}`], page }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/users?page=1' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/users?page=2' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({ method: 'GET', url: '/users?page=1' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_3_3 @unit_test: Different Vary header values = different cache entries', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/content', {
    config: { cache: { vary: ['Accept'] } }
  }, (request) => {
    handlerCalls++
    return { accept: request.headers.accept }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/content',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/content',
    headers: { accept: 'text/html' }
  })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/content',
    headers: { accept: 'application/json' }
  })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_3_4 @unit_test: Missing Vary headers in request = treated as empty string for that header', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/data', {
    config: { cache: { vary: ['Accept-Language'] } }
  }, () => {
    handlerCalls++
    return { data: 'content' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'accept-language': 'en-US' }
  })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('@covers_ACFR_3_5 @unit_test: Header names are lowercased for consistency', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/headers', {
    config: { cache: { vary: ['Accept', 'User-Agent'] } }
  }, () => {
    handlerCalls++
    return { data: 'test' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/headers',
    headers: { Accept: 'application/json', 'User-Agent': 'test-agent' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/headers',
    headers: { accept: 'application/json', 'user-agent': 'test-agent' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(res2.json(), { data: 'test' })

  await fastify.close()
})

test('@covers_ACFR_3_1 @covers_ACFR_3_2 @unit_test: Complex scenario with multiple query params', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/search', {
    config: { cache: true }
  }, (request) => {
    handlerCalls++
    return { results: request.query }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/search?q=test&page=1' })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({ method: 'GET', url: '/search?q=test&page=2' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({ method: 'GET', url: '/search?q=test&page=1' })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')

  await fastify.close()
})

test('@covers_ACFR_3_3 @unit_test: Multiple Vary headers with different combinations', async (t) => {
  t.plan(8)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/multi', {
    config: { cache: { vary: ['Accept', 'Accept-Language'] } }
  }, (request) => {
    handlerCalls++
    return {
      accept: request.headers.accept,
      lang: request.headers['accept-language']
    }
  })

  await fastify.ready()

  const res1 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { accept: 'application/json', 'accept-language': 'en-US' }
  })
  t.assert.strictEqual(handlerCalls, 1)
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { accept: 'text/html', 'accept-language': 'en-US' }
  })
  t.assert.strictEqual(handlerCalls, 2)
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')

  const res3 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { accept: 'application/json', 'accept-language': 'fr-FR' }
  })
  t.assert.strictEqual(handlerCalls, 3)
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  const res4 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { accept: 'application/json', 'accept-language': 'en-US' }
  })
  t.assert.strictEqual(handlerCalls, 3)
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT')

  await fastify.close()
})
