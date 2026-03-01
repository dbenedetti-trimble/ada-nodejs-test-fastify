'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

describe('handler span', () => {
  test('fastify.handler child span created for every request (VAL-06)', async (t) => {
    t.plan(2)
    // TODO(features): inject request, assert exported spans include one with name "fastify.handler"
    // and its parentSpanId equals the server span spanId
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('handler span duration covers only handler execution', async (t) => {
    t.plan(1)
    // TODO(features): compare handler span timing against server span timing
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('handler span created for async handlers that return promises (VAL-20)', async (t) => {
    t.plan(2)
    // TODO(features): async handler with 50ms delay; assert handler span duration >= 50ms and status UNSET
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('handler span created for sync handlers that call reply.send()', async (t) => {
    t.plan(1)
    // TODO(features): sync handler calling reply.send(); assert handler span exported
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('handler span records exception and sets ERROR status when handler throws (VAL-10)', async (t) => {
    t.plan(2)
    // TODO(features): handler throws Error('boom'); assert handler span status ERROR, exception recorded
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('handler span not created for routes in ignoreRoutes', async (t) => {
    t.plan(1)
    // TODO(features): register ignoreRoutes: ['/health'], assert no handler span for GET /health
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
