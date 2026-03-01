'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

test('ETag format is W/"16-hex-chars"', async t => {
  const fastify = await buildFastify()
  fastify.get('/e', { config: { cache: true } }, async () => ({ x: 1 }))
  const r = await fastify.inject({ method: 'GET', url: '/e' })
  t.assert.match(r.headers.etag, /^W\/"[0-9a-f]{16}"$/)
  await fastify.close()
})

test('ETag is set on every cached response', async t => {
  const fastify = await buildFastify()
  fastify.get('/etag', { config: { cache: true } }, async () => ({ data: 'test' }))
  const r1 = await fastify.inject({ method: 'GET', url: '/etag' })
  t.assert.ok(r1.headers.etag)

  const r2 = await fastify.inject({ method: 'GET', url: '/etag' })
  t.assert.ok(r2.headers.etag)
  t.assert.strictEqual(r1.headers.etag, r2.headers.etag)
  await fastify.close()
})

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

test('If-None-Match non-matching ETag returns 200 with full body', async t => {
  const fastify = await buildFastify()
  fastify.get('/cond2', { config: { cache: true } }, async () => ({ x: 1 }))
  await fastify.inject({ method: 'GET', url: '/cond2' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/cond2',
    headers: { 'if-none-match': 'W/"0000000000000000"' }
  })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), { x: 1 })
  await fastify.close()
})

test('If-None-Match with * value returns 304 if any cached response exists', async t => {
  const fastify = await buildFastify()
  fastify.get('/star', { config: { cache: true } }, async () => ({ x: 1 }))
  await fastify.inject({ method: 'GET', url: '/star' })

  const res = await fastify.inject({
    method: 'GET',
    url: '/star',
    headers: { 'if-none-match': '*' }
  })
  t.assert.strictEqual(res.statusCode, 304)
  await fastify.close()
})

test('Multiple ETags in If-None-Match are all checked', async t => {
  const fastify = await buildFastify()
  fastify.get('/multi', { config: { cache: true } }, async () => ({ x: 1 }))
  const first = await fastify.inject({ method: 'GET', url: '/multi' })
  const etag = first.headers.etag

  const res = await fastify.inject({
    method: 'GET',
    url: '/multi',
    headers: { 'if-none-match': 'W/"0000000000000000", ' + etag }
  })
  t.assert.strictEqual(res.statusCode, 304)
  await fastify.close()
})

test('304 response handler is not called', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/no-handler', { config: { cache: true } }, async () => {
    calls++
    return { x: 1 }
  })
  const first = await fastify.inject({ method: 'GET', url: '/no-handler' })
  const etag = first.headers.etag

  await fastify.inject({
    method: 'GET',
    url: '/no-handler',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(calls, 1)
  await fastify.close()
})
