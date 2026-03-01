'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

describe('lifecycle hook spans', () => {
  test('hookSpans: true creates child spans for each hook phase that executes (VAL-07)', async (t) => {
    t.plan(2)
    // TODO(features): register route with onRequest and preHandler user hooks; hookSpans: true
    // assert spans "fastify.hook.onRequest" and "fastify.hook.preHandler" exported as children of server span
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('hook spans are children of the server span (VAL-07)', async (t) => {
    t.plan(1)
    // TODO(features): assert hook span parentSpanId === server span spanId
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('hookSpans: false produces only server span and handler span (VAL-08)', async (t) => {
    t.plan(1)
    // TODO(features): hookSpans: false; assert no "fastify.hook.*" spans exported
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('hook phases with no registered hooks do not produce spans', async (t) => {
    t.plan(1)
    // TODO(features): register route with no user hooks; assert no hook phase spans (only server + handler)
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('onError hook span created only when an error occurs', async (t) => {
    t.plan(2)
    // TODO(features): two requests — one success (no onError span), one error (onError span present)
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('onResponse does not get its own hook span', async (t) => {
    t.plan(1)
    // TODO(features): assert no span named "fastify.hook.onResponse" in exported spans
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('all hook phase span names follow fastify.hook.{hookName} convention', async (t) => {
    t.plan(1)
    // TODO(features): assert names: fastify.hook.onRequest, preParsing, preValidation, preHandler, preSerialization, onSend
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
