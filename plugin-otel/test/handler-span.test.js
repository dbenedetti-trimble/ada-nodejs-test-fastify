'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-06: Handler span is a child of server span
test('VAL-06: handler span is a child of server span', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.name, 'fastify.handler')
  t.assert.strictEqual(
    handlerSpan.parentSpanContext?.spanId,
    serverSpan.spanContext().spanId,
    'handler span is child of server span'
  )

  await fastify.close()
})

// VAL-20: Async handler spans complete correctly
test('VAL-20: async handler span duration reflects handler time', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/slow' })

  const spans = getSpans(otelCtx.exporter)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span exists')

  const [startSec, startNano] = handlerSpan.startTime
  const [endSec, endNano] = handlerSpan.endTime
  const durationMs = (endSec - startSec) * 1000 + (endNano - startNano) / 1e6
  t.assert.ok(durationMs >= 40, `handler span duration (${durationMs}ms) >= 40ms`)

  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.status.code, 0, 'server span has no error status')

  await fastify.close()
})
