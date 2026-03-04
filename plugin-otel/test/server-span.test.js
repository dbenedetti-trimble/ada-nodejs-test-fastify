'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-04: server span covers full request lifecycle', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = getSpans(exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'exactly one SERVER span')
  t.assert.strictEqual(serverSpans[0].name, 'GET /test')
})

test('VAL-05: server span uses route pattern, not resolved URL', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/users/:id', async () => ({ ok: true }))

  const res = await fastify.inject({ method: 'GET', url: '/users/42' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42')
})

test('server span kind is SERVER', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.name === 'GET /test')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.kind, SpanKind.SERVER)
})

test('server span accessible from request.otelSpan', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })

  let hadSpan = false
  fastify.get('/test', async (request) => {
    hadSpan = request.otelSpan != null
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.ok(hadSpan, 'request.otelSpan was available in handler')
})

test('404 route uses method-only span name', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/exists', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/nonexistent' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'GET')
})
