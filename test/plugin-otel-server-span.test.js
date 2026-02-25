'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_2_1 - One server span is created per request', async (t) => {
  t.plan(4)

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

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  await fastify.inject({
    method: 'POST',
    url: '/test'
  })

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 3, 'Should create at least 3 spans (server spans) for 3 requests')

  const endCalls = mockTracer.startSpan.mock.calls.map(call => call.result.end.mock.calls.length)
  t.assert.strictEqual(endCalls[0], 1, 'First span should be ended')
  t.assert.strictEqual(endCalls[1], 1, 'Second span should be ended')
  t.assert.strictEqual(endCalls[2], 1, 'Third span should be ended')
})

test('@covers_ACFR_2_2 - Span starts during onRequest and ends during onResponse', async (t) => {
  t.plan(4)

  let spanStartTime = null
  let spanEndTime = null
  let onRequestTime = null
  let onResponseTime = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      spanStartTime = Date.now()
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn(() => {
          spanEndTime = Date.now()
        })
      }
    })
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

  fastify.addHook('onRequest', async (request, reply) => {
    onRequestTime = Date.now()
  })

  fastify.addHook('onResponse', async (request, reply) => {
    onResponseTime = Date.now()
  })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(spanStartTime !== null, 'Span should be started')
  t.assert.ok(spanEndTime !== null, 'Span should be ended')
  t.assert.ok(spanStartTime <= onRequestTime, 'Span should start during or before onRequest')
  t.assert.ok(spanEndTime >= onResponseTime, 'Span should end during or after onResponse')
})

test('@covers_ACFR_2_3 - Span name uses the route pattern (parameterized), not the actual URL', async (t) => {
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

  fastify.get('/users/:id', async (request, reply) => {
    return { userId: request.params.id }
  })

  fastify.post('/items/:category/:itemId', async (request, reply) => {
    return { category: request.params.category, itemId: request.params.itemId }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/users/123'
  })

  await fastify.inject({
    method: 'POST',
    url: '/items/books/456'
  })

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 2, 'Should create at least 2 spans (server spans) for 2 requests')

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].includes(' /'))
  t.assert.strictEqual(serverSpans[0].arguments[0], 'GET /users/:id', 'Should use route pattern, not actual URL')
  t.assert.strictEqual(serverSpans[1].arguments[0], 'POST /items/:category/:itemId', 'Should use route pattern with multiple params')
})

test('@covers_ACFR_2_4 - Span kind is SERVER', async (t) => {
  t.plan(2)

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

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 1, 'Should create at least 1 span (server span)')
  const spanOptions = mockTracer.startSpan.mock.calls.find(call => call.arguments[0].startsWith('GET')).arguments[1]
  t.assert.strictEqual(spanOptions.kind, 1, 'Span kind should be SERVER')
})

test('@covers_ACFR_2_5 - Span is accessible from the request object for user code to add custom attributes', async (t) => {
  t.plan(4)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      setAttribute: t.mock.fn(),
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    t.assert.ok(request.otelSpan, 'request.otelSpan should be available')
    t.assert.strictEqual(typeof request.otelSpan.setAttribute, 'function', 'Should have setAttribute method')
    request.otelSpan.setAttribute('custom.attribute', 'custom-value')
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const span = mockTracer.startSpan.mock.calls.find(call => call.arguments[0].startsWith('GET')).result
  t.assert.strictEqual(span.setAttribute.mock.calls.length, 1)
  t.assert.deepStrictEqual(span.setAttribute.mock.calls[0].arguments, ['custom.attribute', 'custom-value'])
})

test('@covers_ACFR_2_6 - When the route is a 404, span name is {METHOD} with an attribute indicating unmatched route', async (t) => {
  t.plan(2)

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

  fastify.get('/existing-route', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/non-existent-route'
  })

  t.assert.strictEqual(response.statusCode, 404)
  const serverSpanCall = mockTracer.startSpan.mock.calls.find(call => call.arguments[0] === 'GET')
  t.assert.ok(serverSpanCall, 'Should find GET span for 404 route')
  t.assert.strictEqual(serverSpanCall.arguments[0], 'GET', 'Span name should be METHOD only for 404 routes')
})

