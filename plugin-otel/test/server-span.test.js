'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('server span: one SERVER span per request', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 1, 'exactly one server span')
  t.assert.strictEqual(serverSpans[0].name, 'GET /test')
})

test('server span: uses route pattern not resolved URL', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users/42' })
  const spans = await getSpans(exporter, provider)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans[0].name, 'GET /users/:id')
  t.assert.strictEqual(serverSpans[0].attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpans[0].attributes['url.path'], '/users/42')
})

test('server span: 404 route uses METHOD only', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/exists', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/nonexistent' })
  const spans = await getSpans(exporter, provider)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpans.length >= 1, 'server span created for 404')
})

test('server span: span duration reflects request processing', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/slow' })
  const spans = await getSpans(exporter, provider)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  const duration = serverSpans[0].duration[0] * 1e3 + serverSpans[0].duration[1] / 1e6
  t.assert.ok(duration >= 40, `span duration ${duration}ms should be >= 40ms`)
})
