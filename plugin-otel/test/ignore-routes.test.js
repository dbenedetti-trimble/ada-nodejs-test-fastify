'use strict'

// @covers_ACFR_1_6 @covers_ACFR_3_6 @unit_test

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { trace, context, propagation } = require('@opentelemetry/api')
const otelPlugin = require('../index.js')

function setupOtelProvider () {
  trace.disable()
  context.disable()
  propagation.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

// @covers_ACFR_1_6 @unit_test
test('ignoreRoutes prevents span creation for matched routes', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api/data', async () => ({ data: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for ignored route')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/api/data' })
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'span created for non-ignored route')
})

// @covers_ACFR_1_6 @unit_test
test('multiple routes can be ignored simultaneously', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health', '/metrics'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics', async () => ({ metrics: [] }))
  fastify.get('/api', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for /health')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/metrics' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for /metrics')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/api' })
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'span created for /api')
})

// @covers_ACFR_3_6 @unit_test
test('no handler span is created for ignored routes', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { ignoreRoutes: ['/skip'] })
  fastify.get('/skip', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/skip' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no spans at all for ignored route')
})

// @covers_ACFR_9_3 @unit_test
test('request.otelSpan is null/falsy for ignored routes', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  let capturedOtelSpan
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { ignoreRoutes: ['/ignored'], exposeApi: true })
  fastify.get('/ignored', async (request) => {
    capturedOtelSpan = request.otelSpan
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/ignored' })
  t.assert.ok(!capturedOtelSpan, 'request.otelSpan is falsy for ignored routes')
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no spans for ignored route')
})
