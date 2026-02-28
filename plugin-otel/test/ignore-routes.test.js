'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-16: ignoreRoutes excludes routes from instrumentation
test('ignoreRoutes prevents span creation for matched routes', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.filter((s) => s.name.includes('/health')).length, 0)
  t.assert.ok(spans.some((s) => s.name === 'GET /api'))
})

// request.otelSpan is null for ignored routes
test('request.otelSpan is null for ignored routes', async (t) => {
  t.plan(1)
  const { provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })

  let capturedSpan
  fastify.get('/health', async (request) => {
    capturedSpan = request.otelSpan
    return { status: 'ok' }
  })
  await fastify.inject({ method: 'GET', url: '/health' })

  t.assert.strictEqual(capturedSpan, null)
})
