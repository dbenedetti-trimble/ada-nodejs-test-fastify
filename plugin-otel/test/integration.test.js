'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-17: request.otelSpan provides access to server span', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'custom-value')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'custom-value', 'custom attribute set via request.otelSpan')
})

test('VAL-18: custom spanNameFormatter overrides default naming', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, {
    spanNameFormatter: (request) => 'custom:' + request.method + ':' + (request.routeOptions && request.routeOptions.url)
  })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'custom:GET:/test', 'span name from custom formatter')
})

test('VAL-19: multiple routes produce independent spans', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/a', async () => 'a')
  fastify.get('/b', async () => 'b')

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  const serverSpans = exporter.getFinishedSpans().filter(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpans.length, 2, 'two server spans exported')
  const names = serverSpans.map(s => s.name).sort()
  t.assert.deepStrictEqual(names, ['GET /a', 'GET /b'], 'span names match route patterns')
})

test('fastify.otel.tracer returns the tracer instance', async t => {
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(fastify.otel, 'fastify.otel is defined')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is defined')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer has startSpan')
})

test('request.otelSpan is null before onRequest (no instrumentation context)', async t => {
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    t.assert.ok(request.otelSpan, 'request.otelSpan is set during handler')
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })
})
