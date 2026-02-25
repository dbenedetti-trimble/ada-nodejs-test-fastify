'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_9_1 - fastify.otel.tracer returns the Tracer instance used by the plugin', async (t) => {
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
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  t.assert.ok(fastify.otel, 'fastify.otel decorator should exist')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer should exist')
  t.assert.strictEqual(fastify.otel.tracer, mockTracer, 'fastify.otel.tracer should be the mock tracer instance')

  await fastify.close()
})

test('@covers_ACFR_9_2 - request.otelSpan returns the server span for the current request', async (t) => {
  t.plan(3)

  let capturedSpan = null

  const mockServerSpan = {
    setAttributes: t.mock.fn(),
    setStatus: t.mock.fn(),
    end: t.mock.fn()
  }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      if (name.includes('GET /test')) {
        return mockServerSpan
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    capturedSpan = request.otelSpan
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.ok(capturedSpan, 'request.otelSpan should be available in handler')
  t.assert.strictEqual(capturedSpan, mockServerSpan, 'request.otelSpan should be the server span')
  t.assert.strictEqual(typeof capturedSpan.setAttributes, 'function', 'Span should have setAttributes method')

  await fastify.close()
})

test('@covers_ACFR_9_3 - request.otelSpan is undefined when the route is in ignoreRoutes', async (t) => {
  t.plan(1)

  let capturedSpan = null

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, {
    exposeApi: true,
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async (request, reply) => {
    capturedSpan = request.otelSpan
    return { status: 'ok' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/health'
  })

  t.assert.strictEqual(capturedSpan, undefined, 'request.otelSpan should be undefined for ignored routes')

  await fastify.close()
})

test('@covers_ACFR_9_4 - request.otelSpan is undefined when OTel is not installed', async (t) => {
  t.plan(2)

  let capturedOtelDecorator = null
  let capturedSpan = null

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => null
    }
  })

  const fastify = Fastify()

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    capturedOtelDecorator = fastify.otel
    capturedSpan = request.otelSpan
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(capturedOtelDecorator, undefined, 'fastify.otel should be undefined when OTel not installed')
  t.assert.strictEqual(capturedSpan, undefined, 'request.otelSpan should be undefined when OTel not installed')

  await fastify.close()
})

test('@covers_ACFR_9_5 - Custom attributes set via request.otelSpan.setAttribute() appear on the exported span', async (t) => {
  t.plan(4)

  const mockServerSpan = {
    setAttribute: t.mock.fn(),
    setAttributes: t.mock.fn(),
    setStatus: t.mock.fn(),
    end: t.mock.fn()
  }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      if (name.includes('GET /users')) {
        return mockServerSpan
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/users/:id', async (request, reply) => {
    t.assert.ok(request.otelSpan, 'request.otelSpan should be available')
    request.otelSpan.setAttribute('user.id', request.params.id)
    request.otelSpan.setAttribute('custom.attribute', 'custom-value')
    return { userId: request.params.id }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/users/42'
  })

  t.assert.strictEqual(mockServerSpan.setAttribute.mock.calls.length, 2, 'setAttribute should be called twice')
  t.assert.deepStrictEqual(mockServerSpan.setAttribute.mock.calls[0].arguments, ['user.id', '42'])
  t.assert.deepStrictEqual(mockServerSpan.setAttribute.mock.calls[1].arguments, ['custom.attribute', 'custom-value'])

  await fastify.close()
})

test('@covers_ACFR_9_6 - The decorator throws FST_ERR_DEC_ALREADY_PRESENT if otel decorator already exists', async (t) => {
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
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  fastify.decorate('otel', { existing: 'decorator' })

  try {
    await fastify.register(otelPlugin, { exposeApi: true })
    await fastify.ready()
    t.assert.fail('Should have thrown an error')
  } catch (error) {
    t.assert.ok(error, 'Should throw an error')
    t.assert.ok(error.message.includes('already decorated') || error.code === 'FST_ERR_DEC_ALREADY_PRESENT', 'Error should be about decorator conflict')
  }

  await fastify.close()
})

test('@integration - Complete decorator API flow with tracer usage', async (t) => {
  t.plan(5)

  const childSpan = {
    end: t.mock.fn()
  }

  const mockServerSpan = {
    setAttribute: t.mock.fn(),
    setAttributes: t.mock.fn(),
    setStatus: t.mock.fn(),
    end: t.mock.fn()
  }

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => {
      if (name === 'db.query') {
        return childSpan
      }
      if (name.includes('GET /users')) {
        return mockServerSpan
      }
      return {
        setAttributes: t.mock.fn(),
        setStatus: t.mock.fn(),
        end: t.mock.fn()
      }
    })
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/users/:id', async (request, reply) => {
    const span = request.otelSpan
    span.setAttribute('user.id', request.params.id)

    const dbSpan = fastify.otel.tracer.startSpan('db.query', {
      parent: span
    })
    dbSpan.end()

    return { userId: request.params.id }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/users/123'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(mockServerSpan.setAttribute.mock.calls.length > 0, 'Should set custom attribute on server span')
  t.assert.ok(mockTracer.startSpan.mock.calls.find(call => call.arguments[0] === 'db.query'), 'Should create child span for db.query')
  t.assert.strictEqual(childSpan.end.mock.calls.length, 1, 'Child span should be ended')
  t.assert.strictEqual(mockServerSpan.end.mock.calls.length, 1, 'Server span should be ended')

  await fastify.close()
})

test('@integration - Decorators not available when exposeApi is false', async (t) => {
  t.plan(2)

  let capturedOtel
  let capturedSpan

  const mockTracer = {
    startSpan: t.mock.fn((name, options, context) => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => mockTracer),
      setSpan: t.mock.fn()
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

  await fastify.register(otelPlugin, { exposeApi: false })

  fastify.get('/test', async (request, reply) => {
    capturedOtel = fastify.otel
    capturedSpan = request.otelSpan
    return { hello: 'world' }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(capturedOtel, undefined, 'fastify.otel should be undefined when exposeApi is false')
  t.assert.strictEqual(capturedSpan, undefined, 'request.otelSpan should be undefined when exposeApi is false')

  await fastify.close()
})
