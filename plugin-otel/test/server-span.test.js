'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-04: server span is created per request with kind SERVER', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /test', 'span name is METHOD + route')
})

test('VAL-05: server span uses route pattern not resolved URL', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'span name uses route pattern')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id', 'http.route is route pattern')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42', 'url.path is resolved URL')
})

test('one server span per request', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 1, 'exactly one server span per request')
})

test('404 route produces span with method only', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)

  await fastify.inject({ method: 'GET', url: '/nonexistent' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists for 404')
  t.assert.strictEqual(serverSpan.name, 'GET', 'span name is just METHOD for 404')
})
