'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-13: W3C Trace Context propagation from incoming headers
test('VAL-13: traceparent header creates child span', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
  const parentSpanId = '00f067aa0ba902b7'

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: `00-${traceId}-${parentSpanId}-01`
    }
  })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.spanContext().traceId, traceId, 'trace ID preserved from traceparent')
  t.assert.strictEqual(serverSpan.parentSpanContext?.spanId, parentSpanId, 'parent span ID from traceparent')

  await fastify.close()
})

// VAL-14: New trace started when no traceparent header
test('VAL-14: new trace when no traceparent header', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan.spanContext().traceId, 'trace ID is generated')
  t.assert.strictEqual(serverSpan.spanContext().traceId.length, 32, 'trace ID is 32 hex chars')
  t.assert.strictEqual(serverSpan.parentSpanContext, undefined, 'no parent span context')

  await fastify.close()
})

// VAL-15: Child spans in handler are parented correctly
test('VAL-15: child spans in handler parented to server span', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => {
    const customSpan = fastify.otel.tracer.startSpan('custom')
    customSpan.end()
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const customSpan = spans.find(s => s.name === 'custom')

  t.assert.ok(customSpan, 'custom span exists')
  t.assert.strictEqual(
    customSpan.parentSpanContext?.spanId,
    serverSpan.spanContext().spanId,
    'custom span is child of server span'
  )

  await fastify.close()
})
