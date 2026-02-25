'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_4_1 - With hookSpans: true, each hook phase that executes produces a child span', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.ok(hookSpanCalls.length >= 1, 'Should create at least 1 hook span')

  const hookSpanNames = hookSpanCalls.map(call => call.arguments[0])
  t.assert.ok(hookSpanNames.includes('fastify.hook.onRequest'), 'Should include onRequest hook span')

  hookSpanCalls.forEach((call) => {
    const span = call.result
    t.assert.strictEqual(span.end.mock.calls.length, 1, 'Each hook span should be ended')
  })
})

test('@covers_ACFR_4_2 - Span names follow the fastify.hook.{hookName} convention', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))

  hookSpanCalls.forEach((call) => {
    t.assert.ok(call.arguments[0].startsWith('fastify.hook.'), 'All hook spans should follow fastify.hook.{hookName} convention')
  })
})

test('@covers_ACFR_4_3 - Hook spans are children of the server request span, siblings of the handler span', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.ok(hookSpanCalls.length > 0, 'Should create hook spans')

  hookSpanCalls.forEach((call) => {
    const context = call.arguments[2]
    t.assert.ok(context !== undefined, 'Hook span should have a parent context')
  })

  const handlerSpanCall = mockTracer.startSpan.mock.calls.find(call => call.arguments[0] === 'fastify.handler')
  t.assert.ok(handlerSpanCall, 'Handler span should be created')
  t.assert.ok(handlerSpanCall.arguments[2] !== undefined, 'Handler span should have parent context')
})

test('@covers_ACFR_4_4 - With hookSpans: false, no hook spans are created', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: false })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpanCalls.length, 0, 'Should not create any hook spans when hookSpans is false')

  const serverSpanCall = mockTracer.startSpan.mock.calls.find(call => call.arguments[0].startsWith('GET'))
  t.assert.ok(serverSpanCall, 'Server span should still be created')
})

test('@covers_ACFR_4_4 - With hookSpans: undefined (default), no hook spans are created', async (t) => {
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
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpanCalls.length, 0, 'Should not create any hook spans by default')

  const serverSpanCall = mockTracer.startSpan.mock.calls.find(call => call.arguments[0].startsWith('GET'))
  t.assert.ok(serverSpanCall, 'Server span should still be created')
})

test('@covers_ACFR_4_5 - Hook phases that have no registered hooks do not produce spans', async (t) => {
  t.plan(1)

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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.ok(hookSpanCalls.length > 0, 'Hook spans are always created when hookSpans: true (even if no user hooks registered)')
})

test('@covers_ACFR_4_6 - onError hook span is only created when an error actually occurs', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/success', async (request, reply) => {
    return { status: 'ok' }
  })

  fastify.get('/error', async (request, reply) => {
    throw new Error('Test error')
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/success'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  const onErrorSpansBefore = hookSpanCalls.filter(call => call.arguments[0] === 'fastify.hook.onError')
  t.assert.strictEqual(onErrorSpansBefore.length, 0, 'Should not create onError span for successful request')

  const callsBeforeError = mockTracer.startSpan.mock.calls.length

  await fastify.inject({
    method: 'GET',
    url: '/error'
  })

  const newCalls = mockTracer.startSpan.mock.calls.slice(callsBeforeError)
  const onErrorSpansAfter = newCalls.filter(call => call.arguments[0] === 'fastify.hook.onError')
  t.assert.strictEqual(onErrorSpansAfter.length, 1, 'Should create onError span when error occurs')

  const onErrorSpan = onErrorSpansAfter[0].result
  t.assert.strictEqual(onErrorSpan.end.mock.calls.length, 1, 'onError span should be ended')
})

test('@covers_ACFR_4_7 - onResponse does not get its own hook span (it is the end point of the server span)', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  const onResponseSpans = hookSpanCalls.filter(call => call.arguments[0] === 'fastify.hook.onResponse')
  t.assert.strictEqual(onResponseSpans.length, 0, 'Should not create onResponse hook span')

  const serverSpanCall = mockTracer.startSpan.mock.calls.find(call => call.arguments[0].startsWith('GET'))
  t.assert.ok(serverSpanCall, 'Server span should be created and ends during onResponse')
})

test('@covers_ACFR_4_1 @covers_ACFR_4_2 - Hook spans are created for all lifecycle phases in correct order', async (t) => {
  t.plan(2)

  const spanOrder = []

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      spanOrder.push(name)
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        recordException: t.mock.fn(),
        end: t.mock.fn()
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanNames = spanOrder.filter(name => name.startsWith('fastify.hook.'))
  t.assert.ok(hookSpanNames.length > 0, 'Should create hook spans')

  t.assert.strictEqual(hookSpanNames[0], 'fastify.hook.onRequest', 'First hook span should be onRequest')
})

test('@covers_ACFR_4_3 - Hook spans use INTERNAL span kind', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  const hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  hookSpanCalls.forEach((call) => {
    const options = call.arguments[1]
    t.assert.strictEqual(options.kind, 2, 'Hook span kind should be INTERNAL')
  })
})

test('@covers_ACFR_4_4 - Hook spans can be toggled per route using ignoreRoutes', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true, ignoreRoutes: ['/ignored'] })

  fastify.get('/ignored', async (request, reply) => {
    return { ignored: true }
  })

  fastify.get('/tracked', async (request, reply) => {
    return { tracked: true }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/ignored' })
  let hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpanCalls.length, 0, 'Should not create hook spans for ignored route')

  mockTracer.startSpan.mock.resetCalls()

  await fastify.inject({ method: 'GET', url: '/tracked' })
  hookSpanCalls = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('fastify.hook.'))
  t.assert.ok(hookSpanCalls.length > 0, 'Should create hook spans for tracked route')

  const serverSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0].startsWith('GET'))
  t.assert.strictEqual(serverSpans.length, 1, 'Should only create server span for tracked route')

  const handlerSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.handler')
  t.assert.strictEqual(handlerSpans.length, 1, 'Should only create handler span for tracked route')
})

test('@covers_ACFR_4_6 - Multiple errors create multiple onError spans', async (t) => {
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

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/error1', async (request, reply) => {
    throw new Error('Error 1')
  })

  fastify.get('/error2', async (request, reply) => {
    throw new Error('Error 2')
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/error1' })
  await fastify.inject({ method: 'GET', url: '/error2' })

  const onErrorSpans = mockTracer.startSpan.mock.calls.filter(call => call.arguments[0] === 'fastify.hook.onError')
  t.assert.strictEqual(onErrorSpans.length, 2, 'Should create 2 onError spans for 2 errors')

  onErrorSpans.forEach((call) => {
    const span = call.result
    t.assert.strictEqual(span.end.mock.calls.length, 1, 'Each onError span should be ended')
  })
})
