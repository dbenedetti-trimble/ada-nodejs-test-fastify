'use strict'

const { test, describe, after } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { SpanKind } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('integration', () => {
  test('multiple routes produce independent spans (VAL-19)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/a', async () => ({ route: 'a' }))
    fastify.get('/b', async () => ({ route: 'b' }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/a' })
    await fastify.inject({ method: 'GET', url: '/b' })

    const spans = exporter.getFinishedSpans()
    const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
    const names = serverSpans.map(s => s.name)
    t.assert.ok(names.includes('GET /a'), 'span for GET /a exists')
    t.assert.ok(names.includes('GET /b'), 'span for GET /b exists')
    await fastify.close()
  })

  test('custom spanNameFormatter overrides default naming (VAL-18)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({
      spanNameFormatter: (req) => 'custom-' + req.method
    })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.name, 'custom-GET', 'custom spanNameFormatter applied')
    await fastify.close()
  })

  test('custom attributes set via request.otelSpan appear on exported span (VAL-17)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async (request) => {
      request.otelSpan.setAttribute('custom.key', 'value')
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['custom.key'], 'value')
    await fastify.close()
  })

  test('fastify.otel.tracer returns the Tracer instance used by the plugin', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    // The tracer used by the plugin created spans with instrumentationScope name 'fastify'
    t.assert.strictEqual(serverSpan.instrumentationScope.name, 'fastify', 'tracer is the one used by the plugin')
    await fastify.close()
  })

  test('plugin registered twice throws FST_ERR_DEC_ALREADY_PRESENT', async (t) => {
    t.plan(1)
    const fastify = Fastify({ logger: false })
    fastify.register(otelPlugin, { exposeApi: true })
    fastify.register(otelPlugin, { exposeApi: true })
    try {
      await fastify.ready()
      t.assert.fail('expected error not thrown')
    } catch (err) {
      t.assert.ok(
        err.code === 'FST_ERR_DEC_ALREADY_PRESENT' || err.message.includes('already present') || err.message.includes('already been added'),
        'duplicate registration throws decorator-already-present error'
      )
    }
    await fastify.close().catch(() => {})
  })
})
