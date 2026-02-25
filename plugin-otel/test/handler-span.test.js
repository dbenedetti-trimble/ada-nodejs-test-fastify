'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api')
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

test('@covers_ACFR_3_1: A fastify.handler span is created as a child of the server span', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 2, 'should have server span and handler span')

  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.parentSpanContext.spanId, serverSpan.spanContext().spanId, 'handler span should be child of server span')
})

test('@covers_ACFR_3_2: Span duration covers only handler execution (not hooks)', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.addHook('preHandler', async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
  })

  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    return payload
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')

  const handlerDuration = (handlerSpan.endTime[0] - handlerSpan.startTime[0]) * 1000 +
                          (handlerSpan.endTime[1] - handlerSpan.startTime[1]) / 1000000

  t.assert.ok(handlerDuration >= 40 && handlerDuration < 80, 'handler span duration should cover only handler execution (~50ms), not preHandler hook (~20ms)')
})

test('@covers_ACFR_3_3: Span is created for async handlers that return promises', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/async', async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return { result: 'async' }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/async' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist for async handler')
  t.assert.ok(handlerSpan.endTime[0] > handlerSpan.startTime[0] || handlerSpan.endTime[1] > handlerSpan.startTime[1], 'handler span should have completed')
})

test('@covers_ACFR_3_4: Span is created for sync handlers that call reply.send()', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/sync', (request, reply) => {
    reply.send({ result: 'sync' })
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/sync' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist for sync handler')
  t.assert.ok(handlerSpan.endTime[0] > handlerSpan.startTime[0] || handlerSpan.endTime[1] > handlerSpan.startTime[1], 'handler span should have completed')
})

test('@covers_ACFR_3_5: If the handler throws, the span records the exception and sets error status before ending', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Handler error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status should be ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'Handler error', 'error message should be set')

  const exceptionEvent = handlerSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception should be recorded on handler span')
})

test('@covers_ACFR_3_6: Handler span is not created for routes in ignoreRoutes', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health', /^\/metrics/]
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics/stats', async () => ({ metrics: [] }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/metrics/stats' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpans = spans.filter(s => s.name === 'fastify.handler')

  t.assert.strictEqual(spans.length, 2, 'only /test should create spans')
  t.assert.strictEqual(handlerSpans.length, 1, 'only one handler span should be created')

  const serverSpan = spans.find(s => s.name === 'GET /test')
  t.assert.ok(serverSpan, 'server span for /test should exist')
})

test('Handler span has INTERNAL span kind', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(handlerSpan.kind, SpanKind.INTERNAL, 'handler span kind should be INTERNAL')
})

test('Handler span with sync handler that throws synchronously', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/sync-error', (request, reply) => {
    throw new Error('Sync handler error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/sync-error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status should be ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'Sync handler error', 'error message should be set')
})

test('Handler span with async handler that rejects', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/async-error', async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    throw new Error('Async handler error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/async-error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status should be ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'Async handler error', 'error message should be set')
})

test('Multiple requests create separate handler spans', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpans = spans.filter(s => s.name === 'fastify.handler')

  t.assert.strictEqual(spans.length, 6, 'should have 3 server spans and 3 handler spans')
  t.assert.strictEqual(handlerSpans.length, 3, 'should have 3 handler spans')

  const uniqueSpanIds = new Set(handlerSpans.map(s => s.spanContext().spanId))
  t.assert.strictEqual(uniqueSpanIds.size, 3, 'all handler spans should have unique span IDs')
})

test('Handler span correctly parents child spans created by user code', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request) => {
    const childSpan = fastify.otel.tracer.startSpan('custom-operation', {}, request.otelContext)
    await new Promise(resolve => setTimeout(resolve, 10))
    childSpan.end()
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 3, 'should have server span, handler span, and custom span')

  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const customSpan = spans.find(s => s.name === 'custom-operation')

  t.assert.ok(serverSpan && handlerSpan && customSpan, 'all spans should exist')
  t.assert.strictEqual(handlerSpan.parentSpanContext.spanId, serverSpan.spanContext().spanId, 'handler span should be child of server span')
  t.assert.strictEqual(customSpan.parentSpanContext.spanId, serverSpan.spanContext().spanId, 'custom span should be child of server span (same parent as handler)')
})
