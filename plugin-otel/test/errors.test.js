'use strict'

// @covers_ACFR_6_1 @covers_ACFR_6_2 @covers_ACFR_6_3 @covers_ACFR_6_4
// @covers_ACFR_6_5 @covers_ACFR_6_6 @covers_ACFR_6_7 @covers_ACNFR_7_1
// @unit_test

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { SpanKind, SpanStatusCode, trace, context, propagation } = require('@opentelemetry/api')
const otelPlugin = require('../index.js')

function setupOtelProvider () {
  trace.disable()
  context.disable()
  propagation.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

// @covers_ACFR_6_1 @covers_ACFR_6_2 @covers_ACNFR_7_1 @unit_test
test('handler exception is recorded on handler span via recordException', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('boom') })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/fail' })
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  const exceptionEvent = handlerSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception event recorded on handler span via recordException')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
})

// @covers_ACFR_6_5 @unit_test
test('error message is included in the span status description', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('specific error text') })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/fail' })
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.message, 'specific error text', 'error message is span status description')
})

// @covers_ACFR_6_3 @covers_ACNFR_7_1 @unit_test
test('server span status is ERROR for 5xx responses', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('server error') })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500, 'response is 500')
  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR for 5xx')
})

// @covers_ACFR_6_4 @unit_test
test('server span status is UNSET for 4xx responses', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/client-error', async (request, reply) => {
    reply.code(400).send({ error: 'bad request' })
  })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  const res = await fastify.inject({ method: 'GET', url: '/client-error' })
  t.assert.strictEqual(res.statusCode, 400, 'response is 400')
  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status remains UNSET for 4xx')
})

// @covers_ACFR_6_6 @unit_test
test('errors in hooks (not handler) are recorded on server span', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.addHook('preValidation', async (request, reply) => {
    throw new Error('hook error before handler')
  })
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(handlerSpan, undefined, 'no handler span when error occurs in hook before handler')
  const exceptionEvent = serverSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception recorded on server span for hook error')
})

// @covers_ACFR_6_7 @unit_test
test('sync thrown errors in handler are captured', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/sync-error', async () => {
    throw new Error('sync throw')
  })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/sync-error' })
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists for sync throw')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span ERROR for sync throw')
})

// @covers_ACFR_6_7 @unit_test
test('async rejected promises in handler are captured', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)
  fastify.get('/async-error', async () => {
    return Promise.reject(new Error('async rejection'))
  })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/async-error' })
  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists for async rejection')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span ERROR for async rejection')
})
