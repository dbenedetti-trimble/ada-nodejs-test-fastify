'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')

test('plugin registers with OTel SDK configured', async t => {
  const { provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(fastify.otel, 'fastify.otel decorator exists')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer exists')
})

test('plugin registers with OTel API but no SDK configured (no-op tracer)', async t => {
  const api = require('@opentelemetry/api')
  api.trace.disable()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  t.assert.ok(fastify.otel, 'fastify.otel decorator still exists')

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

test('exposeApi: false does not add decorators', async t => {
  const { provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { exposeApi: false })
  await fastify.ready()

  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel is not defined')
})

test('plugin registers hooks when OTel is available', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = await getSpans(exporter, provider)
  t.assert.ok(spans.length > 0, 'spans are produced when OTel is active')
})
