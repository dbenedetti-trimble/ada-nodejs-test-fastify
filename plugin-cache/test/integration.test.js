'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

test('different query strings produce different cache entries', async t => {
  const fastify = await buildFastify()
  fastify.get('/items', { config: { cache: true } }, async (req) => ({ page: req.query.page }))

  const p1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  const p2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(p1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(p2.headers['x-cache'], 'MISS')

  const p1hit = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(p1hit.headers['x-cache'], 'HIT')
  t.assert.deepStrictEqual(p1hit.json(), { page: '1' })
  await fastify.close()
})

test('Vary header produces different cache entries per Accept value', async t => {
  const fastify = await buildFastify()
  fastify.get('/v', { config: { cache: { vary: ['Accept'] } } }, async (req) => ({ ct: req.headers.accept }))

  const json = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'application/json' } })
  const html = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'text/html' } })
  t.assert.strictEqual(json.headers['x-cache'], 'MISS')
  t.assert.strictEqual(html.headers['x-cache'], 'MISS')

  const jsonHit = await fastify.inject({ method: 'GET', url: '/v', headers: { accept: 'application/json' } })
  t.assert.strictEqual(jsonHit.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('global Vary headers merged with route-level vary (no duplicates)', async t => {
  const fastify = await buildFastify({ vary: ['accept-language'] })
  fastify.get('/merge', { config: { cache: { vary: ['Accept', 'accept-language'] } } }, async (req) => ({
    accept: req.headers.accept,
    lang: req.headers['accept-language']
  }))

  const r1 = await fastify.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  const r2 = await fastify.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS')

  const r3 = await fastify.inject({
    method: 'GET',
    url: '/merge',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(r3.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('missing Vary headers treated as empty string', async t => {
  const fastify = await buildFastify()
  fastify.get('/vary-missing', { config: { cache: { vary: ['Accept'] } } }, async () => ({ v: 1 }))

  const r1 = await fastify.inject({ method: 'GET', url: '/vary-missing' })
  const r2 = await fastify.inject({ method: 'GET', url: '/vary-missing' })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(r2.headers['x-cache'], 'HIT')
  await fastify.close()
})

test('POST requests are not cached', async t => {
  const fastify = await buildFastify()
  fastify.post('/p', { config: { cache: true } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'POST', url: '/p' })
  const r2 = await fastify.inject({ method: 'POST', url: '/p' })
  t.assert.strictEqual(r1.headers['x-cache'], undefined)
  t.assert.strictEqual(r2.headers['x-cache'], undefined)
  await fastify.close()
})

test('non-2xx responses are not cached', async t => {
  const fastify = await buildFastify()
  let calls = 0
  fastify.get('/err', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.code(404)
    return { error: 'not found' }
  })
  await fastify.inject({ method: 'GET', url: '/err' })
  await fastify.inject({ method: 'GET', url: '/err' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

test('500 responses are not cached', async t => {
  const fastify = Fastify({ logger: false })
  await fastify.register(cachePlugin)
  let calls = 0
  fastify.get('/boom', { config: { cache: true } }, async (req, reply) => {
    calls++
    reply.code(500)
    return { error: 'server error' }
  })
  await fastify.inject({ method: 'GET', url: '/boom' })
  await fastify.inject({ method: 'GET', url: '/boom' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})

test('custom methods config: only configured methods are cached', async t => {
  const fastify = await buildFastify({ methods: ['GET', 'HEAD'] })
  fastify.get('/m', { config: { cache: true } }, async () => ({ v: 1 }))
  fastify.post('/m', { config: { cache: true } }, async () => ({ v: 1 }))

  await fastify.inject({ method: 'GET', url: '/m' })
  const getHit = await fastify.inject({ method: 'GET', url: '/m' })
  t.assert.strictEqual(getHit.headers['x-cache'], 'HIT')

  const post1 = await fastify.inject({ method: 'POST', url: '/m' })
  t.assert.strictEqual(post1.headers['x-cache'], undefined)
  await fastify.close()
})

test('plugin does not affect routes registered before plugin', async t => {
  const fastify = Fastify()
  let calls = 0
  fastify.get('/before', async () => {
    calls++
    return { ok: true }
  })
  await fastify.register(cachePlugin)

  await fastify.inject({ method: 'GET', url: '/before' })
  await fastify.inject({ method: 'GET', url: '/before' })
  t.assert.strictEqual(calls, 2)
  await fastify.close()
})
