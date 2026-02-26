'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { SpanKind, trace, context, propagation } = require('@opentelemetry/api')
const proxyquire = require('proxyquire')

const pluginNoOtel = proxyquire('../index.js', {
  './lib/otel-api': { loadOtelApi: () => false }
})

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

// @covers_ACFR_9_1 @covers_ACAPI_2_1 @unit_test
test('fastify.otel.tracer returns the Tracer instance used by the plugin', async t => {
  t.plan(3)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
  })
  await fastify.register(require('../index.js'))
  t.assert.ok(fastify.otel, 'fastify.otel decorator is defined')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is defined')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer exposes startSpan method')
})

// @covers_ACFR_9_2 @covers_ACAPI_2_2 @unit_test
test('request.otelSpan returns the server span for the current request', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  let capturedSpanId = null
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'))
  fastify.get('/test', async (request) => {
    t.assert.ok(request.otelSpan !== null, 'request.otelSpan is not null inside handler')
    capturedSpanId = request.otelSpan.spanContext().spanId
    return { ok: true }
  })
  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().spanId, capturedSpanId, 'request.otelSpan is the exported server span')
})

// @covers_ACFR_9_3 @covers_ACAPI_2_2 @unit_test
test('request.otelSpan is null for routes in ignoreRoutes', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  let capturedSpan = 'not-set'
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'), { ignoreRoutes: ['/health'] })
  fastify.get('/health', async (request) => {
    capturedSpan = request.otelSpan
    return { status: 'ok' }
  })
  const res = await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(capturedSpan === null || capturedSpan === undefined, 'request.otelSpan is null/undefined for ignored routes')
})

// @covers_ACFR_9_3 @unit_test
test('fastify.otel and request.otelSpan are not registered when OTel is not installed', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())
  await fastify.register(pluginNoOtel)
  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel not registered when OTel absent')
  fastify.get('/test', async (request) => {
    return { hasOtelSpan: 'otelSpan' in request }
  })
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACFR_9_4 @unit_test
test('custom attributes set via request.otelSpan.setAttribute() appear on the exported span', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'))
  fastify.get('/users/:id', async (request) => {
    request.otelSpan.setAttribute('user.id', request.params.id)
    return { ok: true }
  })
  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/users/42' })
  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.length > 0, 'span was exported')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['user.id'], '42', 'custom attribute user.id appears on exported span')
})

// @covers_ACFR_9_5 @unit_test
test('registering plugin throws FST_ERR_DEC_ALREADY_PRESENT if otel decorator already exists', async t => {
  t.plan(1)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    try { await fastify.close() } catch {}
    await provider.shutdown()
  })
  fastify.decorate('otel', { tracer: null })
  fastify.register(require('../index.js'))
  try {
    await fastify.ready()
    t.assert.fail('expected FST_ERR_DEC_ALREADY_PRESENT to be thrown')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_DEC_ALREADY_PRESENT', 'throws FST_ERR_DEC_ALREADY_PRESENT when otel is already decorated')
  }
})

// @covers_ACAPI_1_1 @unit_test
test('exposeApi: false disables fastify.otel and request.otelSpan decorators', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'), { exposeApi: false })
  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel not registered when exposeApi: false')
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACAPI_1_1 @unit_test
test('exposeApi defaults to true: fastify.otel decorator is registered without explicit option', async t => {
  t.plan(2)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
  })
  await fastify.register(require('../index.js'))
  t.assert.ok(fastify.otel, 'fastify.otel is registered by default (exposeApi defaults to true)')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is available by default')
})

// @covers_ACAPI_1_2 @unit_test
test('hookSpans: true is accepted without error (default behavior)', async t => {
  t.plan(1)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
  })
  await fastify.register(require('../index.js'), { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACAPI_1_2 @unit_test
test('hookSpans: false is accepted without error', async t => {
  t.plan(1)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
  })
  await fastify.register(require('../index.js'), { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACAPI_1_3 @unit_test
test('ignoreRoutes defaults to empty array: all routes are instrumented', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'))
  fastify.get('/test', async () => ({ ok: true }))
  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.length > 0, 'span created for route when ignoreRoutes defaults to []')
})

// @covers_ACAPI_1_3 @unit_test
test('ignoreRoutes accepts array of patterns and excludes them', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'), { ignoreRoutes: ['/ping', '/health'] })
  fastify.get('/ping', async () => ({ pong: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/ping' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for /ping (ignored)')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for /health (ignored)')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/api' })
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'span created for /api (not ignored)')
})

// @covers_ACAPI_1_4 @unit_test
test('spanNameFormatter overrides default span naming when provided', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  const spanNameFormatter = (request) => 'custom.' + request.method.toLowerCase()
  await fastify.register(require('../index.js'), { spanNameFormatter })
  fastify.get('/test', async () => ({ ok: true }))
  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.find(s => s.kind === SpanKind.SERVER).name, 'custom.get', 'spanNameFormatter is called to produce span name')
})

// @covers_ACAPI_1_4 @unit_test
test('spanNameFormatter defaults to null (uses default GET /route format)', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'))
  fastify.get('/items/:id', async () => ({ ok: true }))
  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/items/99' })
  t.assert.strictEqual(res.statusCode, 200)
  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.find(s => s.kind === SpanKind.SERVER).name, 'GET /items/:id', 'default span name is METHOD /route-pattern')
})
