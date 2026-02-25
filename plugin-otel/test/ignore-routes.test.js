'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-16: ignoreRoutes excludes routes from instrumentation
test('VAL-16: ignoreRoutes excludes matching routes', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api/data', async () => ({ data: [] }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api/data' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 1, 'only one server span')
  t.assert.strictEqual(serverSpans[0].name, 'GET /api/data', 'span is for non-ignored route')

  const healthSpans = spans.filter(s => s.name.includes('/health'))
  t.assert.strictEqual(healthSpans.length, 0, 'no spans for ignored route')

  await fastify.close()
})

test('request.otelSpan is undefined for ignored routes', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })

  let capturedSpan
  fastify.get('/health', async (request) => {
    capturedSpan = request.otelSpan
    return { status: 'ok' }
  })

  await fastify.inject({ method: 'GET', url: '/health' })

  t.assert.strictEqual(capturedSpan, null, 'otelSpan is null for ignored routes')

  await fastify.close()
})
