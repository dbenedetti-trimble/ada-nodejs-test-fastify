'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-06: handler span is a child of server span', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = findSpan(spans, 'fastify.handler')

  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.notStrictEqual(handlerSpan, undefined, 'handler span exists')
  t.assert.strictEqual(
    handlerSpan.parentSpanContext.spanId,
    serverSpan.spanContext().spanId,
    'handler span is child of server span'
  )
})

test('handler span covers async handlers', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.notStrictEqual(handlerSpan, undefined, 'handler span exists for async handler')
})

test('handler span records exception when handler throws', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/fail', async () => {
    throw new Error('db failed')
  })

  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500)

  const spans = getSpans(exporter)
  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.notStrictEqual(handlerSpan, undefined, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, 2, 'handler span status is ERROR (code 2)')
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.strictEqual(handlerSpan.events.length > 0, true, 'handler span has exception event')
  t.assert.strictEqual(handlerSpan.events[0].name, 'exception')
})

test('handler span not created for ignored routes', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false, ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/health' })

  const spans = getSpans(exporter)
  t.assert.strictEqual(spans.length, 0, 'no spans for ignored route')
})
