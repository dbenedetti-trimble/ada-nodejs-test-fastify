'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-04: Server span covers full request lifecycle
test('VAL-04: server span created per request', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 1, 'exactly one server span')
  t.assert.strictEqual(serverSpans[0].name, 'GET /test')

  const [startSec, startNano] = serverSpans[0].startTime
  const [endSec, endNano] = serverSpans[0].endTime
  const startNs = BigInt(startSec) * 1_000_000_000n + BigInt(startNano)
  const endNs = BigInt(endSec) * 1_000_000_000n + BigInt(endNano)
  t.assert.ok(endNs > startNs, 'span has positive duration')

  await fastify.close()
})

// VAL-05: Server span uses route pattern, not resolved URL
test('VAL-05: span uses route pattern, not resolved URL', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/users/:id', async (request) => ({ id: request.params.id }))

  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'span name uses route pattern')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id', 'http.route is parameterized')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42', 'url.path is the actual URL')

  await fastify.close()
})

// VAL-19: Multiple routes produce independent spans
test('VAL-19: multiple routes produce independent spans', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/a', async () => ({ route: 'a' }))
  fastify.get('/b', async () => ({ route: 'b' }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 2, 'two server spans')

  const names = serverSpans.map(s => s.name).sort()
  t.assert.deepStrictEqual(names, ['GET /a', 'GET /b'])

  const traceIds = new Set(serverSpans.map(s => s.spanContext().traceId))
  t.assert.strictEqual(traceIds.size, 2, 'each request has a unique trace ID')

  await fastify.close()
})
