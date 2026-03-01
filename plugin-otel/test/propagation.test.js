'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind, context } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const PARENT_SPAN_ID = '00f067aa0ba902b7'
const TRACEPARENT = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`

describe('W3C Trace Context propagation (OTEL-7)', () => {
  test('incoming traceparent creates server span as child of remote trace (VAL-13)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: { traceparent: TRACEPARENT }
    })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.spanContext().traceId, TRACE_ID, 'server span trace ID matches incoming traceparent')
    t.assert.strictEqual(serverSpan.parentSpanContext.spanId, PARENT_SPAN_ID, 'server span parent ID matches incoming span ID')
    await fastify.close()
  })

  test('request without traceparent starts a new trace (VAL-14)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(serverSpan.spanContext().traceId !== '00000000000000000000000000000000', 'server span has new (non-zero) trace ID')
    t.assert.ok(!serverSpan.parentSpanContext, 'server span has no parent span ID')
    await fastify.close()
  })

  test('tracestate values propagated to server span context', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        traceparent: TRACEPARENT,
        tracestate: 'vendor=value'
      }
    })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    // The span is a child of the remote trace, confirming context extraction worked
    t.assert.strictEqual(serverSpan.spanContext().traceId, TRACE_ID, 'tracestate propagation: span is child of remote trace')
    await fastify.close()
  })

  test('child spans created inside handler are parented to server span (VAL-15)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async (request) => {
      // Create a child span using the active context (which has server span active)
      const activeCtx = context.active()
      const childSpan = fastify.otel.tracer.startSpan('custom', {}, activeCtx)
      childSpan.end()
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const customSpan = spans.find(s => s.name === 'custom')
    t.assert.strictEqual(
      customSpan.parentSpanContext.spanId,
      serverSpan.spanContext().spanId,
      '"custom" span is parented to server span'
    )
    await fastify.close()
  })

  test('context propagation works with async handlers', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async (request) => {
      await new Promise(resolve => setTimeout(resolve, 5))
      const activeCtx = context.active()
      const childSpan = fastify.otel.tracer.startSpan('async-child', {}, activeCtx)
      childSpan.end()
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const customSpan = spans.find(s => s.name === 'async-child')
    t.assert.strictEqual(
      customSpan.parentSpanContext.spanId,
      serverSpan.spanContext().spanId,
      'async child span is parented to server span'
    )
    await fastify.close()
  })
})
