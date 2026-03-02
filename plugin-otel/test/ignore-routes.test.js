'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('ignoreRoutes: excluded routes produce no spans', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, {
    hookSpans: false,
    ignoreRoutes: ['/health']
  })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api/data', async () => ({ data: [1, 2, 3] }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/health' })
  let spans = await getSpans(exporter, provider)
  const healthSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(healthSpans.length, 0, 'no spans for /health')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/api/data' })
  spans = await getSpans(exporter, provider)
  const dataSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(dataSpans.length, 1, 'spans for /api/data')
  t.assert.strictEqual(dataSpans[0].name, 'GET /api/data')
})

test('ignoreRoutes: request.otelSpan is undefined for ignored routes', async t => {
  const { provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  let capturedSpan = 'not-set'
  await fastify.register(otelPlugin, {
    hookSpans: false,
    ignoreRoutes: ['/health']
  })
  fastify.get('/health', async (request) => {
    capturedSpan = request.otelSpan
    return { status: 'ok' }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(capturedSpan, null, 'request.otelSpan is null for ignored route')
})
