'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-04: Server span covers full request lifecycle
test('server span created per request with kind SERVER', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /test')
})

// VAL-05: Server span uses route pattern not resolved URL
test('server span uses route pattern not resolved URL', async (t) => {
  t.plan(3)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42')
})

// VAL-19: Multiple routes produce independent spans
test('multiple routes produce independent server spans', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/a', async () => ({ a: true }))
  fastify.get('/b', async () => ({ b: true }))
  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const serverSpans = exporter.getFinishedSpans().filter((s) => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpans.some((s) => s.name === 'GET /a'), 'span for /a')
  t.assert.ok(serverSpans.some((s) => s.name === 'GET /b'), 'span for /b')
})
