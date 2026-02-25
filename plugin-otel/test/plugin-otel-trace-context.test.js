'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_7_1 - Request with valid traceparent header creates a server span that is a child of the incoming trace', async (t) => {
  t.plan(4)

  const mockExtractedContext = { extractedTraceId: 'test-trace-id-from-header' }
  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => mockExtractedContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(mockOtelApi.propagation.extract.mock.calls.length, 1, 'Context extraction should be called once')

  const extractCall = mockOtelApi.propagation.extract.mock.calls[0]
  t.assert.strictEqual(extractCall.arguments[1].traceparent, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', 'Headers should be passed to extract')

  const startSpanCall = mockTracer.startSpan.mock.calls[0]
  t.assert.strictEqual(startSpanCall.arguments[2], mockExtractedContext, 'Extracted context should be passed as parent context to startSpan')
})

test('@covers_ACFR_7_2 - The trace ID from the incoming traceparent is preserved in the server span', async (t) => {
  t.plan(4)

  const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736'
  const mockExtractedContext = { traceId: incomingTraceId }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        if (headers.traceparent) {
          return mockExtractedContext
        }
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: `00-${incomingTraceId}-00f067aa0ba902b7-01`
    }
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(mockOtelApi.propagation.extract.mock.calls.length, 1)

  const startSpanCall = mockTracer.startSpan.mock.calls[0]
  const parentContext = startSpanCall.arguments[2]
  t.assert.strictEqual(parentContext.traceId, incomingTraceId, 'Trace ID should be preserved from incoming traceparent')
  t.assert.strictEqual(parentContext, mockExtractedContext, 'Context with trace ID should be used as parent')
})

test('@covers_ACFR_7_3 - Request without trace context headers starts a new trace (new trace ID)', async (t) => {
  t.plan(3)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(mockOtelApi.propagation.extract.mock.calls.length, 1, 'Context extraction should still be attempted')

  const startSpanCall = mockTracer.startSpan.mock.calls[0]
  const parentContext = startSpanCall.arguments[2]
  t.assert.strictEqual(parentContext, mockOtelApi.ROOT_CONTEXT, 'When no trace headers present, ROOT_CONTEXT should be used (new trace)')
})

test('@covers_ACFR_7_4 - tracestate values are propagated to the server span\'s context', async (t) => {
  t.plan(4)

  const mockExtractedContext = {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    tracestate: 'vendor1=value1,vendor2=value2'
  }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        if (headers.tracestate) {
          return mockExtractedContext
        }
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor1=value1,vendor2=value2'
    }
  })

  t.assert.strictEqual(response.statusCode, 200)

  const extractCall = mockOtelApi.propagation.extract.mock.calls[0]
  t.assert.strictEqual(extractCall.arguments[1].tracestate, 'vendor1=value1,vendor2=value2', 'tracestate header should be passed to extract')

  const startSpanCall = mockTracer.startSpan.mock.calls[0]
  const parentContext = startSpanCall.arguments[2]
  t.assert.strictEqual(parentContext.tracestate, 'vendor1=value1,vendor2=value2', 'tracestate should be included in context')
  t.assert.strictEqual(parentContext, mockExtractedContext, 'Extracted context with tracestate should be used')
})

test('@covers_ACFR_7_5 - Child spans created inside the handler are parented to the server span', async (t) => {
  t.plan(5)

  const mockServerSpan = {
    setAttributes: t.mock.fn(),
    setStatus: t.mock.fn(),
    end: t.mock.fn()
  }

  const mockChildSpan = {
    setAttributes: t.mock.fn(),
    end: t.mock.fn()
  }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      if (name === 'GET /test') {
        return mockServerSpan
      }
      return mockChildSpan
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn(),
      getSpan: t.mock.fn((context) => mockServerSpan)
    },
    context: {
      active: t.mock.fn(() => ({ serverSpanContext: true }))
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => rootContext)
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    t.assert.ok(request.otelSpan, 'Server span should be accessible from request')
    t.assert.strictEqual(request.otelSpan, mockServerSpan, 'request.otelSpan should be the server span')

    const childSpan = fastify.otel.tracer.startSpan('child-operation', {
      parent: request.otelSpan
    })
    childSpan.end()

    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 3, 'Should create server span, handler span, and child span')
  t.assert.strictEqual(mockChildSpan.end.mock.calls.length, 1, 'Child span should be ended')
})

