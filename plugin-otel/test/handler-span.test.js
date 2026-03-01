'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('handler span', () => {
  test('fastify.handler child span created for every request (VAL-06)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.ok(handlerSpan, '"fastify.handler" span exists')
    t.assert.strictEqual(
      handlerSpan.parentSpanContext.spanId,
      serverSpan.spanContext().spanId,
      'handler span parent is server span'
    )
    await fastify.close()
  })

  test('handler span duration covers handler execution', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    // Handler span should start after server span
    const serverStartNs = serverSpan.startTime[0] * 1e9 + serverSpan.startTime[1]
    const handlerStartNs = handlerSpan.startTime[0] * 1e9 + handlerSpan.startTime[1]
    t.assert.ok(handlerStartNs >= serverStartNs, 'handler span starts after server span')
    // Handler span should end before server span
    const serverEndNs = serverSpan.endTime[0] * 1e9 + serverSpan.endTime[1]
    const handlerEndNs = handlerSpan.endTime[0] * 1e9 + handlerSpan.endTime[1]
    t.assert.ok(handlerEndNs <= serverEndNs, 'handler span ends before server span')
    await fastify.close()
  })

  test('handler span created for async handlers that return promises (VAL-20)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/slow', async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/slow' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.ok(handlerSpan, 'handler span exists for async handler')
    t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span status UNSET on success')
    await fastify.close()
  })

  test('handler span created for sync handlers that call reply.send()', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/sync', (request, reply) => {
      reply.send({ ok: true })
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/sync' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.ok(handlerSpan, 'handler span exists for sync handler')
    await fastify.close()
  })

  test('handler span records exception and sets ERROR status when handler throws (VAL-10)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/boom', async () => {
      throw new Error('boom')
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/boom' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
    t.assert.ok(
      handlerSpan.events.some(e => e.name === 'exception'),
      'handler span has exception event'
    )
    await fastify.close()
  })

  test('handler span not created for routes in ignoreRoutes', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ ignoreRoutes: ['/health'] })
    fastify.get('/health', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/health' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.ok(!handlerSpan, 'no handler span for ignored route')
    await fastify.close()
  })
})
