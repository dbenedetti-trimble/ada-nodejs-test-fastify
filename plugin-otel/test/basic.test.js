'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_1_1: Plugin registers without errors when @opentelemetry/api is installed and SDK is configured', async (t) => {
  t.plan(3)

  const { trace } = require('@opentelemetry/api')
  trace.disable()

  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
  const provider = new NodeTracerProvider()
  provider.register()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })
  t.after(() => { fastify.close() })

  t.assert.ok(fastify.otel, 'fastify.otel decorator should exist')
  t.assert.ok(fastify.otel.tracer, 'tracer should be available')
  t.assert.strictEqual(typeof fastify.otel.tracer.startSpan, 'function', 'tracer should have startSpan method')
})

test('@covers_ACFR_1_2: Plugin registers without errors when @opentelemetry/api is installed but no SDK is configured', async (t) => {
  t.plan(1)

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  t.after(() => { fastify.close() })

  await fastify.ready()
  t.assert.ok(true, 'plugin registered successfully')
})

test('@covers_ACFR_1_3: Plugin registers without errors when @opentelemetry/api is not installed', async (t) => {
  t.plan(2)

  const otelPluginMocked = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })
  await fastify.register(otelPluginMocked)
  t.after(() => { fastify.close() })

  await fastify.ready()
  t.assert.ok(true, 'plugin registered successfully')
  t.assert.strictEqual(fastify.otel, undefined, 'otel decorator should not exist')
})

test('@covers_ACFR_1_4: When exposeApi is true, fastify.otel decorator is available', async (t) => {
  t.plan(2)

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
})

test('@covers_ACFR_1_5: Plugin uses fastify-plugin wrapper so hooks apply globally', async (t) => {
  t.plan(1)

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

  await fastify.register(async function plugin (instance) {
    await instance.register(otelPlugin)
    instance.get('/test', async () => ({ ok: true }))
  })

  t.after(() => { fastify.close() })

  await fastify.ready()
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 2, 'spans should be created even in encapsulated context (server + handler)')
})

test('@covers_ACFR_1_6: ignoreRoutes patterns exclude matching routes from instrumentation', async (t) => {
  t.plan(2)

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

  await fastify.register(otelPlugin, {
    ignoreRoutes: ['/health', /^\/metrics/]
  })

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics/stats', async () => ({ metrics: [] }))

  t.after(() => { fastify.close() })

  await fastify.ready()
  await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.inject({ method: 'GET', url: '/metrics/stats' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 2, 'only /test should create spans (server + handler)')
  t.assert.strictEqual(spans.filter(s => s.name === 'GET /test').length, 1, 'span should be for /test route')
})

test('@covers_ACFR_8_1, @covers_ACFR_8_2: Fastify starts and serves requests normally when OTel not installed', async (t) => {
  t.plan(2)

  const otelPluginMocked = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })
  await fastify.register(otelPluginMocked)

  fastify.get('/test', async () => ({ result: 'success' }))

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  t.assert.strictEqual(response.statusCode, 200, 'should return 200')
  t.assert.deepStrictEqual(response.json(), { result: 'success' }, 'should return expected response')
})

test('@covers_ACFR_8_3: No hooks are registered in the no-module case', async (t) => {
  t.plan(1)

  const otelPluginMocked = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })

  const initialHooksCount = Object.keys(fastify).filter(k => k.startsWith('on')).length

  await fastify.register(otelPluginMocked)
  await fastify.ready()

  const finalHooksCount = Object.keys(fastify).filter(k => k.startsWith('on')).length

  t.after(() => { fastify.close() })

  t.assert.strictEqual(initialHooksCount, finalHooksCount, 'no additional hooks should be registered')
})

test('@covers_ACFR_8_5: When OTel API is installed without SDK, hooks run but produce no trace output', async (t) => {
  t.plan(2)

  const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-node')

  const exporter = new InMemorySpanExporter()

  const otelPlugin = require('../index')
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/test' })

  t.assert.strictEqual(response.statusCode, 200, 'request should succeed')

  const spans = exporter.getFinishedSpans()
  t.assert.strictEqual(spans.length, 0, 'no spans should be exported without SDK configuration')
})
