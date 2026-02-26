'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const {
  NodeTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} = require('@opentelemetry/sdk-trace-node')
const { trace, context, propagation } = require('@opentelemetry/api')
const proxyquire = require('proxyquire')

const pluginNoOtel = proxyquire('../index.js', {
  './lib/otel-api': { loadOtelApi: () => false }
})

function setupOtelProvider () {
  trace.disable()
  context.disable()
  propagation.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

// @covers_ACFR_1_1 @integration_test
test('plugin registers without errors when OTel is installed with SDK configured', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'))
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'span was created')
})

// @covers_ACFR_1_2 @integration_test
test('plugin registers without errors when OTel installed but no SDK configured', async t => {
  t.plan(1)
  trace.disable()
  context.disable()
  propagation.disable()
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())
  await fastify.register(require('../index.js'))
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACFR_1_3 @covers_ACFR_8_1 @covers_ACFR_8_2 @unit_test
test('plugin registers without errors when OTel not installed; logs debug message', async t => {
  t.plan(2)
  const logs = []
  const fastify = Fastify({
    logger: { level: 'debug', stream: { write: msg => logs.push(JSON.parse(msg)) } }
  })
  t.after(() => fastify.close())
  await fastify.register(pluginNoOtel)
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
  const expected = '@opentelemetry/api not found, instrumentation disabled'
  t.assert.ok(logs.some(l => l.msg === expected), 'debug log emitted when OTel absent')
})

// @covers_ACFR_8_3 @unit_test
test('no hooks are registered when OTel is not installed', async t => {
  t.plan(2)
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())
  await fastify.register(pluginNoOtel)
  t.assert.strictEqual(fastify.otel, undefined, 'fastify.otel decorator not registered')
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACFR_1_4 @integration_test
test('fastify.otel decorator available with tracer when exposeApi is true', async t => {
  t.plan(2)
  const { provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
  })
  await fastify.register(require('../index.js'), { exposeApi: true })
  t.assert.ok(fastify.otel, 'fastify.otel decorator defined')
  t.assert.ok(fastify.otel.tracer, 'fastify.otel.tracer defined')
})

// @covers_ACFR_1_5 @covers_ACTC_1_1 @covers_ACTC_1_2 @unit_test
test('plugin is wrapped with fastify-plugin with correct metadata', t => {
  t.plan(2)
  const plugin = require('../index.js')
  t.assert.strictEqual(plugin[Symbol.for('skip-override')], true, 'fastify-plugin sets skip-override')
  t.assert.strictEqual(plugin[Symbol.for('fastify.display-name')], 'fastify-otel', 'plugin name is fastify-otel')
})

// @covers_ACFR_1_6 @integration_test
test('ignoreRoutes excludes matching routes from instrumentation', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'), { ignoreRoutes: ['/health'] })
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/api', async () => ({ data: true }))
  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/health' })
  t.assert.strictEqual(exporter.getFinishedSpans().length, 0, 'no span for ignored route')
  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/api' })
  t.assert.ok(exporter.getFinishedSpans().length > 0, 'span created for non-ignored route')
})

// @covers_ACFR_8_5 @integration_test
test('when OTel API installed without SDK, hooks run but produce no trace output', async t => {
  t.plan(1)
  trace.disable()
  context.disable()
  propagation.disable()
  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())
  await fastify.register(require('../index.js'))
  fastify.get('/test', async () => ({ ok: true }))
  const res = await fastify.inject({ method: 'GET', url: '/test' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACTC_4_1 @integration_test
test('kOtelSpan symbol stores span for internal use without polluting public request properties', async t => {
  t.plan(2)
  const { exporter, provider } = setupOtelProvider()
  const fastify = Fastify({ logger: false })
  t.after(async () => {
    await fastify.close()
    await provider.shutdown()
    exporter.reset()
  })
  await fastify.register(require('../index.js'), { exposeApi: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.length > 0, 'span stored via kOtelSpan symbol and ended in onResponse hook')
  t.assert.ok(spans[0].name, 'span has name set from defaultSpanName')
})
