'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cachePlugin = require('../index')

async function buildFastify (opts = {}) {
  const fastify = Fastify()
  await fastify.register(cachePlugin, opts)
  return fastify
}

// VAL-05: Different query strings produce different cache entries
test('different query strings produce different cache entries', async t => {
  const fastify = await buildFastify()
  fastify.get('/items', { config: { cache: true } }, async (req) => ({ page: req.query.page }))

  const p1 = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  const p2 = await fastify.inject({ method: 'GET', url: '/items?page=2' })
  t.assert.strictEqual(p1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(p2.headers['x-cache'], 'MISS')

  const p1hit = await fastify.inject({ method: 'GET', url: '/items?page=1' })
  t.assert.strictEqual(p1hit.headers['x-cache'], 'HIT')
  await fastify.close()
})

// VAL-06: Vary header produces different cache entries per header value
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

// Global Vary headers are merged with per-route Vary headers (union, no duplicates)
test('global and per-route Vary headers are merged without duplicates', async t => {
  const fastify = await buildFastify({ vary: ['accept'] })
  fastify.get('/mv', { config: { cache: { vary: ['Accept', 'Accept-Language'] } } }, async (req) => ({
    accept: req.headers.accept,
    lang: req.headers['accept-language']
  }))

  const r1 = await fastify.inject({
    method: 'GET', url: '/mv',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(r1.headers['x-cache'], 'MISS')

  const r2 = await fastify.inject({
    method: 'GET', url: '/mv',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  t.assert.strictEqual(r2.headers['x-cache'], 'MISS') // different lang

  const r3 = await fastify.inject({
    method: 'GET', url: '/mv',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(r3.headers['x-cache'], 'HIT')
  await fastify.close()
})

// VAL-17: POST requests are not cached
test('POST requests are not cached', async t => {
  const fastify = await buildFastify()
  fastify.post('/p', { config: { cache: true } }, async () => ({ ok: true }))

  const r1 = await fastify.inject({ method: 'POST', url: '/p' })
  const r2 = await fastify.inject({ method: 'POST', url: '/p' })
  t.assert.strictEqual(r1.headers['x-cache'], undefined)
  t.assert.strictEqual(r2.headers['x-cache'], undefined)
  await fastify.close()
})

// VAL-18: Non-2xx responses are not cached
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

// Content-Type is preserved on cache hit
test('cache hit preserves original Content-Type header', async t => {
  const fastify = await buildFastify()
  fastify.get('/ct', { config: { cache: true } }, async (req, reply) => {
    reply.type('application/json')
    return { ok: true }
  })
  const miss = await fastify.inject({ method: 'GET', url: '/ct' })
  const hit = await fastify.inject({ method: 'GET', url: '/ct' })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  t.assert.ok(hit.headers['content-type'].includes('application/json'))
  t.assert.strictEqual(miss.headers['content-type'], hit.headers['content-type'])
  await fastify.close()
})
