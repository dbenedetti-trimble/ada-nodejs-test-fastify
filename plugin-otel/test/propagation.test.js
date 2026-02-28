'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-13: Incoming traceparent creates child span with correct trace ID
test('W3C traceparent propagation creates child span', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const serverSpan = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  t.assert.strictEqual(serverSpan.parentSpanId, '00f067aa0ba902b7')
})

// VAL-14: New trace started when no traceparent header
test('new trace started when no traceparent header present', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.spanContext().traceId, 'server span has a trace ID')
  t.assert.ok(!serverSpan.parentSpanId, 'server span has no parent span ID')
})

// VAL-15: Child spans in handler are parented correctly
test('child spans created in handler are parented to server span', async (t) => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    const childSpan = fastify.otel.tracer.startSpan('custom')
    childSpan.end()
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  const customSpan = spans.find((s) => s.name === 'custom')
  t.assert.strictEqual(customSpan.parentSpanId, serverSpan.spanContext().spanId)
})
