'use strict'

// @covers_ACFR_4_1 @covers_ACFR_4_2 @covers_ACFR_4_3 @covers_ACFR_4_4
// @covers_ACFR_4_5 @covers_ACFR_4_6 @covers_ACNFR_2_1 @unit_test

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { SpanKind, trace, context, propagation } = require('@opentelemetry/api')
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

// @covers_ACFR_4_1 @covers_ACFR_4_2 @covers_ACNFR_2_1
test('hookSpans - onRequest hook phase produces named child span', async t => {
  t.plan(4)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', async (req, reply) => {})
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hookSpan = spans.find(s => s.name === 'fastify.hook.onRequest')

  t.assert.ok(hookSpan, 'fastify.hook.onRequest span exists')
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(hookSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'hook span is child of server span')
  t.assert.strictEqual(hookSpan.spanContext().traceId, serverSpan.spanContext().traceId, 'hook span shares trace id')
})

// @covers_ACFR_4_2
test('hookSpans - hook spans are siblings of handler span', async t => {
  t.plan(3)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('preHandler', async (req, reply) => {})
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hookSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(hookSpan, 'preHandler hook span exists')
  t.assert.strictEqual(hookSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'hook span is child of server span')
  t.assert.strictEqual(handlerSpan.parentSpanContext?.spanId, serverSpan.spanContext().spanId, 'handler span and hook span are siblings')
})

// @covers_ACFR_4_3
test('hookSpans - disabled when hookSpans: false', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.addHook('onRequest', async (req, reply) => {})
  fastify.addHook('preParsing', async (req, reply, payload) => payload)
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const hookSpans = exporter.getFinishedSpans().filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when hookSpans: false')
})

// @covers_ACFR_4_4
test('hookSpans - phases without user hooks produce no spans', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const hookSpans = exporter.getFinishedSpans().filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when no user hooks registered')
})

// @covers_ACFR_4_5
test('hookSpans - onError span created only when error occurs', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onError', async (req, reply, error) => {})
  fastify.get('/ok', async () => ({ ok: true }))
  fastify.get('/fail', async () => { throw new Error('boom') })
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/ok' })
  const noErrorSpans = exporter.getFinishedSpans().filter(s => s.name === 'fastify.hook.onError')
  t.assert.strictEqual(noErrorSpans.length, 0, 'no onError span for successful request')

  exporter.reset()

  await fastify.inject({ method: 'GET', url: '/fail' })
  const errorSpans = exporter.getFinishedSpans().filter(s => s.name === 'fastify.hook.onError')
  t.assert.strictEqual(errorSpans.length, 1, 'onError span created when error occurs')
})

// @covers_ACFR_4_6
test('hookSpans - onResponse does not get a hook span', async t => {
  t.plan(1)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onResponse', async (req, reply) => {})
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const onResponseHookSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.hook.onResponse')
  t.assert.strictEqual(onResponseHookSpan, undefined, 'onResponse does not produce a hook span')
})

// @covers_ACNFR_2_1 - multiple phases produce named spans
test('hookSpans - multiple lifecycle phases each produce named spans', async t => {
  t.plan(5)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', async (req, reply) => {})
  fastify.addHook('preParsing', async (req, reply, payload) => payload)
  fastify.addHook('preValidation', async (req, reply) => {})
  fastify.addHook('preHandler', async (req, reply) => {})
  fastify.addHook('onSend', async (req, reply, payload) => payload)
  fastify.get('/test', async () => ({ ok: true }))
  t.after(async () => { await fastify.close(); await provider.shutdown(); exporter.reset() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.find(s => s.name === 'fastify.hook.onRequest'), 'onRequest span exists')
  t.assert.ok(spans.find(s => s.name === 'fastify.hook.preParsing'), 'preParsing span exists')
  t.assert.ok(spans.find(s => s.name === 'fastify.hook.preValidation'), 'preValidation span exists')
  t.assert.ok(spans.find(s => s.name === 'fastify.hook.preHandler'), 'preHandler span exists')
  t.assert.ok(spans.find(s => s.name === 'fastify.hook.onSend'), 'onSend span exists')
})
