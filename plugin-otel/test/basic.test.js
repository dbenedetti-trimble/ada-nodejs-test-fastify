'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('plugin registers without error when OTel API installed and SDK configured', async t => {
  t.plan(2)
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(fastify.hasDecorator('otel'), 'fastify.otel decorator exists')
  t.assert.ok(fastify.otel.tracer, 'tracer is available')
})

test('plugin exposes otelSpan on request when exposeApi is true', async t => {
  t.plan(1)
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { exposeApi: true })

  let spanSeen = null
  fastify.get('/test', async (request) => {
    spanSeen = request.otelSpan
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.ok(spanSeen !== null, 'request.otelSpan was set during request')
})

test('plugin does not register decorators when exposeApi is false', async t => {
  t.plan(1)
  setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { exposeApi: false })
  await fastify.ready()

  t.assert.strictEqual(fastify.hasDecorator('otel'), false)
})

test('plugin registers without error when OTel API installed but no SDK configured', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(true, 'plugin registered without error')
})

test('custom spanNameFormatter overrides default naming', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, {
    spanNameFormatter: (req) => 'custom.' + req.method
  })

  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.some(s => s.name === 'custom.GET'), 'custom span name used')
})
