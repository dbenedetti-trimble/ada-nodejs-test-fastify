'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-17: request.otelSpan provides access to server span
test('VAL-17: request.otelSpan allows custom attributes', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/users/:id', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'value')
    request.otelSpan.setAttribute('user.id', request.params.id)
    return { id: request.params.id }
  })

  await fastify.inject({ method: 'GET', url: '/users/123' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value', 'custom attribute set')
  t.assert.strictEqual(serverSpan.attributes['user.id'], '123', 'user.id attribute set')

  await fastify.close()
})

// VAL-18: Custom spanNameFormatter overrides default naming
test('VAL-18: custom spanNameFormatter', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin, {
    spanNameFormatter: (request) => `custom:${request.method} ${request.routeOptions?.url || request.url}`
  })

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.name, 'custom:GET /test', 'custom span name formatter used')

  await fastify.close()
})
