'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('propagation: incoming traceparent creates child span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(
    serverSpan.spanContext().traceId,
    '4bf92f3577b34da6a3ce929d0e0e4736',
    'trace ID from traceparent is preserved'
  )
  t.assert.strictEqual(
    serverSpan.parentSpanId,
    '00f067aa0ba902b7',
    'parent span ID from traceparent is preserved'
  )
})

test('propagation: no traceparent starts new trace', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan.spanContext().traceId, 'trace ID exists')
  t.assert.ok(!serverSpan.parentSpanId, 'no parent span ID')
})

test('propagation: child spans in handler are parented to server span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => {
    const childSpan = fastify.otel.tracer.startSpan('custom-op')
    childSpan.end()
    return { ok: true }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const customSpan = spans.find(s => s.name === 'custom-op')

  t.assert.ok(customSpan, 'custom span exists')
  t.assert.strictEqual(
    customSpan.spanContext().traceId,
    serverSpan.spanContext().traceId,
    'custom span is in same trace'
  )
  t.assert.strictEqual(
    customSpan.parentSpanId,
    serverSpan.spanContext().spanId,
    'custom span is child of server span'
  )
})
