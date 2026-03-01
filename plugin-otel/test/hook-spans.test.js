'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-07: hook spans are created as children of server span when hookSpans: true', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', function (request, reply, done) { done() })
  fastify.addHook('preHandler', function (request, reply, done) { done() })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const onRequestSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')

  t.assert.ok(onRequestSpan, 'fastify.hook.onRequest span exists')
  t.assert.ok(preHandlerSpan, 'fastify.hook.preHandler span exists')
  t.assert.strictEqual(onRequestSpan.parentSpanId, serverSpan.spanContext().spanId, 'onRequest hook span parent is server span')
  t.assert.strictEqual(preHandlerSpan.parentSpanId, serverSpan.spanContext().spanId, 'preHandler hook span parent is server span')
})

test('VAL-08: no hook spans when hookSpans: false', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.addHook('onRequest', function (request, reply, done) { done() })
  fastify.addHook('preHandler', function (request, reply, done) { done() })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when hookSpans: false')
})

test('hookSpans: true is the default', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.ok(hookSpans.length > 0, 'hook spans are created by default')
})

test('hook spans have kind INTERNAL', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  for (const s of hookSpans) {
    t.assert.strictEqual(s.kind, SpanKind.INTERNAL, `${s.name} has kind INTERNAL`)
  }
})
