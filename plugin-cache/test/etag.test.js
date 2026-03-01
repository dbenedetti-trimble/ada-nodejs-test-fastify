'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-10: ETag conditional request returns 304
test('If-None-Match with matching ETag returns 304 with no body', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ value: 1 }))

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r1.headers['x-cache'], 'MISS')
  const etag = r1.headers['etag']
  t.assert.ok(etag, 'ETag present')

  const r2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': etag }
  })
  t.assert.equal(r2.statusCode, 304)
  t.assert.equal(r2.body, '')
})

// VAL-11: ETag mismatch returns full response
test('If-None-Match with non-matching ETag returns 200 with full body', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ value: 1 }))

  await fastify.inject({ method: 'GET', url: '/data' }) // prime cache

  const r2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': 'W/"bad0000000000000"' }
  })
  t.assert.equal(r2.statusCode, 200)
  t.assert.equal(r2.json().value, 1)
})

// If-None-Match: * wildcard
test('If-None-Match: * returns 304 when any cached response exists for the route', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ value: 1 }))

  await fastify.inject({ method: 'GET', url: '/data' }) // prime cache

  const r = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': '*' }
  })
  t.assert.equal(r.statusCode, 304)
})

// Multiple ETags in If-None-Match
test('If-None-Match with comma-separated list checks all values', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ value: 1 }))

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  const etag = r1.headers['etag']

  const r2 = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'if-none-match': `W/"other0000000000", ${etag}` }
  })
  t.assert.equal(r2.statusCode, 304)
})
