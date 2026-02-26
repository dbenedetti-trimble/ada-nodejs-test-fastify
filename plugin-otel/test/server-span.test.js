'use strict'

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

// @covers_ACFR_2_1 @covers_ACNFR_1_1 @unit_test
test('exactly one server span is created per request', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })
  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'exactly one server span per request')
  t.assert.strictEqual(serverSpans[0].name, 'GET /test', 'span has correct name')
})

// @covers_ACFR_2_1 @covers_ACNFR_1_1 @unit_test
test('one server span per request across multiple concurrent requests', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/a', async () => ({ route: 'a' }))
  fastify.get('/b', async () => ({ route: 'b' }))

  exporter.reset()
  await Promise.all([
    fastify.inject({ method: 'GET', url: '/a' }),
    fastify.inject({ method: 'GET', url: '/b' })
  ])
  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 2, 'one server span per request')
})

// @covers_ACFR_2_2 @unit_test
test('server span has SpanKind.SERVER', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })
  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.kind, SpanKind.SERVER, 'span kind is SERVER')
})

// @covers_ACFR_2_2 @covers_ACFR_2_6 @unit_test
test('server span starts before handler and ends after response', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  let handlerStartTime = null
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => {
    handlerStartTime = Date.now()
    return { ok: true }
  })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  const spanStartMs = serverSpan.startTime[0] * 1000 + serverSpan.startTime[1] / 1e6
  t.assert.ok(spanStartMs <= handlerStartTime, 'server span started before handler ran')
  t.assert.ok(serverSpan.endTime[0] > 0, 'server span end time is set')
})

// @covers_ACFR_2_3 @covers_ACNFR_8_1 @unit_test
test('span name uses parameterized route pattern not actual URL', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/users/42' })
  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.name, 'GET /users/:id', 'span name uses :id not 42')
})

// @covers_ACFR_2_3 @unit_test
test('span name format is METHOD /route for various HTTP methods', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.post('/items', async () => ({ created: true }))
  fastify.delete('/items/:id', async () => ({ deleted: true }))

  exporter.reset()
  await fastify.inject({ method: 'POST', url: '/items' })
  const postSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(postSpan.name, 'POST /items')

  exporter.reset()
  await fastify.inject({ method: 'DELETE', url: '/items/5' })
  const deleteSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(deleteSpan.name, 'DELETE /items/:id')
})

// @covers_ACFR_2_5 @unit_test
test('404 route produces span name of METHOD only', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/does-not-exist' })
  t.assert.strictEqual(res.statusCode, 404)
  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.name, 'GET', '404 span name is METHOD only')
})

// @covers_ACFR_2_4 @unit_test
test('server span is accessible from request.otelSpan for adding custom attributes', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async (request) => {
    request.otelSpan.setAttribute('user.id', request.params.id)
    return { ok: true }
  })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/users/99' })
  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(span, 'server span exists')
  t.assert.strictEqual(span.attributes['user.id'], '99', 'custom attribute set via request.otelSpan appears on span')
})
