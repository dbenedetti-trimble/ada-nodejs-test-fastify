'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

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

test('Cache-Control: max-age on response overrides route TTL', async t => {
  const fastify = await buildFastify()
  fastify.get('/ma', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 'max-age=1')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/ma' })
  await new Promise(r => setTimeout(r, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/ma' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Cache-Control: s-maxage takes priority over max-age', async t => {
  const fastify = await buildFastify()
  fastify.get('/sma', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/sma' })
  await new Promise(r => setTimeout(r, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/sma' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Request Cache-Control: no-cache bypasses cache but stores fresh response', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nc', { config: { cache: true } }, async () => { calls++; return { c: calls } })

  await fastify.inject({ method: 'GET', url: '/nc' })

  const bypass = await fastify.inject({
    method: 'GET',
    url: '/nc',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.strictEqual(calls, 2)
  t.assert.strictEqual(bypass.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Request Cache-Control: no-store bypasses cache and does not store', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nsr', { config: { cache: true } }, async () => { calls++; return { c: calls } })

  await fastify.inject({ method: 'GET', url: '/nsr' })
  await fastify.inject({
    method: 'GET',
    url: '/nsr',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

test('Cache-Control: no-cache on response still stores entry for ETag revalidation', async t => {
  const fastify = await buildFastify()
  fastify.get('/nocache-resp', { config: { cache: true } }, async (req, reply) => {
    reply.header('cache-control', 'no-cache')
    return { x: 1 }
  })
  await fastify.inject({ method: 'GET', url: '/nocache-resp' })
  t.assert.strictEqual(fastify.cache.stats().items, 1)
  await fastify.close()
})
