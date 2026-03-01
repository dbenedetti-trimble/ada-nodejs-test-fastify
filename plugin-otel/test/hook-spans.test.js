'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('lifecycle hook spans', () => {
  test('hookSpans: true creates child spans for lifecycle hook phases (VAL-07)', async (t) => {
    t.plan(2)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const onRequestSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
    const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
    t.assert.ok(onRequestSpan, '"fastify.hook.onRequest" span exists')
    t.assert.ok(preHandlerSpan, '"fastify.hook.preHandler" span exists')
    await fastify.close()
  })

  test('hook spans are children of the server span (VAL-07)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
    t.assert.ok(
      hookSpans.every(s => s.parentSpanContext?.spanId === serverSpan.spanContext().spanId),
      'all hook spans are children of the server span'
    )
    await fastify.close()
  })

  test('hookSpans: false produces only server span and handler span (VAL-08)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: false })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
    t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when hookSpans: false')
    await fastify.close()
  })

  test('with hookSpans: true, all instrumented phase spans are exported', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const hookSpanNames = spans.filter(s => s.name.startsWith('fastify.hook.')).map(s => s.name)
    const expectedPhases = ['fastify.hook.onRequest', 'fastify.hook.preParsing', 'fastify.hook.preValidation', 'fastify.hook.preHandler', 'fastify.hook.preSerialization', 'fastify.hook.onSend']
    t.assert.ok(
      expectedPhases.every(name => hookSpanNames.includes(name)),
      'all expected hook phase spans are exported'
    )
    await fastify.close()
  })

  test('onError hook span created only when an error occurs', async (t) => {
    t.plan(2)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/ok', async () => ({ ok: true }))
    fastify.get('/err', async () => { throw new Error('test error') })
    await fastify.ready()

    // Success request: no onError span
    await fastify.inject({ method: 'GET', url: '/ok' })
    const successSpans = exporter.getFinishedSpans()
    const onErrorSpanSuccess = successSpans.find(s => s.name === 'fastify.hook.onError')
    t.assert.ok(!onErrorSpanSuccess, 'no onError span for successful request')

    exporter.reset()

    // Error request: onError span present
    await fastify.inject({ method: 'GET', url: '/err' })
    const errorSpans = exporter.getFinishedSpans()
    const onErrorSpanError = errorSpans.find(s => s.name === 'fastify.hook.onError')
    t.assert.ok(onErrorSpanError, 'onError span exists when an error occurs')
    await fastify.close()
  })

  test('onResponse does not get its own hook span', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const onResponseSpan = spans.find(s => s.name === 'fastify.hook.onResponse')
    t.assert.ok(!onResponseSpan, 'no fastify.hook.onResponse span')
    await fastify.close()
  })

  test('all hook phase span names follow fastify.hook.{hookName} convention', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ hookSpans: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
    t.assert.ok(hookSpans.length > 0, 'hook spans follow fastify.hook.{hookName} convention')
    await fastify.close()
  })
})
