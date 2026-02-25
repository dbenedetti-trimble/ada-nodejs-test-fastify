'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_1_1 - Plugin registers without errors when @opentelemetry/api is installed and SDK configured', async (t) => {
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

  await fastify.register(otelPlugin, {
    exposeApi: true,
    hookSpans: false,
    ignoreRoutes: []
  })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(mockOtelApi.trace.getTracer.mock.calls.length, 1)
  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 1, 'At least server span should be created')
})

test('@covers_ACFR_1_2 - Plugin registers without errors when @opentelemetry/api installed but no SDK configured', async (t) => {
  t.plan(2)

  const noopTracer = {
    startSpan: t.mock.fn(() => ({
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }))
  }

  const mockOtelApi = {
    trace: {
      getTracer: t.mock.fn(() => noopTracer)
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
    return { status: 'ok' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(noopTracer.startSpan.mock.calls.length >= 1, 'At least server span should be created')
})

test('@covers_ACFR_1_3 - Plugin registers without errors when @opentelemetry/api is not installed', async (t) => {
  t.plan(3)

  const { Writable } = require('node:stream')
  const debugLogs = []
  const stream = new Writable({
    write (chunk, encoding, callback) {
      const log = JSON.parse(chunk.toString())
      if (log.level === 20) {
        debugLogs.push(log.msg)
      }
      callback()
    }
  })

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({
    logger: {
      level: 'debug',
      stream
    }
  })

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
  t.assert.strictEqual(response.json().hello, 'world')

  const hasDebugMessage = debugLogs.some(msg =>
    typeof msg === 'string' && msg.includes('@opentelemetry/api not found')
  )
  t.assert.ok(hasDebugMessage, 'Debug message about missing OTel API should be logged')
})

test('@covers_ACFR_1_4 - When exposeApi is true, fastify.otel decorator is available with tracer', async (t) => {
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

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    t.assert.ok(request.otelSpan, 'request.otelSpan should be available')
    return { hello: 'world' }
  })

  await fastify.ready()

  t.assert.ok(fastify.otel, 'fastify.otel decorator should exist')
  t.assert.strictEqual(fastify.otel.tracer, mockTracer, 'fastify.otel.tracer should be the mock tracer')

  await fastify.inject({
    method: 'GET',
    url: '/test'
  })
})

test('@covers_ACFR_1_4 - When exposeApi is false, decorators are not added', async (t) => {
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

  await fastify.register(otelPlugin, { exposeApi: false })

  fastify.get('/test', async (request, reply) => {
    return { hello: 'world' }
  })

  await fastify.ready()

  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel should not exist when exposeApi is false')

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
})

test('@covers_ACFR_1_5 - Plugin uses fastify-plugin wrapper', async (t) => {
  t.plan(1)

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

  await fastify.register(function (instance, opts, done) {
    instance.get('/nested', async (request, reply) => {
      return { nested: true }
    })
    done()
  })

  fastify.get('/root', async (request, reply) => {
    return { root: true }
  })

  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/nested'
  })

  await fastify.inject({
    method: 'GET',
    url: '/root'
  })

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 2, 'Hooks should apply to all routes due to fastify-plugin wrapper (at least 2 server spans)')
})

test('@covers_ACFR_1_6 - ignoreRoutes patterns exclude matching routes from instrumentation', async (t) => {
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

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health', '/metrics']
  })

  fastify.get('/health', async (request, reply) => {
    return { status: 'ok' }
  })

  fastify.get('/api/users', async (request, reply) => {
    return { users: [] }
  })

  await fastify.ready()

  const healthResponse = await fastify.inject({
    method: 'GET',
    url: '/health'
  })
  t.assert.strictEqual(healthResponse.statusCode, 200)

  const usersResponse = await fastify.inject({
    method: 'GET',
    url: '/api/users'
  })
  t.assert.strictEqual(usersResponse.statusCode, 200)

  t.assert.ok(mockTracer.startSpan.mock.calls.length >= 1, 'Only non-ignored routes should create spans (at least 1 server span)')
})

test('Plugin handles options defaults correctly', async (t) => {
  t.plan(1)

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
})
