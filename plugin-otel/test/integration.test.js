'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-17: request.otelSpan provides access to server span
test('custom attribute set via request.otelSpan appears on server span', async (t) => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'value')
    return { ok: true }
  })
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value')
})

// VAL-18: Custom spanNameFormatter overrides default naming
test('custom spanNameFormatter overrides default span name', async (t) => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, {
    spanNameFormatter: (request) => `custom ${request.method}`
  })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.name, 'custom GET')
})

// VAL-21: fastify.otel.tracer is available when exposeApi is true
test('fastify.otel.tracer is available after plugin registration', async (t) => {
  t.plan(1)
  const { provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, { exposeApi: true })
  await fastify.ready()

  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is accessible')
})
