'use strict'

// @covers_ACFR_1_1 @covers_ACFR_2_1 @covers_ACFR_3_1 @covers_ACFR_4_1
// @covers_ACFR_5_1 @covers_ACFR_9_1 @covers_ACFR_9_2 @integration_test

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { SpanKind, trace, context, propagation } = require('@opentelemetry/api')
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

// @covers_ACFR_1_1 @covers_ACFR_2_1 @covers_ACFR_3_1 @integration_test
test('full request lifecycle produces server span and handler span', async t => {
  t.plan(5)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ id: 1 }))

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/users/42' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'server span uses route pattern')
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId, 'handler is child of server span')
})

// @covers_ACFR_9_1 @covers_ACFR_9_2 @integration_test
test('decorator API provides access to tracer and request span', async t => {
  t.plan(4)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  let capturedSpan
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { exposeApi: true })
  fastify.get('/test', async (request) => {
    capturedSpan = request.otelSpan
    return { ok: true }
  })

  t.assert.ok(fastify.otel, 'fastify.otel decorator is registered')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is available')

  await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.ok(capturedSpan, 'request.otelSpan is set during handler execution')
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'spans are exported')
})

// @covers_ACFR_4_1 @integration_test
test('hook spans are created for all lifecycle phases when hookSpans is true', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.ok(hookSpans.length > 0, 'hook spans are created')
  t.assert.ok(spans.some(s => s.kind === SpanKind.SERVER), 'server span also exists')
})

// @covers_ACFR_4_3 @integration_test
test('no hook spans when hookSpans is false', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.addHook('onRequest', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when disabled')
  t.assert.ok(spans.some(s => s.kind === SpanKind.SERVER), 'server span still created')
})

// @covers_ACFR_5_1 @covers_ACFR_5_2 @integration_test
test('server span carries HTTP semantic convention attributes', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/items/:id', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/items/99' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.attributes['http.request.method'], 'GET', 'request method attribute set')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 200, 'response status code attribute set')
})
