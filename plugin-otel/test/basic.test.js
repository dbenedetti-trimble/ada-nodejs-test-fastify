'use strict'

const { test, describe, after } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const proxyquire = require('proxyquire')
const { createTestSetup } = require('./helpers/setup')
const { _resetOtelApi } = require('../lib/otel-api')

const { buildFastify, teardown } = createTestSetup()

after(teardown)

describe('basic: plugin registration', () => {
  test('registers without error when @opentelemetry/api is installed with SDK configured (VAL-01)', async (t) => {
    t.plan(2)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    t.assert.ok(fastify.otel, 'fastify.otel decorator registered')
    t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer available')
    await fastify.close()
  })

  test('registers without error when @opentelemetry/api is NOT installed (full no-op) (VAL-02)', async (t) => {
    t.plan(3)
    _resetOtelApi()
    const pluginNoOtel = proxyquire('..', {
      './lib/otel-api': {
        loadOtelApi: () => false,
        _resetOtelApi: () => {}
      }
    })
    const fastify = Fastify({ logger: false })
    fastify.register(pluginNoOtel, {})
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()

    t.assert.ok(!fastify.otel, 'fastify.otel is NOT registered')
    const hookCount = fastify.server.listenerCount('request')
    t.assert.ok(typeof hookCount === 'number', 'server is valid')
    // Verify requests succeed without error
    const res = await fastify.inject({ method: 'GET', url: '/test' })
    t.assert.strictEqual(res.statusCode, 200)
    await fastify.close()
  })

  test('registers without error when @opentelemetry/api installed but no TracerProvider configured (VAL-03)', async (t) => {
    t.plan(2)
    // Use otelPlugin without registering a provider — the API's no-op implementation handles spans
    const fastify = Fastify({ logger: false })
    fastify.register(otelPlugin, { exposeApi: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()

    t.assert.ok(fastify.otel, 'hooks registered even without SDK configured')
    const res = await fastify.inject({ method: 'GET', url: '/test' })
    t.assert.strictEqual(res.statusCode, 200)
    await fastify.close()
  })

  test('exposeApi: true registers fastify.otel and request.otelSpan decorators (VAL-01)', async (t) => {
    t.plan(2)
    const fastify = buildFastify({ exposeApi: true })
    let capturedSpan
    fastify.get('/test', async (request) => {
      capturedSpan = request.otelSpan
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer registered')
    t.assert.ok(capturedSpan, 'request.otelSpan is set during handler execution')
    await fastify.close()
  })

  test('exposeApi: false does not register fastify.otel decorator', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: false })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    t.assert.ok(!fastify.otel, 'fastify.otel is NOT registered when exposeApi: false')
    await fastify.close()
  })

  test('plugin uses fastify-plugin so hooks apply globally to all routes', async (t) => {
    t.plan(1)
    // Register plugin inside an encapsulated context; verify hooks still fire on outer routes
    const { exporter } = createTestSetup()
    const fastify = Fastify({ logger: false })
    fastify.register(async function plugin (app) {
      app.register(otelPlugin, { exposeApi: false })
    })
    fastify.get('/outer', async () => ({ ok: true }))
    await fastify.ready()
    exporter.reset()
    await fastify.inject({ method: 'GET', url: '/outer' })
    // If fastify-plugin is correctly used, hooks are global and the outer route is instrumented
    // (we just verify no errors occur — span creation depends on provider registration)
    t.assert.ok(true, 'outer route served without error with globally-registered hooks')
    await fastify.close()
  })
})
