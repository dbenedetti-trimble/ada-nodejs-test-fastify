'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind, context, propagation, ROOT_CONTEXT } = require('@opentelemetry/api')
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

test('Request with traceparent header creates child span', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const parentSpanId = 'b7ad6b7169203331'
  const traceparent = `00-${traceId}-${parentSpanId}-01`

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.strictEqual(serverSpan.spanContext().traceId, traceId, 'Trace ID should be preserved from traceparent header')
})

test('Request with traceparent creates span as child (different parent span ID)', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const parentSpanId = 'b7ad6b7169203331'
  const traceparent = `00-${traceId}-${parentSpanId}-01`

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.notStrictEqual(serverSpan.spanContext().spanId, parentSpanId, 'Server span should have different span ID than parent')
})

test('Request without traceparent starts new trace', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(serverSpan.spanContext().traceId, 'New trace ID should be generated')
})

test('Multiple requests without traceparent create different traces', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  
  t.assert.strictEqual(serverSpans.length, 2, 'Two server spans should exist')
  t.assert.ok(serverSpans[0].spanContext().traceId, 'First span should have trace ID')
  t.assert.notStrictEqual(
    serverSpans[0].spanContext().traceId,
    serverSpans[1].spanContext().traceId,
    'Different requests should have different trace IDs'
  )
})

test('Request with tracestate header preserves tracestate', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
  const tracestate = 'vendor1=value1,vendor2=value2'

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent, tracestate }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist with tracestate propagation')
})

test('Context propagation works with async operations', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const childSpan = fastify.otel.tracer.startSpan('async-operation', {}, request.otelContext)
    await new Promise(resolve => setTimeout(resolve, 5))
    childSpan.end()
    
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const childSpan = spans.find(s => s.name === 'async-operation')
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(childSpan, 'Child span should exist')
  t.assert.strictEqual(
    childSpan.spanContext().traceId,
    serverSpan.spanContext().traceId,
    'Child span should have same trace ID as server span'
  )
})

test('Context propagation through nested async calls', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  async function nestedAsyncOperation (tracer, ctx) {
    const span = tracer.startSpan('nested-operation', {}, ctx)
    await new Promise(resolve => setTimeout(resolve, 5))
    span.end()
  }

  fastify.get('/test', async (request) => {
    const span1 = fastify.otel.tracer.startSpan('operation-1', {}, request.otelContext)
    await nestedAsyncOperation(fastify.otel.tracer, request.otelContext)
    span1.end()
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const op1Span = spans.find(s => s.name === 'operation-1')
  const nestedSpan = spans.find(s => s.name === 'nested-operation')
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(op1Span, 'Operation 1 span should exist')
  t.assert.ok(nestedSpan, 'Nested operation span should exist')
  t.assert.strictEqual(
    nestedSpan.spanContext().traceId,
    serverSpan.spanContext().traceId,
    'All spans should share the same trace ID'
  )
})

test('Propagation works with W3C Trace Context format', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.strictEqual(
    serverSpan.spanContext().traceId,
    '4bf92f3577b34da6a3ce929d0e0e4736',
    'Trace ID should match W3C format'
  )
})

test('Invalid traceparent header starts new trace', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent: 'invalid-traceparent' }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(serverSpan.spanContext().traceId, 'New trace should be started for invalid traceparent')
})

test('Context propagation with traceparent and child spans', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request) => {
    const dbSpan = fastify.otel.tracer.startSpan('db.query', {}, request.otelContext)
    dbSpan.setAttribute('db.operation', 'SELECT')
    dbSpan.end()
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const traceparent = `00-${traceId}-b7ad6b7169203331-01`

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const dbSpan = spans.find(s => s.name === 'db.query')
  
  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(dbSpan, 'DB span should exist')
  t.assert.strictEqual(
    dbSpan.spanContext().traceId,
    traceId,
    'Child span should inherit trace ID from traceparent'
  )
})

test('Propagation works across multiple requests with same trace', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/service-a', async () => ({ ok: true }))
  fastify.get('/service-b', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const traceparent = `00-${traceId}-b7ad6b7169203331-01`

  await fastify.inject({
    method: 'GET',
    url: '/service-a',
    headers: { traceparent }
  })

  await fastify.inject({
    method: 'GET',
    url: '/service-b',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serviceASpan = spans.find(s => s.name === 'GET /service-a')
  const serviceBSpan = spans.find(s => s.name === 'GET /service-b')
  
  t.assert.ok(serviceASpan && serviceBSpan, 'Both service spans should exist')
  t.assert.strictEqual(serviceASpan.spanContext().traceId, traceId, 'Service A should have correct trace ID')
  t.assert.strictEqual(serviceBSpan.spanContext().traceId, traceId, 'Service B should have correct trace ID')
})

test('Context is available in request object', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request) => {
    t.assert.ok(request.otelContext, 'otelContext should be available on request')
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.length > 0, 'Spans should be created')
})

test('Propagation works with ignoreRoutes', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health']
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const traceparent = `00-${traceId}-b7ad6b7169203331-01`

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  await fastify.inject({
    method: 'GET',
    url: '/health',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const testSpan = spans.find(s => s.name === 'GET /test')
  const healthSpan = spans.find(s => s.name === 'GET /health')
  
  t.assert.ok(testSpan, 'Test span should exist')
  t.assert.ok(!healthSpan, 'Health span should not exist (ignored route)')
})
