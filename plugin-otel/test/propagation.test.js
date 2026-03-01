'use strict'

const { test, describe } = require('node:test')

// TODO(features): import OTel SDK test helpers and shared instrumented-Fastify factory

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const PARENT_SPAN_ID = '00f067aa0ba902b7'
const TRACEPARENT = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`

describe('W3C Trace Context propagation (OTEL-7)', () => {
  test('incoming traceparent creates server span as child of remote trace (VAL-13)', async (t) => {
    t.plan(2)
    // TODO(features): inject with traceparent header, assert server span traceId === TRACE_ID
    // and server span parentSpanId === PARENT_SPAN_ID
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('request without traceparent starts a new trace (VAL-14)', async (t) => {
    t.plan(2)
    // TODO(features): inject without traceparent, assert server span has new traceId (not all zeros)
    // and parentSpanId is undefined/null
    t.assert.ok(true, 'placeholder — implement in features pass')
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('tracestate values propagated to server span context', async (t) => {
    t.plan(1)
    // TODO(features): inject with tracestate header, assert it is carried into span context
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('child spans created inside handler are parented to server span (VAL-15)', async (t) => {
    t.plan(1)
    // TODO(features): handler creates span via fastify.otel.tracer.startSpan('custom')
    // assert "custom" span parentSpanId === server span spanId
    t.assert.ok(true, 'placeholder — implement in features pass')
  })

  test('context propagation works with async handlers', async (t) => {
    t.plan(1)
    // TODO(features): async handler creates child span; assert correct parenting
    t.assert.ok(true, 'placeholder — implement in features pass')
  })
})
