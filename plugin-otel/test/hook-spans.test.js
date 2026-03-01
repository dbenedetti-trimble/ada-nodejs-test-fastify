'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('hook spans are created when hookSpans is true', async t => {
  t.plan(3)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const onRequestSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(onRequestSpan, 'fastify.hook.onRequest span exists')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(onRequestSpan.parentSpanId, serverSpan.spanContext().spanId)
})

test('hook spans are children of server span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.ok(hookSpans.length > 0, 'at least one hook span exists')
  t.assert.ok(hookSpans.every(hs => hs.parentSpanId === serverSpan.spanContext().spanId), 'all hook spans are children of server span')
})

test('no hook spans when hookSpans is false', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const hookSpans = exporter.getFinishedSpans().filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0)
})

test('fastify.hook.preHandler span is a child of server span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('preHandler', async (request, reply) => { })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const preHandlerHookSpan = spans.find(s => s.name === 'fastify.hook.preHandler')

  t.assert.ok(preHandlerHookSpan, 'fastify.hook.preHandler span exists')
  t.assert.strictEqual(preHandlerHookSpan.parentSpanId, serverSpan.spanContext().spanId)
})

test('onError hook span is created when an error occurs', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/fail', async () => { throw new Error('test error') })
  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const errorHookSpan = spans.find(s => s.name === 'fastify.hook.onError')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(errorHookSpan, 'fastify.hook.onError span exists when error occurs')
  t.assert.strictEqual(errorHookSpan.parentSpanId, serverSpan.spanContext().spanId)
})
