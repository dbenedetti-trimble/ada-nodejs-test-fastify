'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-16: ignoreRoutes excludes route from instrumentation', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))

  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/api' })

  const spans = exporter.getFinishedSpans()
  const healthSpans = spans.filter(s => s.name.includes('/health'))
  const apiSpan = spans.find(s => s.name === 'GET /api')

  t.assert.strictEqual(healthSpans.length, 0, 'no spans for ignored /health route')
  t.assert.ok(apiSpan, 'span created for /api route')
})

test('ignoreRoutes: non-ignored routes still produce spans', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/ping', '/health'] })
  fastify.get('/ping', async () => 'pong')
  fastify.get('/health', async () => ({ ok: true }))
  fastify.get('/users', async () => [])

  await fastify.inject({ method: 'GET', url: '/ping' })
  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/users' })

  const spans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(spans.length, 1, 'only one server span (for /users)')
  t.assert.strictEqual(spans[0].name, 'GET /users', 'span is for /users route')
})

test('ignored route: request.otelSpan is null', async t => {
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  let capturedSpan
  await fastify.register(otelPlugin, { ignoreRoutes: ['/health'] })
  fastify.get('/health', async (request) => {
    capturedSpan = request.otelSpan
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/health' })

  t.assert.strictEqual(capturedSpan, null, 'request.otelSpan is null for ignored route')
})

test('ignoreRoutes uses route pattern not resolved URL', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { ignoreRoutes: ['/users/:id'] })
  fastify.get('/users/:id', async () => ({ ok: true }))
  fastify.get('/users', async () => [])

  await fastify.inject({ method: 'GET', url: '/users/42' })
  await fastify.inject({ method: 'GET', url: '/users' })

  const spans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(spans.length, 1, 'only /users produces a span')
  t.assert.strictEqual(spans[0].name, 'GET /users', 'span is for /users, not /users/:id')
})
