'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

test('ETag has correct format W/"16-hex-chars"', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/etag', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/etag' })
  t.assert.ok(/^W\/"[a-f0-9]{16}"$/.test(res.headers.etag))
})

test('VAL-10: ETag conditional request returns 304', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  let handlerCalls = 0
  fastify.get('/cond', { config: { cache: true } }, async () => {
    handlerCalls++
    return { value: 'test' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/cond' })
  const etag = res1.headers.etag
  t.assert.ok(etag)

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/cond',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(res2.statusCode, 304)
  t.assert.strictEqual(res2.body, '')
  t.assert.strictEqual(handlerCalls, 1)
})

test('VAL-11: ETag mismatch returns full response', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/mismatch', { config: { cache: true } }, async () => {
    return { value: 'data' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/mismatch' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/mismatch',
    headers: { 'if-none-match': 'W/"0000000000000000"' }
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.headers['x-cache'], 'HIT')
})

test('If-None-Match with * returns 304', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/star', { config: { cache: true } }, async () => {
    return { value: 'star' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/star' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/star',
    headers: { 'if-none-match': '*' }
  })
  t.assert.strictEqual(res.statusCode, 304)
})

test('Multiple ETags in If-None-Match are checked', async t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(cachePlugin)

  fastify.get('/multi', { config: { cache: true } }, async () => {
    return { value: 'multi' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/multi' })
  const etag = res1.headers.etag

  const res2 = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': 'W/"bad1bad1bad1bad1", ' + etag + ', W/"bad2bad2bad2bad2"' }
  })
  t.assert.strictEqual(res2.statusCode, 304)
})
