'use strict'

const { test, describe } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')

// TODO(features): import OTel SDK test helpers (InMemorySpanExporter, SimpleSpanProcessor, NodeTracerProvider)
// TODO(features): import proxyquire for simulating absent @opentelemetry/api

describe('basic: plugin registration', () => {
  test('registers without error when @opentelemetry/api is installed with SDK configured', async (t) => {
    t.plan(1)
    // TODO(features): set up in-memory TracerProvider, register plugin, assert no error and fastify.otel.tracer exists
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('registers without error when @opentelemetry/api is NOT installed (full no-op)', async (t) => {
    t.plan(2)
    // TODO(features): use proxyquire to simulate MODULE_NOT_FOUND for @opentelemetry/api
    // assert: no error thrown, fastify.otel is undefined, no hooks registered
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('registers without error when @opentelemetry/api installed but no TracerProvider configured', async (t) => {
    t.plan(1)
    // TODO(features): install @opentelemetry/api without calling provider.register()
    // assert: registers, hooks are registered, requests produce no exported spans
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('exposeApi: true registers fastify.otel and request.otelSpan decorators', async (t) => {
    t.plan(2)
    // TODO(features): register plugin with exposeApi: true, assert fastify.otel.tracer and request.otelSpan exist
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('exposeApi: false does not register fastify.otel decorator', async (t) => {
    t.plan(1)
    // TODO(features): register plugin with exposeApi: false, assert fastify.otel is undefined
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('plugin uses fastify-plugin so hooks apply globally to all routes', async (t) => {
    t.plan(1)
    // TODO(features): register plugin inside an encapsulated context, assert hooks still fire on outer routes
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
