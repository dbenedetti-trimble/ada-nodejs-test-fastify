'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_6_1 - Handler exceptions are recorded on the handler span via recordException', async (t) => {
  t.plan(4)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  const testError = new Error('Test handler error')
  fastify.get('/test', async (request, reply) => {
    throw testError
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.recordException.mock.calls.length, 1, 'Should call recordException once')
  t.assert.strictEqual(handlerSpan.recordException.mock.calls[0].arguments[0], testError, 'Should record the exact error object')
  t.assert.strictEqual(handlerSpan.end.mock.calls.length, 1, 'Should end the span')
})

test('@covers_ACFR_6_2 - Handler span status is set to ERROR when the handler throws', async (t) => {
  t.plan(3)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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
    throw new Error('Handler error')
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 1, 'Should call setStatus once')
  t.assert.deepStrictEqual(handlerSpan.setStatus.mock.calls[0].arguments[0], { code: 2 }, 'Should set status to ERROR')
})

test('@covers_ACFR_6_3 - Server span status is set to ERROR for 5xx responses', async (t) => {
  t.plan(3)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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
    throw new Error('Server error')
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 1, 'Should create one server span')

  const serverSpan = serverSpans[0].result
  t.assert.strictEqual(serverSpan.setStatus.mock.calls.length, 1, 'Should call setStatus once on server span')
  t.assert.deepStrictEqual(
    serverSpan.setStatus.mock.calls[0].arguments[0],
    { code: 2, message: 'HTTP 500' },
    'Should set status to ERROR with HTTP 500 message'
  )
})

test('@covers_ACFR_6_4 - Server span status is UNSET for 4xx responses', async (t) => {
  t.plan(2)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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
    url: '/not-found-404'
  })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'GET')
  t.assert.strictEqual(serverSpans.length, 1, 'Should create one server span')

  const serverSpan = serverSpans[0].result
  t.assert.strictEqual(serverSpan.setStatus.mock.calls.length, 0, 'Should NOT call setStatus for 404 (4xx) responses')
})

test('@covers_ACFR_6_5 - The error message is included in the span status description', async (t) => {
  t.plan(4)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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
    throw new Error('Custom error message')
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 1, 'Should create one server span')

  const serverSpan = serverSpans[0].result
  t.assert.strictEqual(serverSpan.setStatus.mock.calls.length, 1, 'Should call setStatus on server span')

  const statusCall = serverSpan.setStatus.mock.calls[0].arguments[0]
  t.assert.strictEqual(statusCall.code, 2, 'Status code should be ERROR')
  t.assert.ok(statusCall.message, 'Status should include a message')
})

