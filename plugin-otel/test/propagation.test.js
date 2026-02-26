'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { W3CTraceContextPropagator } = require('@opentelemetry/core')
const { SpanKind, trace, context, propagation } = require('@opentelemetry/api')
const otelPlugin = require('../index.js')
const { extractContext } = require('../lib/context-propagation')

function setupInMemoryExporter () {
  trace.disable()
  context.disable()
  propagation.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register({ propagator: new W3CTraceContextPropagator() })
  return { exporter, provider }
}

// @covers_ACFR_7_6 @unit_test
test('extractContext - uses propagation.extract() with ROOT_CONTEXT and header carrier', t => {
  t.plan(2)
  const mockOtel = {
    propagation: {
      extract (ctx, carrier, getter) {
        t.assert.ok(getter, 'getter object is provided')
        t.assert.strictEqual(typeof getter.get, 'function', 'getter.get is a function')
        return ctx
      }
    },
    ROOT_CONTEXT: {}
  }
  extractContext(mockOtel, { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' })
})

// @covers_ACFR_7_6 @unit_test
test('extractContext - getter correctly reads carrier values by key', t => {
  t.plan(2)
  const capturedGetter = {}
  const mockOtel = {
    propagation: {
      extract (_ctx, carrier, getter) {
        capturedGetter.get = getter.get
        capturedGetter.keys = getter.keys
        return _ctx
      }
    },
    ROOT_CONTEXT: {}
  }
  const headers = { traceparent: 'test-value', tracestate: 'vendor=data' }
  extractContext(mockOtel, headers)

  t.assert.strictEqual(capturedGetter.get(headers, 'traceparent'), 'test-value')
  t.assert.deepStrictEqual(capturedGetter.keys(headers), ['traceparent', 'tracestate'])
})

// @covers_ACFR_7_1 @covers_ACNFR_6_1 @integration_test
test('propagation - incoming traceparent creates child span preserving trace ID and parent span ID', async t => {
  t.plan(3)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736'
  const incomingSpanId = '00f067aa0ba902b7'
  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: `00-${incomingTraceId}-${incomingSpanId}-01`
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(serverSpan.spanContext().traceId, incomingTraceId)
  t.assert.strictEqual(serverSpan.parentSpanContext?.spanId, incomingSpanId)
})

// @covers_ACFR_7_2 @integration_test
test('propagation - request without traceparent starts a new root trace', async t => {
  t.plan(3)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(serverSpan.spanContext().traceId, 'new trace ID should be generated')
  t.assert.strictEqual(serverSpan.parentSpanContext, undefined, 'no parent span context for new trace')
})

// @covers_ACFR_7_3 @integration_test
test('propagation - tracestate values are propagated to the server span context', async t => {
  t.plan(2)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=somevalue'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(
    serverSpan.parentSpanContext?.traceState?.get('vendor'),
    'somevalue',
    'tracestate vendor entry should be propagated'
  )
})

// @covers_ACFR_7_4 @covers_ACTC_6_1 @integration_test
test('propagation - child spans created inside async handler are parented to server span', async t => {
  t.plan(4)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => {
    const childSpan = fastify.otel.tracer.startSpan('custom.operation')
    childSpan.end()
    return { ok: true }
  })

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const childSpan = spans.find(s => s.name === 'custom.operation')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(childSpan, 'child span should exist')
  t.assert.strictEqual(childSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'child span parented to server span')
  t.assert.strictEqual(childSpan.spanContext().traceId, serverSpan.spanContext().traceId, 'same trace ID')
})

// @covers_ACFR_7_5 @integration_test
test('propagation - context propagation works with async handlers', async t => {
  t.plan(3)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)

  fastify.get('/async', async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    const childSpan = fastify.otel.tracer.startSpan('async.operation')
    childSpan.end()
    return { ok: true }
  })

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({ method: 'GET', url: '/async' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const childSpan = spans.find(s => s.name === 'async.operation')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(childSpan, 'child span created inside async handler should exist')
  t.assert.strictEqual(childSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'async child span parented to server span')
})

// @covers_ACFR_7_5 @integration_test
test('propagation - context propagation works with callback-style handlers', async t => {
  t.plan(3)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)

  fastify.get('/callback', function (request, reply) {
    const childSpan = fastify.otel.tracer.startSpan('callback.operation')
    childSpan.end()
    reply.send({ ok: true })
  })

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({ method: 'GET', url: '/callback' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const childSpan = spans.find(s => s.name === 'callback.operation')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(childSpan, 'child span created in callback handler should exist')
  t.assert.strictEqual(childSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'callback child span parented to server span')
})

// @covers_ACFR_7_1 @covers_ACNFR_6_1 @integration_test
test('propagation - exact test vector from SPEC-022: trace and parent span IDs', async t => {
  t.plan(2)
  const { exporter, provider } = setupInMemoryExporter()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/trace', async () => ({ ok: true }))

  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })

  await fastify.inject({
    method: 'GET',
    url: '/trace',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  t.assert.strictEqual(serverSpan.parentSpanContext?.spanId, '00f067aa0ba902b7')
})
