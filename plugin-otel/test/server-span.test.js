'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers (InMemorySpanExporter, SimpleSpanProcessor, NodeTracerProvider)
// TODO(features): import Fastify, otelPlugin, and a shared helper to create an instrumented Fastify instance

describe('server span lifecycle', () => {
  test('one SERVER span created per request (VAL-04)', async (t) => {
    t.plan(1)
    // TODO(features): inject GET /test, assert exactly one span with kind SERVER exported
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('server span name is METHOD + route pattern (VAL-04)', async (t) => {
    t.plan(1)
    // TODO(features): assert span name is "GET /test"
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('server span uses route pattern not resolved URL (VAL-05)', async (t) => {
    t.plan(2)
    // TODO(features): register GET /users/:id, inject /users/42
    // assert span name "GET /users/:id", url.path "/users/42"
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('server span duration covers full request lifecycle', async (t) => {
    t.plan(1)
    // TODO(features): assert span start time <= handler start and span end time >= handler end
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('404 route span name is METHOD only with unmatched route attribute', async (t) => {
    t.plan(1)
    // TODO(features): inject GET /not-found, assert span name "GET" (no route pattern)
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('server span is accessible from the request object (VAL-17)', async (t) => {
    t.plan(1)
    // TODO(features): inside handler, read request.otelSpan and assert it equals the exported server span
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
