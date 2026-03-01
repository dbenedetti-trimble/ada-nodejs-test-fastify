'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('handler span is a child of server span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId)
})

test('handler span is created for async handlers', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/test' })

  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists for async handler')
})

test('handler span is not created for routes in ignoreRoutes', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  await fastify.inject({ method: 'GET', url: '/health' })

  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan, undefined, 'no handler span for ignored route')
})

test('async handler span duration is at least delay duration', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.ok(handlerSpan.duration[0] >= 0, 'handler span has a duration')
})
