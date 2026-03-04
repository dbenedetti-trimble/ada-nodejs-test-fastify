'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('ETag is set on cached response', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.ok(res.headers.etag)
  t.assert.ok(res.headers.etag.startsWith('W/"'))
})

test('If-None-Match with matching ETag returns 304', async t => {
  t.plan(4)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/data', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: 'test' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  const etag = res1.headers.etag

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': etag }
  })

  t.assert.strictEqual(res2.statusCode, 304)
  t.assert.strictEqual(res2.payload, '')
  t.assert.strictEqual(res2.headers.etag, etag)
  t.assert.strictEqual(handlerCalls, 1)
})

test('If-None-Match with non-matching ETag returns full response', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  await fastify.inject({ method: 'GET', url: '/data' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': 'W/"badetag000000000"' }
  })

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { value: 'test' })
})

test('If-None-Match with * returns 304 if cached', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  await fastify.inject({ method: 'GET', url: '/data' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': '*' }
  })

  t.assert.strictEqual(res.statusCode, 304)
})

test('If-None-Match with multiple ETags checks all', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  const res1 = await fastify.inject({ method: 'GET', url: '/data' })
  const etag = res1.headers.etag

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': 'W/"bad0000000000000", ' + etag + ', W/"other00000000000"' }
  })

  t.assert.strictEqual(res2.statusCode, 304)
})

test('ETag format is W/"16-hex-chars"', async t => {
  t.plan(1)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(cachePlugin)

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { value: 'test' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.ok(/^W\/"[0-9a-f]{16}"$/.test(res.headers.etag))
})
