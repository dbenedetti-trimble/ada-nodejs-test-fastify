'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { setupOtel } = require('./helper')
const { setOtelApi } = require('../lib/otel-api')
const otelPlugin = require('../index')

test('VAL-01: plugin registers with OTel SDK configured', async t => {
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  t.assert.ok(fastify.hasDecorator('otel'), 'fastify.otel decorator is present')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer is present')
})

test('VAL-02: plugin is no-op when @opentelemetry/api is missing', async t => {
  setOtelApi(false)
  t.after(() => setOtelApi(null))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.strictEqual(fastify.hasDecorator('otel'), false, 'fastify.otel is NOT defined')
  t.assert.strictEqual(fastify.hasRequestDecorator('otelSpan'), false, 'request.otelSpan is NOT defined')
})

test('VAL-03: plugin registers when OTel API installed but no SDK configured (no-op tracer)', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  t.assert.ok(fastify.hasDecorator('otel'), 'hooks are registered')

  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200, 'server responds normally')
})

test('exposeApi: false does not register decorators', async t => {
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { exposeApi: false })
  await fastify.ready()

  t.assert.strictEqual(fastify.hasDecorator('otel'), false, 'fastify.otel is NOT defined')
  t.assert.strictEqual(fastify.hasRequestDecorator('otelSpan'), false, 'request.otelSpan is NOT defined')
})
