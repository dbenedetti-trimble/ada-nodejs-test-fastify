'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('error recording on spans (OTEL-6)', () => {
  test('handler exception recorded on handler span with ERROR status (VAL-10)', async (t) => {
    t.plan(3)
    const fastify = buildFastify()
    fastify.get('/boom', async () => { throw new Error('db failed') })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/boom' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
    t.assert.strictEqual(handlerSpan.status.message, 'db failed', 'handler span status message is error message')
    t.assert.ok(
      handlerSpan.events.some(e => e.name === 'exception'),
      'handler span has exception event from recordException'
    )
    await fastify.close()
  })

  test('server span ERROR status set for 5xx response (VAL-10)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/boom', async () => { throw new Error('db failed') })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/boom' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR')
    t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 500)
    await fastify.close()
  })

  test('5xx response without exception sets ERROR status on server span (VAL-11)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/unavailable', async (request, reply) => {
      return reply.code(503).send({ error: 'unavailable' })
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/unavailable' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR for 503')
    t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span status is UNSET (no exception thrown)')
    await fastify.close()
  })

  test('4xx response does not set ERROR status (VAL-12)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/notfound', async (request, reply) => {
      return reply.code(404).send({ error: 'not found' })
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/notfound' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status UNSET for 4xx')
    t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
    await fastify.close()
  })

  test('async rejected promise captured on handler span', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/async-err', async () => {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('async fail')), 5))
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/async-err' })

    const spans = exporter.getFinishedSpans()
    const handlerSpan = spans.find(s => s.name === 'fastify.handler')
    t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'async rejection recorded on handler span')
    await fastify.close()
  })

  test('error in hook (not handler) recorded on server span', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: false })
    fastify.addHook('preHandler', async () => { throw new Error('hook error') })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    // When handler span doesn't exist yet (error in preHandler before handler span starts),
    // the exception is recorded on the server span
    t.assert.ok(
      serverSpan.events.some(e => e.name === 'exception') ||
      serverSpan.status.code === SpanStatusCode.ERROR,
      'error from hook is reflected on server span'
    )
    await fastify.close()
  })

  test('onError hook span records error when hookSpans is true', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/boom', async () => { throw new Error('hook spans error') })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/boom' })

    const spans = exporter.getFinishedSpans()
    const onErrorSpan = spans.find(s => s.name === 'fastify.hook.onError')
    t.assert.ok(
      onErrorSpan && onErrorSpan.events.some(e => e.name === 'exception'),
      'fastify.hook.onError span has exception event'
    )
    await fastify.close()
  })
})
