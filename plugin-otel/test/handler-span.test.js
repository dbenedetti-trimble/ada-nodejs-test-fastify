'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { SpanKind, SpanStatusCode, trace, context, propagation } = require('@opentelemetry/api')
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

// @covers_ACFR_3_1 @unit_test
test('fastify.handler span is created as child of the server span', async t => {
  t.plan(4)
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
  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'fastify.handler span exists')
  t.assert.strictEqual(
    handlerSpan.parentSpanContext?.spanId,
    serverSpan.spanContext().spanId,
    'handler span is child of server span'
  )
  t.assert.strictEqual(
    handlerSpan.spanContext().traceId,
    serverSpan.spanContext().traceId,
    'handler and server span share trace ID'
  )
})

// @covers_ACFR_3_2 @unit_test
test('handler span duration is less than server span duration', async t => {
  t.plan(4)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    return { ok: true }
  })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'handler span exists')
  const toNs = t => t[0] * 1e9 + t[1]
  const handlerDuration = toNs(handlerSpan.endTime) - toNs(handlerSpan.startTime)
  const serverDuration = toNs(serverSpan.endTime) - toNs(serverSpan.startTime)
  t.assert.ok(handlerDuration > 0, 'handler span has positive duration')
  t.assert.ok(serverDuration >= handlerDuration, 'server span duration >= handler span duration')
})

// @covers_ACFR_3_2 @unit_test
test('handler span starts after request hooks have run', async t => {
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
  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverStartMs = serverSpan.startTime[0] * 1e3 + serverSpan.startTime[1] / 1e6
  const handlerStartMs = handlerSpan.startTime[0] * 1e3 + handlerSpan.startTime[1] / 1e6
  t.assert.ok(serverStartMs <= handlerStartMs, 'server span started before handler span')
  t.assert.ok(handlerSpan.endTime[0] > 0, 'handler span end time is set')
})

// @covers_ACFR_3_3 @unit_test
test('handler span is created for async handlers that return promises', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/async', async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    return { ok: true }
  })

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/async' })
  t.assert.strictEqual(res.statusCode, 200)
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span created for async handler')
})

// @covers_ACFR_3_4 @unit_test
test('handler span is created for sync handlers that call reply.send()', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/sync', function (request, reply) {
    reply.send({ ok: true })
  })

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/sync' })
  t.assert.strictEqual(res.statusCode, 200)
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span created for sync handler using reply.send()')
})

// @covers_ACFR_3_5 @unit_test
test('handler span records exception and sets ERROR status when handler throws', async t => {
  t.plan(4)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => {
    throw new Error('handler error')
  })

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500)
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists for throwing handler')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
  const exceptionEvent = handlerSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception event recorded on handler span')
})

// @covers_ACFR_3_5 @unit_test
test('handler span error message matches thrown error message', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => {
    throw new Error('specific error message')
  })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/fail' })
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'specific error message', 'error message on span status matches thrown error')
})

// @covers_ACFR_3_6 @unit_test
test('no handler span is created for routes in ignoreRoutes', async t => {
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

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(res.statusCode, 200)
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan, undefined, 'no handler span for ignored route')
})
