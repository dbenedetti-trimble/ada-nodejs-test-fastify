'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-12: Cache-Control: no-store prevents caching
test('response with Cache-Control: no-store is not cached', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/data', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'no-store')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(calls, 2, 'handler called each time — not cached')
})

// VAL-13: Cache-Control: private prevents caching
test('response with Cache-Control: private is not cached', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/data', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.header('cache-control', 'private')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(calls, 2, 'handler called each time — not cached')
})

// VAL-14: Cache-Control: max-age overrides route TTL
test('response Cache-Control: max-age=1 overrides route ttl and expires after 1s', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 'max-age=1')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await new Promise(resolve => setTimeout(resolve, 1500))
  const r = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r.headers['x-cache'], 'MISS', 'entry expired via max-age')
})

// VAL-15: Cache-Control: s-maxage takes priority
test('s-maxage takes priority over max-age', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: { ttl: 60000 } } }, async (req, reply) => {
    reply.header('cache-control', 's-maxage=1, max-age=60')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await new Promise(resolve => setTimeout(resolve, 1500))
  const r = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r.headers['x-cache'], 'MISS', 'entry expired via s-maxage')
})

// VAL-16: Request Cache-Control: no-cache bypasses cache
test('request with Cache-Control: no-cache bypasses cache and refreshes entry', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/data', { config: { cache: true } }, async () => { calls++; return { ok: true } })

  await fastify.inject({ method: 'GET', url: '/data' }) // miss, stored
  const r = await fastify.inject({
    method: 'GET',
    url: '/data',
    headers: { 'cache-control': 'no-cache' }
  })
  t.assert.equal(r.headers['x-cache'], 'MISS', 'cache bypassed')
  t.assert.equal(calls, 2, 'handler ran again')
})
