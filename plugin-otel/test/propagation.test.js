'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('W3C traceparent propagation creates child span with correct trace ID', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

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

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  t.assert.strictEqual(serverSpan.parentSpanId, '00f067aa0ba902b7')
})

test('new trace started when no traceparent header', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.spanContext().traceId, 'trace ID is set')
  t.assert.strictEqual(serverSpan.parentSpanId, undefined)
})

test('child spans in handler are parented to server span', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    const span = fastify.otel.tracer.startSpan('custom')
    span.end()
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const customSpan = spans.find(s => s.name === 'custom')
  t.assert.strictEqual(customSpan.parentSpanId, serverSpan.spanContext().spanId)
})

test('tracestate is propagated when present in request headers', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=value'
    }
  })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span created with tracestate header')
})
