'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
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

test('route-level vary merges with global vary', async t => {
  const fastify = await buildFastify({ vary: ['Accept-Language'] })
  fastify.get('/merged', { config: { cache: { vary: ['Accept'] } } }, async (req) => ({
    accept: req.headers.accept,
    lang: req.headers['accept-language']
  }))

  await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  const hit = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'en' }
  })
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')

  const miss = await fastify.inject({
    method: 'GET',
    url: '/merged',
    headers: { accept: 'application/json', 'accept-language': 'fr' }
  })
  t.assert.strictEqual(miss.headers['x-cache'], 'MISS')
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

test('cache hit preserves original Content-Type header', async t => {
  const fastify = await buildFastify()
  fastify.get('/ct', { config: { cache: true } }, async (req, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8')
    return { x: 1 }
  })
  await fastify.inject({ method: 'GET', url: '/ct' })
  const hit = await fastify.inject({ method: 'GET', url: '/ct' })
  t.assert.ok(hit.headers['content-type'].includes('application/json'))
  await fastify.close()
})

test('cache hit returns original status code', async t => {
  const fastify = await buildFastify()
  fastify.get('/status', { config: { cache: true } }, async (req, reply) => {
    reply.code(201)
    return { created: true }
  })
  await fastify.inject({ method: 'GET', url: '/status' })
  const hit = await fastify.inject({ method: 'GET', url: '/status' })
  t.assert.strictEqual(hit.statusCode, 201)
  t.assert.strictEqual(hit.headers['x-cache'], 'HIT')
  await fastify.close()
})
