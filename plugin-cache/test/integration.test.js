'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('..')

// VAL-03: Uncached route is unaffected (integration scenario)
test('multiple routes: cached and uncached coexist without interference', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)

  let cachedCalls = 0
  let uncachedCalls = 0

  fastify.get('/cached', { config: { cache: true } }, async () => { cachedCalls++; return { cached: true } })
  fastify.get('/uncached', async () => { uncachedCalls++; return { cached: false } })

  await fastify.inject({ method: 'GET', url: '/cached' })
  await fastify.inject({ method: 'GET', url: '/cached' })
  await fastify.inject({ method: 'GET', url: '/uncached' })
  await fastify.inject({ method: 'GET', url: '/uncached' })

  t.assert.equal(cachedCalls, 1, 'cached route handler runs once')
  t.assert.equal(uncachedCalls, 2, 'uncached route handler runs each time')
})

// VAL-17: Non-GET requests are not cached
test('POST requests are not cached even when route opts in', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.post('/data', { config: { cache: true } }, async () => { calls++; return { ok: true } })

  const r1 = await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  const r2 = await fastify.inject({ method: 'POST', url: '/data', payload: {} })
  t.assert.equal(r1.headers['x-cache'], undefined, 'no X-Cache on POST')
  t.assert.equal(calls, 2, 'handler runs both times')
})

// VAL-18: Non-2xx responses are not cached
test('4xx and 5xx responses are not stored in cache', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/data', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.statusCode = 404
    return { error: 'not found' }
  })

  await fastify.inject({ method: 'GET', url: '/data' })
  await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(calls, 2, '404 responses not cached; handler runs each time')
})

// VAL-23: No regressions — the plugin does not affect normal Fastify behavior
test('existing Fastify behavior unaffected: basic JSON route works', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/hello', async () => ({ hello: 'world' }))
  const r = await fastify.inject({ method: 'GET', url: '/hello' })
  t.assert.equal(r.statusCode, 200)
  t.assert.deepStrictEqual(r.json(), { hello: 'world' })
})

// Content-Type header preserved on cache hit
test('cache hit preserves original Content-Type header', { skip: 'scaffold stub' }, async (t) => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(cachePlugin)
  fastify.get('/data', { config: { cache: true } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'GET', url: '/data' })
  const r2 = await fastify.inject({ method: 'GET', url: '/data' })
  t.assert.equal(r2.headers['content-type'], r1.headers['content-type'])
})
