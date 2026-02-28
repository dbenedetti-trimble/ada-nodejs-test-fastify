'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-06: Handler span is a child of server span
test('handler span is a child of server span', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find((s) => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId)
})

// VAL-20: Async handler spans complete correctly
test('async handler span duration is accurate', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/slow' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find((s) => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  const durationMs = (handlerSpan.duration[0] * 1e3) + (handlerSpan.duration[1] / 1e6)
  t.assert.ok(durationMs >= 50, `handler duration ${durationMs}ms >= 50ms`)
})
