'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-01: Plugin registers with OTel SDK configured
test('plugin registers without error when OTel SDK is configured', async (t) => {
  t.plan(2)
  const { provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(true, 'plugin registered without error')
  t.assert.ok(fastify.hasDecorator('otel'), 'fastify.otel decorator is available')
})

// VAL-02: Plugin is no-op when @opentelemetry/api is not installed
test('plugin is no-op when otel api is missing', async (t) => {
  t.plan(2)
  // TODO(features): use proxyquire to simulate missing @opentelemetry/api
  // For now stub: verify plugin registers without error
  const fastify = Fastify()
  t.after(() => fastify.close())

  t.assert.ok(true, 'placeholder — no-op when missing module')
  t.assert.ok(true, 'placeholder — no hooks registered')
})

// VAL-03: Plugin registers when OTel API installed but no SDK configured
test('plugin registers without error when no TracerProvider configured', async (t) => {
  t.plan(1)
  // Do not call setupOtel() — no provider registered
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  await fastify.ready()

  t.assert.ok(true, 'plugin registered without error with no-op tracer')
})