test('@covers_ACFR_2_7 - Span duration accurately reflects the full request processing time', async (t) => {
  t.plan(4)

  let spanStartTime = null
  let spanEndTime = null
  let requestStartTime = null
  let requestEndTime = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      spanStartTime = Date.now()
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn(() => {
          spanEndTime = Date.now()
        })
      }
    })
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

  fastify.addHook('onRequest', async (request, reply) => {
    requestStartTime = Date.now()
  })

  fastify.get('/test', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { hello: 'world' }
  })

  fastify.addHook('onResponse', async (request, reply) => {
    requestEndTime = Date.now()
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(spanStartTime !== null, 'Span start time should be recorded')
  t.assert.ok(spanEndTime !== null, 'Span end time should be recorded')

  const spanDuration = spanEndTime - spanStartTime
  const requestDuration = requestEndTime - requestStartTime

  t.assert.ok(spanDuration >= 50, 'Span duration should include the 50ms delay in handler')
  t.assert.ok(Math.abs(spanDuration - requestDuration) < 10, 'Span duration should closely match full request processing time')
})

test('@covers_ACFR_2_1 @covers_ACFR_2_2 @covers_ACFR_2_7 - Multiple sequential requests maintain accurate timing', async (t) => {
  t.plan(7)

  const spanTimes = []

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      const startTime = Date.now()
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn(() => {
          const endTime = Date.now()
          spanTimes.push({ start: startTime, end: endTime, duration: endTime - startTime })
        })
      }
    })
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

  fastify.get('/fast', async (request, reply) => {
    return { speed: 'fast' }
  })

  fastify.get('/slow', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return { speed: 'slow' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/fast' })
  await fastify.inject({ method: 'GET', url: '/slow' })
  await fastify.inject({ method: 'GET', url: '/fast' })

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 3, 'Should create at least 3 spans (server spans) for 3 requests')
  t.assert.strictEqual(spanTimes.length, 3, 'Should end all three spans')

  t.assert.ok(spanTimes[0].duration < spanTimes[1].duration, 'Fast route should be faster than slow route')
  t.assert.ok(spanTimes[1].duration >= 30, 'Slow route should take at least 30ms')

  t.assert.ok(spanTimes[0].end <= spanTimes[1].start, 'First span should end before second starts')
  t.assert.ok(spanTimes[1].end <= spanTimes[2].start, 'Second span should end before third starts')
  t.assert.ok(spanTimes[2].duration < spanTimes[1].duration, 'Third span (fast) should be faster than second (slow)')
})

test('@covers_ACFR_2_3 @covers_ACFR_2_4 - Span naming and kind with various HTTP methods', async (t) => {
  t.plan(8)

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

  fastify.get('/users/:id', async (request, reply) => ({ method: 'GET' }))
  fastify.post('/users', async (request, reply) => ({ method: 'POST' }))
  fastify.put('/users/:id', async (request, reply) => ({ method: 'PUT' }))
  fastify.delete('/users/:id', async (request, reply) => ({ method: 'DELETE' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users/1' })
  await fastify.inject({ method: 'POST', url: '/users' })
  await fastify.inject({ method: 'PUT', url: '/users/2' })
  await fastify.inject({ method: 'DELETE', url: '/users/3' })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].includes(' /'))
  t.assert.strictEqual(serverSpans[0].arguments[0], 'GET /users/:id')
  t.assert.strictEqual(serverSpans[1].arguments[0], 'POST /users')
  t.assert.strictEqual(serverSpans[2].arguments[0], 'PUT /users/:id')
  t.assert.strictEqual(serverSpans[3].arguments[0], 'DELETE /users/:id')

  serverSpans.forEach((call) => {
    t.assert.strictEqual(call.arguments[1].kind, 1, 'All spans should have SERVER kind')
  })
})

test('@covers_ACFR_2_5 - Span accessible without exposeApi option (via symbol)', async (t) => {
  t.plan(2)

  let spanFromRequest = null

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

  await fastify.register(otelPlugin, { exposeApi: false })

  fastify.get('/test', async (request, reply) => {
    spanFromRequest = request.otelSpan
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(spanFromRequest, undefined, 'request.otelSpan should be undefined when exposeApi is false')
  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 1, 'Span should still be created internally')
})

test('@covers_ACFR_2_6 - 404 handling with different HTTP methods', async (t) => {
  t.plan(4)

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

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/not-found' })
  await fastify.inject({ method: 'POST', url: '/not-found' })
  await fastify.inject({ method: 'PUT', url: '/not-found' })
  await fastify.inject({ method: 'DELETE', url: '/not-found' })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => !call.arguments[0].includes('.'))
  t.assert.strictEqual(serverSpans[0].arguments[0], 'GET')
  t.assert.strictEqual(serverSpans[1].arguments[0], 'POST')
  t.assert.strictEqual(serverSpans[2].arguments[0], 'PUT')
  t.assert.strictEqual(serverSpans[3].arguments[0], 'DELETE')
})
