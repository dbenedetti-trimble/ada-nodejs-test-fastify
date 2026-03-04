'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-07: hook spans created when hookSpans is true', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')

  const hookOnRequest = findSpan(spans, 'fastify.hook.onRequest')
  t.assert.notStrictEqual(hookOnRequest, undefined, 'onRequest hook span exists')
  t.assert.strictEqual(
    hookOnRequest.parentSpanContext.spanId,
    serverSpan.spanContext().spanId,
    'onRequest hook span is child of server span'
  )

  const hookPreHandler = findSpan(spans, 'fastify.hook.preHandler')
  t.assert.notStrictEqual(hookPreHandler, undefined, 'preHandler hook span exists')
  t.assert.strictEqual(
    hookPreHandler.parentSpanContext.spanId,
    serverSpan.spanContext().spanId,
    'preHandler hook span is child of server span'
  )
})

test('VAL-08: no hook spans when hookSpans is false', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when disabled')

  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span still exists')

  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.notStrictEqual(handlerSpan, undefined, 'handler span still exists')
})

test('hook span names follow fastify.hook.{hookName} convention', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  for (const span of hookSpans) {
    t.assert.notStrictEqual(
      span.name.match(/^fastify\.hook\.\w+$/),
      null,
      'hook span name matches pattern: ' + span.name
    )
  }
})

test('onError hook span created when error occurs', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/fail', async () => {
    throw new Error('boom')
  })

  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = getSpans(exporter)
  const onErrorSpan = findSpan(spans, 'fastify.hook.onError')
  t.assert.notStrictEqual(onErrorSpan, undefined, 'onError hook span exists when error occurs')
})
