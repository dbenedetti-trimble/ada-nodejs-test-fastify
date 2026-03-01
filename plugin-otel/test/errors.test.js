'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

describe('error recording on spans (OTEL-6)', () => {
  test('handler exception recorded on handler span with ERROR status (VAL-10)', async (t) => {
    t.plan(3)
    // TODO(features): handler throws Error('db failed')
    // assert: handler span status ERROR, message "db failed", recordException called
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('server span ERROR status set for 5xx response (VAL-10)', async (t) => {
    t.plan(2)
    // TODO(features): handler throws, assert server span status ERROR, http.response.status_code 500
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('5xx response without exception sets ERROR status on server span (VAL-11)', async (t) => {
    t.plan(2)
    // TODO(features): reply.code(503).send(); assert server span ERROR, handler span UNSET
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('4xx response does not set ERROR status (VAL-12)', async (t) => {
    t.plan(2)
    // TODO(features): reply.code(404).send(); assert server span status UNSET, status_code 404
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('async rejected promise captured on handler span', async (t) => {
    t.plan(1)
    // TODO(features): async handler rejects; assert handler span records exception
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('error in hook (not handler) recorded on server span', async (t) => {
    t.plan(1)
    // TODO(features): onRequest hook throws; assert server span records exception
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('onError hook span records error when hookSpans is true', async (t) => {
    t.plan(1)
    // TODO(features): hookSpans: true, handler throws; assert fastify.hook.onError span exported with error
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
