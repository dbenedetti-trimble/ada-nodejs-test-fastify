'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_3_1 - A fastify.handler span is created as a child of the server span', async (t) => {
  t.plan(6)

  let serverSpan = null
  let handlerSpan = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      const span = {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        recordException: t.mock.fn(),
        end: t.mock.fn()
      }
      if (name.startsWith('GET')) {
        serverSpan = span
      } else if (name === 'fastify.handler') {
        handlerSpan = span
      }
      return span
    })
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
    url: '/test'
  })

  t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, 2, 'Should create 2 spans: server and handler')
  t.assert.strictEqual(mockTracer.startSpan.mock.calls[0].arguments[0], 'GET /test', 'First span should be server span')
  t.assert.strictEqual(mockTracer.startSpan.mock.calls[1].arguments[0], 'fastify.handler', 'Second span should be handler span')

  t.assert.ok(serverSpan, 'Server span should be created')
  t.assert.ok(handlerSpan, 'Handler span should be created')

  const handlerSpanContext = mockTracer.startSpan.mock.calls[1].arguments[2]
  t.assert.ok(handlerSpanContext, 'Handler span should have a parent context')
})

test('@covers_ACFR_3_2 - Span duration covers only handler execution (not hooks)', async (t) => {
  t.plan(3)

  let handlerSpanStart = null
  let handlerSpanEnd = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      if (name === 'fastify.handler') {
        handlerSpanStart = Date.now()
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        recordException: t.mock.fn(),
        end: t.mock.fn(() => {
          if (name === 'fastify.handler') {
            handlerSpanEnd = Date.now()
          }
        })
      }
    })
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

  fastify.addHook('preHandler', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 20))
  })

  fastify.get('/test', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 30))
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(handlerSpanStart !== null, 'Handler span should start')
  t.assert.ok(handlerSpanEnd !== null, 'Handler span should end')

  const handlerDuration = handlerSpanEnd - handlerSpanStart
  t.assert.ok(handlerDuration >= 30, 'Handler span duration should include at least the handler execution time (30ms)')
})

test('@covers_ACFR_3_3 - Span is created for async handlers that return promises', async (t) => {
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

  fastify.get('/async', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return { type: 'async' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/async'
  })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.end.mock.calls.length, 1, 'Handler span should be ended')
  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 0, 'Handler span should not have error status for successful handler')
})

test('@covers_ACFR_3_4 - Span is created for sync handlers that call reply.send()', async (t) => {
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

  fastify.get('/sync', (request, reply) => {
    reply.send({ type: 'sync' })
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/sync'
  })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.end.mock.calls.length, 1, 'Handler span should be ended')
  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 0, 'Handler span should not have error status for successful handler')
})

test('@covers_ACFR_3_5 - If the handler throws, the span records the exception and sets error status before ending', async (t) => {
  t.plan(5)

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

  fastify.get('/error', async (request, reply) => {
    throw new Error('Handler error')
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/error'
  })

  t.assert.strictEqual(response.statusCode, 500, 'Should return 500 status')

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.recordException.mock.calls.length, 1, 'Should record exception')
  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 1, 'Should set error status')
  t.assert.strictEqual(handlerSpan.end.mock.calls.length, 1, 'Handler span should be ended')
})

test('@covers_ACFR_3_6 - Handler span is not created for routes in ignoreRoutes', async (t) => {
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

  await fastify.register(otelPlugin, { ignoreRoutes: ['/ignored'] })

  fastify.get('/ignored', async (request, reply) => {
    return { ignored: true }
  })

  fastify.get('/tracked', async (request, reply) => {
    return { tracked: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/ignored' })
  await fastify.inject({ method: 'GET', url: '/tracked' })

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create handler span only for tracked route')

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 1, 'Should create server span only for tracked route')
})

test('@covers_ACFR_3_5 - Sync handler throw exception is captured', async (t) => {
  t.plan(5)

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
    throw new Error('Sync handler error')
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/sync-error'
  })

  t.assert.strictEqual(response.statusCode, 500, 'Should return 500 status')

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should create one handler span')

  const handlerSpan = handlerSpans[0].result
  t.assert.strictEqual(handlerSpan.recordException.mock.calls.length, 1, 'Should record exception')
  t.assert.strictEqual(handlerSpan.setStatus.mock.calls.length, 1, 'Should set error status')
  t.assert.strictEqual(handlerSpan.end.mock.calls.length, 1, 'Handler span should be ended')
})

test('@covers_ACFR_3_1 @covers_ACFR_3_2 - Handler span is a child and covers only handler execution', async (t) => {
  t.plan(4)

  const spans = []

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      const span = {
        name,
        startTime: Date.now(),
        context,
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        recordException: t.mock.fn(),
        end: t.mock.fn(function () {
          this.endTime = Date.now()
        })
      }
      spans.push(span)
      return span
    })
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

  fastify.addHook('preHandler', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 15))
  })

  fastify.get('/test', async (request, reply) => {
    await new Promise(resolve => setTimeout(resolve, 25))
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(spans.length, 2, 'Should create 2 spans')

  const serverSpan = spans.find(s => s.name.startsWith('GET'))
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan && handlerSpan, 'Both server and handler spans should exist')
  t.assert.ok(handlerSpan.context, 'Handler span should have parent context')

  const handlerDuration = handlerSpan.endTime - handlerSpan.startTime
  t.assert.ok(handlerDuration >= 25, 'Handler span should include at least the handler execution time (25ms)')
})
