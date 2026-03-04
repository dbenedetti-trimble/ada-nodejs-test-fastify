'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans } = require('./helper')

test('VAL-01: plugin registers with OTel SDK configured', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.ready()
  t.assert.notStrictEqual(fastify.otel, undefined, 'fastify.otel should be defined')
  t.assert.notStrictEqual(fastify.otel.tracer, undefined, 'fastify.otel.tracer should be defined')

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = getSpans(exporter)
  t.assert.strictEqual(spans.length > 0, true, 'should have exported at least one span')
})

test('VAL-02: plugin is no-op when @opentelemetry/api is missing', async t => {
  const proxyquire = require('proxyquire').noPreserveCache()
  const plugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi () { return false }
    }
  })

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(plugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.ready()
  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel should not be defined')

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

test('VAL-03: plugin registers when OTel API installed but no SDK configured', async t => {
  const api = require('@opentelemetry/api')
  api.trace.disable()

  const fastify = Fastify()
  t.after(() => fastify.close())

  const proxyquire = require('proxyquire').noPreserveCache()
  const plugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi () { return api }
    }
  })

  fastify.register(plugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.ready()
  t.assert.notStrictEqual(fastify.otel, undefined, 'fastify.otel should be defined')
  t.assert.notStrictEqual(fastify.otel.tracer, undefined, 'tracer should be available')

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

test('exposeApi: false does not register decorators', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { exposeApi: false })
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.ready()
  t.assert.strictEqual(fastify.otel, undefined, 'otel decorator should not exist')
})
