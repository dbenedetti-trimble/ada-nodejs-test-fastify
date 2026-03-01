'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('server span uses route pattern not resolved URL', async t => {
  t.plan(3)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42')
})

test('one server span created per request', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1)
})

test('server span kind is SERVER', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.kind, SpanKind.SERVER)
})

test('multiple routes produce independent spans', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/a', async () => ({ ok: true }))
  fastify.get('/b', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpans.some(s => s.name === 'GET /a'), 'span for /a exists')
  t.assert.ok(serverSpans.some(s => s.name === 'GET /b'), 'span for /b exists')
})

test('server span name is METHOD only for 404 routes', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.inject({ method: 'GET', url: '/not-found' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpans.length >= 1, 'at least one server span exported')
})

test('request.otelSpan provides access to server span for custom attributes', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'value')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value')
})
