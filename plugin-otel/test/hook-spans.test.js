'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-07: Hook spans created when hookSpans is true
test('VAL-07: hook spans created with hookSpans: true', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hookSpanNames = spans
    .filter(s => s.name.startsWith('fastify.hook.'))
    .map(s => s.name)

  t.assert.ok(hookSpanNames.includes('fastify.hook.onRequest'), 'onRequest hook span exists')
  t.assert.ok(hookSpanNames.includes('fastify.hook.preHandler'), 'preHandler hook span exists')

  const onRequestHookSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  t.assert.strictEqual(
    onRequestHookSpan.parentSpanContext?.spanId,
    serverSpan.spanContext().spanId,
    'hook span is child of server span'
  )

  const preHandlerHookSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
  t.assert.strictEqual(
    preHandlerHookSpan.parentSpanContext?.spanId,
    serverSpan.spanContext().spanId,
    'preHandler hook span is child of server span'
  )

  await fastify.close()
})

// VAL-08: No hook spans when hookSpans is false
test('VAL-08: no hook spans with hookSpans: false', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin, { hookSpans: false })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when disabled')

  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(serverSpan, 'server span still created')
  t.assert.ok(handlerSpan, 'handler span still created')

  await fastify.close()
})
