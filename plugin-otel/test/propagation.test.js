'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-13: W3C Trace Context propagation from incoming headers', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.strictEqual(
    serverSpan.spanContext().traceId,
    '4bf92f3577b34da6a3ce929d0e0e4736',
    'trace ID from traceparent is preserved'
  )
  t.assert.strictEqual(
    serverSpan.parentSpanContext.spanId,
    '00f067aa0ba902b7',
    'parent span ID matches traceparent'
  )
})

test('VAL-14: new trace started when no traceparent header', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.notStrictEqual(serverSpan.spanContext().traceId, undefined, 'has a trace ID')
  t.assert.strictEqual(serverSpan.parentSpanContext, undefined, 'no parent span ID')
})

test('VAL-15: child spans in handler are parented to server span via active context', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async (request) => {
    const otelApi = require('@opentelemetry/api')
    const tracer = fastify.otel.tracer
    const childSpan = tracer.startSpan('custom', {}, otelApi.trace.setSpan(
      otelApi.context.active(),
      request.otelSpan
    ))
    childSpan.end()
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const customSpan = findSpan(spans, 'custom')
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.notStrictEqual(customSpan, undefined, 'custom child span exists')
  t.assert.strictEqual(
    customSpan.parentSpanContext.spanId,
    serverSpan.spanContext().spanId,
    'custom span is child of server span'
  )
})
