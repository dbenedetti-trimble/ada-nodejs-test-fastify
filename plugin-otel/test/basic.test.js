'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const proxyquire = require('proxyquire')

const otelPlugin = require('../index')

// VAL-01: Plugin registers with OTel SDK configured
test('VAL-01: plugin registers with OTel SDK configured', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  t.assert.ok(fastify.otel, 'fastify.otel decorator exists')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is available')

  fastify.get('/test', async () => ({ ok: true }))

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = getSpans(otelCtx.exporter)
  t.assert.ok(spans.length > 0, 'spans are exported when SDK is configured')

  await fastify.close()
})

// VAL-02: Plugin is no-op when @opentelemetry/api is missing
test('VAL-02: plugin is no-op when @opentelemetry/api is missing', async (t) => {
  const otelPluginNoOtel = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false,
      '@noCallThru': true
    }
  })

  const fastify = Fastify()
  await fastify.register(otelPluginNoOtel)

  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel is not defined')

  fastify.get('/test', async () => ({ ok: true }))

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200, 'server works without OTel')

  await fastify.close()
})

// VAL-03: Plugin registers when OTel API installed but no SDK configured
test('VAL-03: plugin registers with OTel API but no SDK configured', async (t) => {
  const fastify = Fastify()
  await fastify.register(otelPlugin)

  t.assert.ok(fastify.otel, 'fastify.otel decorator exists even without SDK')
  t.assert.ok(fastify.otel.tracer, 'tracer is available (no-op)')

  fastify.get('/test', async () => ({ ok: true }))

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200, 'server works with no-op tracer')

  await fastify.close()
})
