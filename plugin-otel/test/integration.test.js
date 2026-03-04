'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-17: request.otelSpan provides access to server span for custom attributes', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'value')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value', 'custom attribute is set')
})

test('VAL-18: custom spanNameFormatter overrides default naming', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, {
    hookSpans: false,
    spanNameFormatter (request) {
      return 'CUSTOM ' + request.method
    }
  })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'CUSTOM GET', 'custom span name formatter used')
})

test('VAL-19: multiple routes produce independent spans', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/a', async () => ({ route: 'a' }))
  fastify.get('/b', async () => ({ route: 'b' }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const spans = getSpans(exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 2, 'two server spans')

  const names = serverSpans.map(s => s.name).sort()
  t.assert.deepStrictEqual(names, ['GET /a', 'GET /b'], 'correct span names')
})

test('VAL-20: async handler spans complete correctly', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/slow' })

  const spans = getSpans(exporter)
  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.notStrictEqual(handlerSpan, undefined, 'handler span exists')

  const durationMs = (handlerSpan.endTime[0] - handlerSpan.startTime[0]) * 1000 +
    (handlerSpan.endTime[1] - handlerSpan.startTime[1]) / 1e6
  t.assert.strictEqual(durationMs >= 40, true, 'handler span duration >= 40ms (actual: ' + durationMs.toFixed(1) + 'ms)')

  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.notStrictEqual(serverSpan, undefined, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, 0, 'server span has no error status')
  t.assert.strictEqual(handlerSpan.status.code, 0, 'handler span has no error status')
})

test('fastify.otel.tracer returns a tracer instance', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  await fastify.ready()

  t.assert.notStrictEqual(fastify.otel, undefined, 'otel decorator exists')
  t.assert.notStrictEqual(fastify.otel.tracer, undefined, 'tracer exists')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer has startSpan')
})

test('duplicate registration throws FST_ERR_DEC_ALREADY_PRESENT', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin)
  fastify.register(otelPlugin)

  try {
    await fastify.ready()
    t.assert.fail('should have thrown')
  } catch (err) {
    t.assert.strictEqual(err.message.includes('already'), true, 'error about duplicate decorator: ' + err.message)
  }
})
