'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('integration: multiple routes produce independent spans', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/a', async () => ({ route: 'a' }))
  fastify.get('/b', async () => ({ route: 'b' }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const spans = await getSpans(exporter, provider)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
  const names = serverSpans.map(s => s.name)

  t.assert.ok(names.includes('GET /a'), 'span for /a')
  t.assert.ok(names.includes('GET /b'), 'span for /b')

  const traceIds = new Set(serverSpans.map(s => s.spanContext().traceId))
  t.assert.strictEqual(traceIds.size, 2, 'different trace IDs for different requests')
})

test('integration: request.otelSpan.setAttribute adds custom attributes', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/users/:id', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'value')
    request.otelSpan.setAttribute('user.id', request.params.id)
    return { ok: true }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value')
  t.assert.strictEqual(serverSpan.attributes['user.id'], '42')
})

test('integration: custom spanNameFormatter overrides default naming', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, {
    hookSpans: false,
    spanNameFormatter: (request) => `CUSTOM ${request.method} ${request.url}`
  })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.name, 'CUSTOM GET /test')
})

test('integration: async handler with delay spans complete correctly', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })
  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/slow' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span ends')
  t.assert.ok(handlerSpan, 'handler span ends')

  const handlerDurationMs = handlerSpan.duration[0] * 1e3 + handlerSpan.duration[1] / 1e6
  t.assert.ok(handlerDurationMs >= 40, `handler duration ${handlerDurationMs}ms >= 40ms`)
})

test('integration: fastify.otel.tracer returns tracer instance', async t => {
  const { provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(fastify.otel.tracer, 'tracer exists')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer has startSpan method')
})
