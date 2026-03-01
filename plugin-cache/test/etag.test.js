'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// ETag format: W/"16-hex-chars"
test('ETag format is W/"16-hex-chars"', async t => {
  const fastify = await buildFastify()
  fastify.get('/e', { config: { cache: true } }, async () => ({ x: 1 }))
  const r = await fastify.inject({ method: 'GET', url: '/e' })
  t.assert.match(r.headers.etag, /^W\/"[0-9a-f]{16}"$/)
  await fastify.close()
})

// VAL-10: If-None-Match matching ETag returns 304 with no body
test('If-None-Match matching ETag returns 304 with no body', async t => {
  const fastify = await buildFastify()
  fastify.get('/cond', { config: { cache: true } }, async () => ({ x: 1 }))
  const first = await fastify.inject({ method: 'GET', url: '/cond' })
  const etag = first.headers.etag

  const second = await fastify.inject({
    method: 'GET',
    url: '/cond',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(second.statusCode, 304)
  t.assert.strictEqual(second.body, '')
  await fastify.close()
})

// VAL-11: If-None-Match non-matching ETag returns 200 with full body
test('If-None-Match non-matching ETag returns 200 with full body', async t => {
  const fastify = await buildFastify()
  fastify.get('/cond2', { config: { cache: true } }, async () => ({ x: 1 }))
  await fastify.inject({ method: 'GET', url: '/cond2' }) // prime cache

  const res = await fastify.inject({
    method: 'GET',
    url: '/cond2',
    headers: { 'if-none-match': 'W/"0000000000000000"' }
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { x: 1 })
  await fastify.close()
})

// If-None-Match: * returns 304 if any cached entry exists
test('If-None-Match: * returns 304 for any cached entry', async t => {
  const fastify = await buildFastify()
  fastify.get('/star', { config: { cache: true } }, async () => ({ x: 1 }))
  await fastify.inject({ method: 'GET', url: '/star' }) // prime cache

  const res = await fastify.inject({
    method: 'GET',
    url: '/star',
    headers: { 'if-none-match': '*' }
  })
  t.assert.strictEqual(res.statusCode, 304)
  await fastify.close()
})

// Multiple ETags in If-None-Match: match any
test('If-None-Match with multiple ETags matches stored ETag', async t => {
  const fastify = await buildFastify()
  fastify.get('/multi', { config: { cache: true } }, async () => ({ x: 1 }))
  const first = await fastify.inject({ method: 'GET', url: '/multi' })
  const etag = first.headers.etag

  const res = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': `W/"0000000000000000", ${etag}` }
  })
  t.assert.strictEqual(res.statusCode, 304)
  await fastify.close()
})
