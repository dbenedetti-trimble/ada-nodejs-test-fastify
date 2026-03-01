'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

describe('integration', () => {
  test('multiple routes produce independent spans (VAL-19)', async (t) => {
    t.plan(2)
    // TODO(features): register GET /a and GET /b, inject both
    // assert two server spans with names "GET /a" and "GET /b"
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('custom spanNameFormatter overrides default naming (VAL-18)', async (t) => {
    t.plan(1)
    // TODO(features): opts.spanNameFormatter = (req) => 'custom-' + req.method
    // inject GET /test, assert span name is "custom-GET"
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('custom attributes set via request.otelSpan appear on exported span (VAL-17)', async (t) => {
    t.plan(1)
    // TODO(features): handler calls request.otelSpan.setAttribute('custom.key', 'value')
    // assert "custom.key" === "value" on exported server span
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('fastify.otel.tracer returns the Tracer instance used by the plugin', async (t) => {
    t.plan(1)
    // TODO(features): assert fastify.otel.tracer is the same tracer used to create server spans
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('plugin registered multiple times throws FST_ERR_DEC_ALREADY_PRESENT', async (t) => {
    t.plan(1)
    // TODO(features): register plugin twice with exposeApi: true, assert DEC_ALREADY_PRESENT error
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
