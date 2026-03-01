'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

describe('ignoreRoutes exclusion (OTEL-1)', () => {
  test('ignored routes produce no spans (VAL-16)', async (t) => {
    t.plan(1)
    // TODO(features): ignoreRoutes: ['/health'], inject GET /health, assert no spans exported
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('non-ignored routes still produce spans when ignoreRoutes is set (VAL-16)', async (t) => {
    t.plan(1)
    // TODO(features): ignoreRoutes: ['/health'], inject GET /api/data, assert server span exported
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('request.otelSpan is undefined for ignored routes', async (t) => {
    t.plan(1)
    // TODO(features): inside handler of ignored route, assert request.otelSpan === undefined
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('ignoreRoutes defaults to empty list (all routes instrumented)', async (t) => {
    t.plan(1)
    // TODO(features): no ignoreRoutes option; assert all routes produce spans
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
