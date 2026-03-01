'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-13: incoming traceparent creates child span with correct trace ID', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

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
  t.assert.strictEqual(
    serverSpan.spanContext().traceId,
    '4bf92f3577b34da6a3ce929d0e0e4736',
    'trace ID is preserved from incoming traceparent'
  )
  t.assert.strictEqual(
    serverSpan.parentSpanId,
    '00f067aa0ba902b7',
    'parent span ID matches incoming traceparent'
  )
})

test('VAL-14: new trace started when no traceparent header', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.spanContext().traceId, 'span has a trace ID')
  t.assert.strictEqual(serverSpan.parentSpanId, undefined, 'span has no parent (new trace)')
})

test('VAL-15: child spans created in handler are parented to server span', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    const customSpan = fastify.otel.tracer.startSpan('custom')
    customSpan.end()
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const customSpan = spans.find(s => s.name === 'custom')

  t.assert.ok(customSpan, 'custom span exists')
  t.assert.strictEqual(
    customSpan.parentSpanId,
    serverSpan.spanContext().spanId,
    'custom span parent is server span'
  )
})

test('different traceparent on each request creates independent traces', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent: '00-aaaabbbbccccddddaaaabbbbccccdddd-0000000000000001-01' }
  })
  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { traceparent: '00-eeeeffffeeeeffffeeeeffffeeeefffff-0000000000000002-01' }
  })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 2, 'two server spans created')
  t.assert.notStrictEqual(
    serverSpans[0].spanContext().traceId,
    serverSpans[1].spanContext().traceId,
    'spans have different trace IDs'
  )
})
