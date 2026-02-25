'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')

function setupTracing () {
  trace.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

test('ignoreRoutes with string pattern excludes exact match', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const healthSpan = spans.find(s => s.name.includes('/health'))
  const testSpan = spans.find(s => s.name.includes('/test'))
  
  t.assert.ok(!healthSpan, '/health should not create spans')
  t.assert.ok(testSpan, '/test should create spans')
})

test('ignoreRoutes with RegExp pattern excludes matching routes', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: [/^\/metrics/]
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/metrics', async () => ({ data: [] }))
  fastify.get('/metrics/stats', async () => ({ stats: [] }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/metrics' })
  await fastify.inject({ method: 'GET', url: '/metrics/stats' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const metricsSpan = spans.find(s => s.name.includes('/metrics'))
  const metricsStatsSpan = spans.find(s => s.name.includes('/metrics/stats'))
  const testSpan = spans.find(s => s.name.includes('/test'))
  
  t.assert.ok(!metricsSpan, '/metrics should not create spans')
  t.assert.ok(!metricsStatsSpan, '/metrics/stats should not create spans')
  t.assert.ok(testSpan, '/test should create spans')
})

test('ignoreRoutes with multiple patterns', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health', '/readiness', /^\/internal/]
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/readiness', async () => ({ status: 'ready' }))
  fastify.get('/internal/debug', async () => ({ debug: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/readiness' })
  await fastify.inject({ method: 'GET', url: '/internal/debug' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name.includes('/health')), '/health should not create spans')
  t.assert.ok(!spans.some(s => s.name.includes('/readiness')), '/readiness should not create spans')
  t.assert.ok(!spans.some(s => s.name.includes('/internal')), '/internal/* should not create spans')
  t.assert.ok(spans.some(s => s.name.includes('/test')), '/test should create spans')
})

test('ignoreRoutes with empty array does not ignore any routes', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: []
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(spans.some(s => s.name.includes('/health')), '/health should create spans')
  t.assert.ok(spans.some(s => s.name.includes('/test')), '/test should create spans')
})

test('ignoreRoutes default (no option) does not ignore any routes', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(spans.some(s => s.name.includes('/health')), '/health should create spans')
  t.assert.ok(spans.some(s => s.name.includes('/test')), '/test should create spans')
})

test('ignoreRoutes excludes server span', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  
  t.assert.strictEqual(serverSpans.length, 1, 'Only one server span should exist')
  t.assert.ok(serverSpans[0].name.includes('/test'), 'Server span should be for /test')
})

test('ignoreRoutes excludes handler span', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpans = spans.filter(s => s.name === 'fastify.handler')
  
  t.assert.strictEqual(handlerSpans.length, 1, 'Only one handler span should exist')
  t.assert.ok(spans.some(s => s.name.includes('/test')), 'Handler span should be for /test request')
})

test('ignoreRoutes excludes hook spans when hookSpans is enabled', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    hookSpans: true,
    ignoreRoutes: ['/health']
  })

  fastify.addHook('preHandler', async () => {})

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  
  let spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 0, 'No spans should be created for ignored /health route')

  exporter.reset()

  await fastify.inject({ method: 'GET', url: '/test' })
  
  spans = exporter.getFinishedSpans()
  t.assert.ok(spans.length > 0, 'Spans should be created for /test route')
})

test('ignoreRoutes works with parameterized routes', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/users/:id', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/users/123' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name.includes('/health')), '/health should not create spans')
  t.assert.ok(spans.some(s => s.name.includes('/users')), '/users/:id should create spans')
})

test('ignoreRoutes string pattern only matches exact URL', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/health/status', async () => ({ status: 'ok' }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/health/status' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name.includes('GET /health') && !s.name.includes('status')), '/health should not create spans')
  t.assert.ok(spans.some(s => s.name.includes('/health/status')), '/health/status should create spans')
})

test('ignoreRoutes RegExp with anchors', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: [/^\/api\/internal$/]
  })

  fastify.get('/api/internal', async () => ({ ok: true }))
  fastify.get('/api/internal/debug', async () => ({ debug: true }))
  fastify.get('/api/public', async () => ({ data: [] }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/api/internal' })
  await fastify.inject({ method: 'GET', url: '/api/internal/debug' })
  await fastify.inject({ method: 'GET', url: '/api/public' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name === 'GET /api/internal'), '/api/internal should not create spans')
  t.assert.ok(spans.some(s => s.name.includes('/api/internal/debug')), '/api/internal/debug should create spans')
  t.assert.ok(spans.some(s => s.name.includes('/api/public')), '/api/public should create spans')
})

test('ignoreRoutes with query parameters', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health?check=full' })
  await fastify.inject({ method: 'GET', url: '/test?param=value' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name.includes('/health')), '/health with query params should not create spans')
  t.assert.ok(spans.some(s => s.name.includes('/test')), '/test with query params should create spans')
})

test('ignoreRoutes does not affect request.otelSpan availability', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  let healthSpanExists = false
  let testSpanExists = false

  fastify.get('/health', async (request) => {
    healthSpanExists = !!request.otelSpan
    return { status: 'ok' }
  })

  fastify.get('/test', async (request) => {
    testSpanExists = !!request.otelSpan
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/test' })

  t.assert.strictEqual(healthSpanExists, false, 'request.otelSpan should not exist for ignored routes')
  t.assert.strictEqual(testSpanExists, true, 'request.otelSpan should exist for non-ignored routes')
})

test('ignoreRoutes with mixed string and RegExp patterns', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health', /^\/metrics/, '/readiness']
  })

  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics/stats', async () => ({ stats: [] }))
  fastify.get('/readiness', async () => ({ ready: true }))
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/metrics/stats' })
  await fastify.inject({ method: 'GET', url: '/readiness' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(!spans.some(s => s.name.includes('/health')), '/health should be ignored')
  t.assert.ok(!spans.some(s => s.name.includes('/metrics')), '/metrics/* should be ignored')
  t.assert.ok(!spans.some(s => s.name.includes('/readiness')), '/readiness should be ignored')
  t.assert.ok(spans.some(s => s.name.includes('/test')), '/test should not be ignored')
})
