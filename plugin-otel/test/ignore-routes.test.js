'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('ignoreRoutes exclusion (OTEL-1)', () => {
  test('ignored routes produce no spans (VAL-16)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ ignoreRoutes: ['/health'] })
    fastify.get('/health', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/health' })

    const spans = exporter.getFinishedSpans()
    t.assert.strictEqual(spans.length, 0, 'no spans exported for ignored route')
    await fastify.close()
  })

  test('non-ignored routes still produce spans when ignoreRoutes is set (VAL-16)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ ignoreRoutes: ['/health'] })
    fastify.get('/health', async () => ({ ok: true }))
    fastify.get('/api/data', async () => ({ data: 'yes' }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/api/data' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(serverSpan, 'server span exported for non-ignored route')
    await fastify.close()
  })

  test('request.otelSpan is null/undefined for ignored routes', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ ignoreRoutes: ['/health'], exposeApi: true })
    let capturedSpan = 'not-checked'
    fastify.get('/health', async (request) => {
      capturedSpan = request.otelSpan
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/health' })

    t.assert.ok(!capturedSpan, 'request.otelSpan is falsy for ignored route')
    await fastify.close()
  })

  test('ignoreRoutes defaults to empty list (all routes instrumented)', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/all', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/all' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(serverSpan, 'server span exported when no ignoreRoutes set')
    await fastify.close()
  })
})
