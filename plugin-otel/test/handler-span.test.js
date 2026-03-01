'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-06: handler span is a child of server span', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId, 'handler span parent is server span')
})

test('VAL-20: async handler span duration reflects async work', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/slow' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(handlerSpan, 'handler span exists for async handler')
  t.assert.ok(serverSpan, 'server span exists')

  const durationMs = (handlerSpan.duration[0] * 1e3) + (handlerSpan.duration[1] / 1e6)
  t.assert.ok(durationMs >= 40, 'handler span duration reflects async delay (>= 40ms)')
})

test('handler span is not created for ignored routes', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))

  await fastify.inject({ method: 'GET', url: '/health' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan, undefined, 'no handler span for ignored route')
})

test('handler span has kind INTERNAL', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan.kind, SpanKind.INTERNAL, 'handler span kind is INTERNAL')
})
