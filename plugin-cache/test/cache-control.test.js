'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// VAL-12: Cache-Control: no-store on response prevents caching
test('Cache-Control: no-store on response prevents caching', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/ns', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-store')
    return { calls }
  })
  await fastify.inject({ method: 'GET', url: '/ns' })
  await fastify.inject({ method: 'GET', url: '/ns' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

// VAL-13: Cache-Control: private on response prevents caching
test('Cache-Control: private on response prevents caching', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/priv', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'private')
    return { calls }
  })
  await fastify.inject({ method: 'GET', url: '/priv' })
  await fastify.inject({ method: 'GET', url: '/priv' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

// VAL-14: Cache-Control: max-age overrides route TTL
test('Cache-Control: max-age on response overrides route TTL', async t => {
  const fastify = await buildFastify()
  fastify.get('/ma', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 'max-age=1')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/ma' }) // miss, stored with 1s TTL
  await new Promise(r => setTimeout(r, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/ma' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

// VAL-15: Cache-Control: s-maxage takes priority over max-age
test('Cache-Control: s-maxage takes priority over max-age', async t => {
  const fastify = await buildFastify()
  fastify.get('/sm', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/sm' }) // miss, stored with 1s TTL
  await new Promise(r => setTimeout(r, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/sm' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

// VAL-16: Request Cache-Control: no-cache bypasses cache but stores fresh response
test('Request Cache-Control: no-cache bypasses cache but stores fresh response', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nc', { config: { cache: true } }, async () => { calls++; return { c: calls } })

  await fastify.inject({ method: 'GET', url: '/nc' }) // miss, stored

  const bypass = await fastify.inject({
    method: 'GET',
    url: '/nc',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(calls, 2)
  t.assert.strictEqual(bypass.headers['x-cache'], 'MISS')
  await fastify.close()
})

// CACHE-7: Response Cache-Control: no-cache is stored but always revalidated
test('Cache-Control: no-cache on response forces revalidation on next request', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/rnc', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-cache')
    return { c: calls }
  })
  await fastify.inject({ method: 'GET', url: '/rnc' }) // miss, stored with noCache
  t.assert.strictEqual(calls, 1)

  // second request without conditional header must re-run the handler
  const r2 = await fastify.inject({ method: 'GET', url: '/rnc' })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(calls, 2)

  // conditional request with matching ETag returns 304 without running handler
  const etag = r2.headers.etag
  const r3 = await fastify.inject({
    method: 'GET',
    url: '/rnc',
    headers: { 'if-none-match': etag }
  })
  t.assert.strictEqual(r3.statusCode, 304)
  t.assert.strictEqual(r3.body, '')
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

// Request Cache-Control: no-store bypasses cache and does not store
test('Request Cache-Control: no-store bypasses cache and does not store', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/ns2', { config: { cache: true } }, async () => { calls++; return { c: calls } })

  await fastify.inject({ method: 'GET', url: '/ns2' }) // miss, stored

  await fastify.inject({
    method: 'GET',
    url: '/ns2',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(calls, 2) // bypassed

  // next request with no special header should still hit first stored entry
  const hit = await fastify.inject({ method: 'GET', url: '/ns2' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})
