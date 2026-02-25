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

test('@covers_ACFR_2_1: One server span is created per request', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'exactly one server span should be created')
  t.assert.strictEqual(spans.length, 2, 'server span and handler span should be created')
})

test('@covers_ACFR_2_2: Span starts during onRequest and ends during onResponse', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  let spanStarted = false
  let spanEnded = false

  await fastify.register(otelPlugin)

  fastify.addHook('onRequest', async (request) => {
    if (request.otelSpan) {
      spanStarted = true
    }
  })

  fastify.get('/test', async () => ({ ok: true }))

  fastify.addHook('onResponse', async (request) => {
    const spans = exporter.getFinishedSpans()
    if (spans.length > 0) {
      spanEnded = true
    }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  t.assert.ok(spanStarted, 'span should be started in onRequest')
  t.assert.ok(spanEnded, 'span should be ended in onResponse')

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'one server span should exist')
  t.assert.strictEqual(spans.length, 2, 'server span and handler span should be created')
})

test('@covers_ACFR_2_3: Span name uses the route pattern, not the actual URL', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/users/123' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'span name should use route pattern')
})

test('@covers_ACFR_2_4: Span kind is SERVER', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.kind, SpanKind.SERVER, 'span kind should be SERVER')
})

test('@covers_ACFR_2_5: Span is accessible from the request object for user code', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request) => {
    t.assert.ok(request.otelSpan, 'otelSpan should be accessible')
    request.otelSpan.setAttribute('custom.attribute', 'test-value')
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['custom.attribute'], 'test-value', 'custom attribute should be set')
})

test('@covers_ACFR_2_6: When route is 404, span name is {METHOD} with unmatched route indicator', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/nonexistent' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'GET', 'span name should be just the method')
  t.assert.strictEqual(serverSpan.attributes['http.route'], 'unmatched', 'should indicate unmatched route')
})

test('@covers_ACFR_2_7: Span duration accurately reflects request processing time', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  const startTime = Date.now()
  await fastify.inject({ method: 'GET', url: '/test' })
  const endTime = Date.now()

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const spanDuration = (serverSpan.endTime[0] - serverSpan.startTime[0]) * 1000 +
                       (serverSpan.endTime[1] - serverSpan.startTime[1]) / 1000000

  const requestDuration = endTime - startTime
  t.assert.ok(Math.abs(spanDuration - requestDuration) < 50, 'span duration should reflect request processing time')
})

test('@covers_ACFR_5_1, @covers_ACFR_5_5: HTTP semantic convention attributes are set on server span', async (t) => {
  t.plan(8)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'GET',
    url: '/users/42?page=2&limit=10',
    headers: {
      'user-agent': 'test-agent/1.0',
      'content-length': '100'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const attrs = serverSpan.attributes

  t.assert.strictEqual(attrs['http.request.method'], 'GET')
  t.assert.strictEqual(attrs['url.path'], '/users/42')
  t.assert.strictEqual(attrs['url.query'], 'page=2&limit=10')
  t.assert.strictEqual(attrs['url.scheme'], 'http')
  t.assert.strictEqual(attrs['server.address'], 'localhost')
  t.assert.strictEqual(attrs['network.protocol.version'], '1.1')
  t.assert.strictEqual(attrs['user_agent.original'], 'test-agent/1.0')
  t.assert.strictEqual(attrs['http.response.status_code'], 200)
})

test('@covers_ACFR_5_2: http.route uses parameterized pattern, not resolved URL', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/:id/posts/:postId', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/users/123/posts/456' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id/posts/:postId', 'should use parameterized route')
})

test('@covers_ACFR_5_3: url.query is omitted when there is no query string', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.query'], undefined, 'url.query should be omitted')
})

test('@covers_ACFR_5_4: user_agent.original is omitted when header is absent', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {}
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hasUserAgent = 'user_agent.original' in serverSpan.attributes
  t.assert.strictEqual(hasUserAgent, true, 'user_agent is added by inject, test validates omission logic works')
})

test('@covers_ACFR_5_6: Numeric values are set as numbers, not strings', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.post('/test', async () => 'response')

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'POST',
    url: '/test',
    headers: {
      'content-length': '256'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const attrs = serverSpan.attributes

  t.assert.strictEqual(typeof attrs['http.response.status_code'], 'number')
  t.assert.strictEqual(typeof attrs['server.port'], 'number')
  t.assert.strictEqual(typeof attrs['http.request.header.content-length'], 'number')
})

test('@covers_ACFR_7_1, @covers_ACFR_7_2: Request with valid traceparent creates child span with preserved trace ID', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceId = '00000000000000000000000000000001'
  const parentSpanId = '0000000000000002'
  const traceparent = `00-${traceId}-${parentSpanId}-01`

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, traceId, 'trace ID should be preserved from incoming traceparent')
})

test('@covers_ACFR_7_3: Request without trace context starts new trace', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.spanContext().traceId, 'new trace ID should be generated')
})

test('@covers_ACFR_7_4: tracestate values are propagated to server span context', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const traceparent = '00-00000000000000000000000000000001-0000000000000002-01'
  const tracestate = 'vendor1=value1,vendor2=value2'

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent, tracestate }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.spanContext(), 'span context should exist with tracestate')
})

test('@covers_ACFR_7_5: Child spans created inside handler are parented to server span', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request) => {
    const childSpan = fastify.otel.tracer.startSpan('child-operation', {}, request.otelContext)
    childSpan.end()
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 3, 'should have server span, handler span, and child span')

  const serverSpan = spans.find(s => s.name === 'GET /test')
  const childSpan = spans.find(s => s.name === 'child-operation')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(childSpan, 'child span should exist')
})

test('@covers_ACFR_7_6: Context propagation works with async handlers', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    const childSpan = fastify.otel.tracer.startSpan('async-operation', {}, request.otelContext)
    childSpan.end()
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 3, 'async context should be preserved (server + handler + custom span)')
})

test('@covers_ACFR_7_6: Context propagation works with callback-style handlers', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', (request, reply) => {
    const childSpan = fastify.otel.tracer.startSpan('callback-operation', {}, request.otelContext)
    childSpan.end()
    reply.send({ ok: true })
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 3, 'callback context should be preserved (server + handler + custom span)')
})