test('@covers_ACFR_6_7 - Both sync thrown errors and async rejected promises are captured', async (t) => {
  t.plan(8)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  fastify.get('/sync-error', (request, reply) => {
    throw new Error('Sync error')
  })

  fastify.get('/async-error', async (request, reply) => {
    throw new Error('Async error')
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/sync-error' })
  await fastify.inject({ method: 'GET', url: '/async-error' })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 2, 'Should create two handler spans')

  const syncHandlerSpan = handlerSpans[0].result
  t.assert.strictEqual(syncHandlerSpan.recordException.mock.calls.length, 1, 'Sync handler should record exception')
  t.assert.strictEqual(syncHandlerSpan.setStatus.mock.calls.length, 1, 'Sync handler should set error status')
  t.assert.strictEqual(syncHandlerSpan.end.mock.calls.length, 1, 'Sync handler span should end')

  const asyncHandlerSpan = handlerSpans[1].result
  t.assert.strictEqual(asyncHandlerSpan.recordException.mock.calls.length, 1, 'Async handler should record exception')
  t.assert.strictEqual(asyncHandlerSpan.setStatus.mock.calls.length, 1, 'Async handler should set error status')
  t.assert.strictEqual(asyncHandlerSpan.end.mock.calls.length, 1, 'Async handler span should end')

  t.assert.strictEqual(
    syncHandlerSpan.recordException.mock.calls[0].arguments[0].message,
    'Sync error',
    'Should record sync error message'
  )
})

test('@covers_ACFR_6_3 - Server span ERROR status for various 5xx status codes', async (t) => {
  t.plan(10)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  fastify.get('/500', async (request, reply) => {
    reply.code(500).send({ error: 'Internal Server Error' })
  })

  fastify.get('/502', async (request, reply) => {
    reply.code(502).send({ error: 'Bad Gateway' })
  })

  fastify.get('/503', async (request, reply) => {
    reply.code(503).send({ error: 'Service Unavailable' })
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/500' })
  await fastify.inject({ method: 'GET', url: '/502' })
  await fastify.inject({ method: 'GET', url: '/503' })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 3, 'Should create three server spans')

  const span500 = serverSpans[0].result
  t.assert.strictEqual(span500.setStatus.mock.calls.length, 1, 'Should set status for 500')
  t.assert.deepStrictEqual(span500.setStatus.mock.calls[0].arguments[0], { code: 2, message: 'HTTP 500' })

  const span502 = serverSpans[1].result
  t.assert.strictEqual(span502.setStatus.mock.calls.length, 1, 'Should set status for 502')
  t.assert.deepStrictEqual(span502.setStatus.mock.calls[0].arguments[0], { code: 2, message: 'HTTP 502' })

  const span503 = serverSpans[2].result
  t.assert.strictEqual(span503.setStatus.mock.calls.length, 1, 'Should set status for 503')
  t.assert.deepStrictEqual(span503.setStatus.mock.calls[0].arguments[0], { code: 2, message: 'HTTP 503' })

  t.assert.strictEqual(span500.end.mock.calls.length, 1, '500 span should end')
  t.assert.strictEqual(span502.end.mock.calls.length, 1, '502 span should end')
  t.assert.strictEqual(span503.end.mock.calls.length, 1, '503 span should end')
})

test('@covers_ACFR_6_4 - Server span UNSET status for various 4xx status codes', async (t) => {
  t.plan(7)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  fastify.get('/400', async (request, reply) => {
    reply.code(400).send({ error: 'Bad Request' })
  })

  fastify.get('/401', async (request, reply) => {
    reply.code(401).send({ error: 'Unauthorized' })
  })

  fastify.get('/403', async (request, reply) => {
    reply.code(403).send({ error: 'Forbidden' })
  })

  fastify.get('/404', async (request, reply) => {
    reply.code(404).send({ error: 'Not Found' })
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/400' })
  await fastify.inject({ method: 'GET', url: '/401' })
  await fastify.inject({ method: 'GET', url: '/403' })
  await fastify.inject({ method: 'GET', url: '/404' })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 4, 'Should create four server spans')

  const span400 = serverSpans[0].result
  const span401 = serverSpans[1].result
  const span403 = serverSpans[2].result
  const span404 = serverSpans[3].result

  t.assert.strictEqual(span400.setStatus.mock.calls.length, 0, 'Should NOT set status for 400')
  t.assert.strictEqual(span401.setStatus.mock.calls.length, 0, 'Should NOT set status for 401')
  t.assert.strictEqual(span403.setStatus.mock.calls.length, 0, 'Should NOT set status for 403')
  t.assert.strictEqual(span404.setStatus.mock.calls.length, 0, 'Should NOT set status for 404')

  t.assert.strictEqual(span400.end.mock.calls.length, 1, '400 span should end')
  t.assert.strictEqual(span404.end.mock.calls.length, 1, '404 span should end')
})

test('@covers_ACFR_6_1 @covers_ACFR_6_2 - Handler span records both exception and error status', async (t) => {
  t.plan(6)

  let recordedError = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn((error) => {
        if (name === 'fastify.handler') {
          recordedError = error
        }
      }),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  const customError = new Error('Custom handler error')
  fastify.get('/test', async (request, reply) => {
    throw customError
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result

  t.assert.strictEqual(handlerSpan.recordException.mock.calls.length, 1, 'Should call recordException')
  t.assert.strictEqual(recordedError, customError, 'Should record the exact error object')
  t.assert.strictEqual(recordedError.message, 'Custom handler error', 'Error message should match')

  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 1, 'Should call setStatus')
  t.assert.deepStrictEqual(handlerSpan.setStatus.mock.calls[0].arguments[0], { code: 2 }, 'Should set ERROR status')
})

test('@covers_ACFR_6_3 @covers_ACFR_6_5 - Server span includes status code in error message', async (t) => {
  t.plan(3)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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
    reply.code(503).send({ error: 'Service temporarily unavailable' })
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 503)

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  const serverSpan = serverSpans[0].result

  const statusCall = serverSpan.setStatus.mock.calls[0].arguments[0]
  t.assert.strictEqual(statusCall.code, 2, 'Status code should be ERROR')
  t.assert.strictEqual(statusCall.message, 'HTTP 503', 'Message should include HTTP status code')
})

test('@covers_ACFR_6_6 - Errors that occur in hooks (not the handler) are recorded on the server span', async (t) => {
  t.plan(4)

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      recordException: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn((context, span) => context)
    },
    context: {
      active: t.mock.fn(() => ({}))
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
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

  const hookError = new Error('Hook error')
  fastify.addHook('preHandler', async (request, reply) => {
    throw hookError
  })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 1, 'Should create one server span')

  const serverSpan = serverSpans[0].result
  t.assert.strictEqual(serverSpan.setStatus.mock.calls.length, 1, 'Should set error status on server span')
  t.assert.strictEqual(serverSpan.setStatus.mock.calls[0].arguments[0].code, 2, 'Should set ERROR status code')
  t.assert.ok(serverSpan.setStatus.mock.calls[0].arguments[0].message, 'Should include error message')
})
