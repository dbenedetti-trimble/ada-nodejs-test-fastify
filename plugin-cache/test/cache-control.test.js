'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
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
  await new Promise(resolve => setTimeout(resolve, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/ma' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Cache-Control: s-maxage takes priority over max-age', async t => {
  const fastify = await buildFastify()
  fastify.get('/smax', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { t: Date.now() }
  })
  await fastify.inject({ method: 'GET', url: '/smax' })
  await new Promise(resolve => setTimeout(resolve, 1500))
  const expired = await fastify.inject({ method: 'GET', url: '/smax' })
  t.assert.strictEqual(expired.headers['x-cache'], 'MISS')
  await fastify.close()
})

test('Request Cache-Control: no-cache bypasses cache but stores fresh response', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nc', { config: { cache: true } }, async () => {
    calls++
    return { c: calls }
  })

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
  fastify.get('/reqns', { config: { cache: true } }, async () => {
    calls++
    return { c: calls }
  })

  await fastify.inject({ method: 'GET', url: '/reqns' })

  await fastify.inject({
    method: 'GET',
    url: '/reqns',
    headers: { 'cache-control': 'no-store' }
  })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

test('no-cache response is stored but always revalidated (zero TTL)', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/nc-resp', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-cache')
    return { c: calls }
  })

  await fastify.inject({ method: 'GET', url: '/nc-resp' })
  await fastify.inject({ method: 'GET', url: '/nc-resp' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

test('response without Cache-Control uses route default TTL', async t => {
  const fastify = await buildFastify()
  fastify.get('/default-ttl', { config: { cache: { ttl: 10000 } } }, async () => ({ v: 1 }))

  await fastify.inject({ method: 'GET', url: '/default-ttl' })
  const hit = await fastify.inject({ method: 'GET', url: '/default-ttl' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  await fastify.close()
})