test('@covers_ACFR_7_6 - Context propagation works correctly with both async and callback-style handlers', async (t) => {
  t.plan(11)

  const mockExtractedContext = { traceId: 'test-trace-id' }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        if (headers.traceparent) {
          return mockExtractedContext
        }
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/async', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return { type: 'async' }
  })

  fastify.get('/callback', (request, reply) => {
    reply.send({ type: 'callback' })
  })

  fastify.get('/promise', (request, reply) => {
    return Promise.resolve({ type: 'promise' })
  })

  await fastify.ready()

  const asyncResponse = await fastify.inject({
    method: 'GET',
    url: '/async',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })
  t.assert.strictEqual(asyncResponse.statusCode, 200)
  t.assert.strictEqual(asyncResponse.json().type, 'async')

  const callbackResponse = await fastify.inject({
    method: 'GET',
    url: '/callback',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })
  t.assert.strictEqual(callbackResponse.statusCode, 200)
  t.assert.strictEqual(callbackResponse.json().type, 'callback')

  const promiseResponse = await fastify.inject({
    method: 'GET',
    url: '/promise',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })
  t.assert.strictEqual(promiseResponse.statusCode, 200)
  t.assert.strictEqual(promiseResponse.json().type, 'promise')

  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 6, 'Should create server and handler spans for all handler types')
  t.assert.strictEqual(mockOtelApi.propagation.extract.mock.calls.length, 3, 'Should extract context for all requests')

  mockTracer.startSpan.mock.calls.forEach((call, index) => {
    const parentContext = call.arguments[2]
    t.assert.strictEqual(parentContext, mockExtractedContext, `Handler ${index} should use extracted context`)
  })
})

test('@covers_ACFR_7_1 @covers_ACFR_7_2 @covers_ACFR_7_3 - Multiple requests with and without trace context', async (t) => {
  t.plan(7)

  const mockExtractedContext = { traceId: 'external-trace-id' }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        if (headers.traceparent) {
          return mockExtractedContext
        }
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response1 = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })
  t.assert.strictEqual(response1.statusCode, 200)

  const response2 = await fastify.inject({
    method: 'GET',
    url: '/test'
  })
  t.assert.strictEqual(response2.statusCode, 200)

  const response3 = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-aaaabbbbccccddddeeeeffffgggghhh1-1111222233334444-01'
    }
  })
  t.assert.strictEqual(response3.statusCode, 200)

  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 3, 'Should create 3 spans')

  const span1Context = mockTracer.startSpan.mock.calls[0].arguments[2]
  t.assert.strictEqual(span1Context, mockExtractedContext, 'First request should use extracted context')

  const span2Context = mockTracer.startSpan.mock.calls[1].arguments[2]
  t.assert.strictEqual(span2Context, mockOtelApi.ROOT_CONTEXT, 'Second request without headers should use ROOT_CONTEXT')

  const span3Context = mockTracer.startSpan.mock.calls[2].arguments[2]
  t.assert.strictEqual(span3Context, mockExtractedContext, 'Third request should use extracted context')
})

test('@covers_ACFR_7_4 - Context extraction uses proper getter implementation', async (t) => {
  t.plan(5)

  let capturedGetter = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        capturedGetter = getter
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=value'
    }
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(capturedGetter, 'Getter should be captured')

  const testHeaders = {
    traceparent: '00-test-test-01',
    tracestate: 'test=value',
    'x-other-header': 'ignored'
  }

  const value = capturedGetter.get(testHeaders, 'traceparent')
  t.assert.strictEqual(value, '00-test-test-01', 'Getter should return header value')

  const keys = capturedGetter.keys(testHeaders)
  t.assert.ok(Array.isArray(keys), 'keys should return an array')
  t.assert.ok(keys.includes('traceparent') && keys.includes('tracestate'), 'keys should include all header names')
})

test('@covers_ACFR_7_1 @covers_ACFR_7_3 - Invalid traceparent is handled gracefully', async (t) => {
  t.plan(3)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer)
    },
    SpanKind: { SERVER: 1 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext, headers, getter) => {
        if (headers.traceparent && headers.traceparent.startsWith('00-')) {
          return rootContext
        }
        return rootContext
      })
    },
    ROOT_CONTEXT: {}
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApi
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: 'invalid-traceparent-format'
    }
  })

  t.assert.strictEqual(response.statusCode, 200, 'Request should succeed even with invalid traceparent')
  t.assert.strictEqual(mockOtelApi.propagation.extract.mock.calls.length, 1, 'Extract should still be called')
  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 1, 'Span should still be created')
})
