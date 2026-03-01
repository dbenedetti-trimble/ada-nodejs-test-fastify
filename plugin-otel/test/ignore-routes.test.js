'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('ignoreRoutes prevents span creation for matched routes', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.filter(s => s.name.includes('/health')).length, 0)
  t.assert.ok(spans.some(s => s.name === 'GET /api'))
})

test('request.otelSpan is null when route is in ignoreRoutes', async t => {
  t.plan(1)
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })

  let spanValue
  fastify.get('/health', async (request) => {
    spanValue = request.otelSpan
    return { status: 'ok' }
  })

  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(spanValue, null)
})

test('instrumented route produces spans when other routes are ignored', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/data', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/data' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpans.some(s => s.name === 'GET /data'), 'data route is still instrumented')
})

test('ignoreRoutes with multiple patterns', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health', '/metrics'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics', async () => ({ metrics: [] }))
  fastify.get('/api', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/metrics' })
  await fastify.inject({ method: 'GET', url: '/api' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.filter(s => s.name.includes('/health') || s.name.includes('/metrics')).length, 0)
  t.assert.ok(serverSpans.some(s => s.name === 'GET /api'))
})
