'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_9_1: fastify.otel.tracer returns the Tracer instance used by the plugin', async (t) => {
  t.plan(4)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
  const provider = new NodeTracerProvider()
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })
  t.after(() => { fastify.close() })

  t.assert.ok(fastify.otel, 'fastify.otel should exist')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer should exist')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer should have startSpan method')

  const span = fastify.otel.tracer.startSpan('test-span')
  t.assert.ok(span, 'tracer should create spans')
  span.end()
})

test('@covers_ACFR_9_2: request.otelSpan returns the server span for the current request', async (t) => {
  t.plan(3)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    t.assert.ok(request.otelSpan, 'request.otelSpan should exist')
    t.assert.strictEqual(typeof request.otelSpan.setAttribute, 'function', 'span should have setAttribute method')
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')
})

test('@covers_ACFR_9_3: request.otelSpan is undefined when the route is in ignoreRoutes', async (t) => {
  t.plan(2)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
  const provider = new NodeTracerProvider()
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    exposeApi: true,
    ignoreRoutes: ['/health']
  })

  fastify.get('/health', async (request, reply) => {
    t.assert.strictEqual(request.otelSpan, undefined, 'request.otelSpan should be undefined for ignored route')
    return { status: 'ok' }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')
})

test('@covers_ACFR_9_4: request.otelSpan is undefined when OTel is not installed', async (t) => {
  t.plan(2)

  const otelPluginMocked = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })
  await fastify.register(otelPluginMocked, { exposeApi: true })

  fastify.get('/test', async (request, reply) => {
    t.assert.strictEqual(request.otelSpan, undefined, 'request.otelSpan should be undefined when OTel not installed')
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')
})

test('@covers_ACFR_9_5: Custom attributes set via request.otelSpan.setAttribute() appear on the exported span', async (t) => {
  t.plan(4)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/users/:id', async (request, reply) => {
    const span = request.otelSpan
    t.assert.ok(span, 'request.otelSpan should exist')

    span.setAttribute('user.id', request.params.id)
    span.setAttribute('custom.attribute', 'custom-value')

    return { userId: request.params.id }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/users/42' })
  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /users/:id')
  t.assert.ok(serverSpan, 'server span should exist')

  t.assert.deepStrictEqual(
    {
      'user.id': serverSpan.attributes['user.id'],
      'custom.attribute': serverSpan.attributes['custom.attribute']
    },
    {
      'user.id': '42',
      'custom.attribute': 'custom-value'
    },
    'custom attributes should be present on the span'
  )
})

test('@covers_ACFR_9_6: The decorator throws FST_ERR_DEC_ALREADY_PRESENT if otel decorator already exists', async (t) => {
  t.plan(2)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
  const provider = new NodeTracerProvider()
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  fastify.decorate('otel', { existing: 'decorator' })

  try {
    await fastify.register(otelPlugin, { exposeApi: true })
    t.assert.fail('Should have thrown an error')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_DEC_ALREADY_PRESENT', 'should throw FST_ERR_DEC_ALREADY_PRESENT')
    t.assert.ok(err.message.includes('otel'), 'error message should mention otel decorator')
  } finally {
    await fastify.close()
  }
})

test('fastify.otel.tracer can be used to create child spans in user code', async (t) => {
  t.plan(4)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')

  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/users/:id', async (request, reply) => {
    const serverSpan = request.otelSpan
    t.assert.ok(serverSpan, 'server span should exist')

    const dbSpan = fastify.otel.tracer.startSpan('db.query', {
      parent: serverSpan
    })
    dbSpan.setAttribute('db.query', 'SELECT * FROM users WHERE id = ?')
    dbSpan.end()

    return { userId: request.params.id }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/users/42' })
  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.name === 'GET /users/:id')
  const dbSpan = spans.find(s => s.name === 'db.query')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(dbSpan, 'db span should exist')
})
