'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-16: ignoreRoutes excludes routes from instrumentation', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, {
    hookSpans: false,
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api/data', async () => ({ data: [1, 2, 3] }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api/data' })

  const spans = getSpans(exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'only one server span')
  t.assert.strictEqual(serverSpans[0].name, 'GET /api/data', 'span is for /api/data')
})

test('request.otelSpan is null (decorator default) for ignored routes when OTel is active', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, {
    hookSpans: false,
    ignoreRoutes: ['/health']
  })

  let otelSpanValue = 'not-checked'
  fastify.get('/health', async (request) => {
    otelSpanValue = request.otelSpan
    return { status: 'ok' }
  })

  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(otelSpanValue, null, 'request.otelSpan is null (decorator default) for ignored route')
})

test('multiple ignored routes', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, {
    hookSpans: false,
    ignoreRoutes: ['/health', '/ready']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/ready', async () => ({ status: 'ok' }))
  fastify.get('/api/data', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/ready' })
  await fastify.inject({ method: 'GET', url: '/api/data' })

  const spans = getSpans(exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'only one server span for non-ignored route')
  t.assert.strictEqual(serverSpans[0].name, 'GET /api/data')
})
