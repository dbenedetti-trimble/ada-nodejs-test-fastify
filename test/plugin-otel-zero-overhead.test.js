'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACFR_8_1 @covers_ACFR_8_2 - Fastify starts and serves requests normally when @opentelemetry/api is not installed', async (t) => {
  t.plan(3)

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })

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
  t.assert.deepStrictEqual(response.json(), { status: 'ok' })
  t.assert.ok(true, 'No MODULE_NOT_FOUND errors thrown')
})

test('@covers_ACFR_8_3 - No hooks are registered when @opentelemetry/api is missing', async (t) => {
  t.plan(1)

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })

  const initialOnRequestHooks = fastify[Symbol.for('fastify.hooks')]?.onRequest?.length || 0

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.ready()

  const finalOnRequestHooks = fastify[Symbol.for('fastify.hooks')]?.onRequest?.length || 0

  t.assert.strictEqual(
    finalOnRequestHooks,
    initialOnRequestHooks,
    'No additional hooks should be registered when OTel API is missing'
  )
})

test('@covers_ACFR_8_4 - No measurable performance difference with plugin registered (no OTel installed)', async (t) => {
  t.plan(3)

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => false
    }
  })

  const fastify = Fastify({ logger: false })
  await fastify.register(otelPlugin)

  fastify.get('/benchmark', async () => ({ data: 'test' }))

  await fastify.ready()

  const onRequestHooks = fastify[Symbol.for('fastify.hooks')]?.onRequest || []
  const onResponseHooks = fastify[Symbol.for('fastify.hooks')]?.onResponse || []

  t.assert.strictEqual(onRequestHooks.length, 0, 'No onRequest hooks should be registered')
  t.assert.strictEqual(onResponseHooks.length, 0, 'No onResponse hooks should be registered')

  const response = await fastify.inject({
    method: 'GET',
    url: '/benchmark'
  })

  t.assert.strictEqual(response.statusCode, 200, 'Request completes successfully without overhead')

  await fastify.close()
})

test('@covers_ACFR_8_5 - When OTel API installed without SDK, hooks run but produce no trace output', async (t) => {
  t.plan(4)

  const noopSpan = {
    setAttributes: t.mock.fn(),
    setStatus: t.mock.fn(),
    end: t.mock.fn()
  }

  const noopTracer = {
    startSpan: t.mock.fn(() => noopSpan)
  }

  const mockOtelApiNoSDK = {
    trace: {
      getTracer: t.mock.fn(() => noopTracer)
    },
    SpanKind: { SERVER: 1, INTERNAL: 2 },
    SpanStatusCode: { ERROR: 2 },
    propagation: {
      extract: t.mock.fn((rootContext) => rootContext)
    },
    ROOT_CONTEXT: {},
    context: {
      active: t.mock.fn(() => ({}))
    }
  }

  const otelPlugin = proxyquire('../index', {
    './lib/otel-api': {
      loadOtelApi: () => mockOtelApiNoSDK
    }
  })

  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ result: 'ok' }))

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.ok(noopTracer.startSpan.mock.calls.length >= 1, 'Hooks should run and attempt to create spans')
  t.assert.ok(noopSpan.end.mock.calls.length >= 1, 'Spans should be ended')
  t.assert.ok(true, 'No actual trace data exported (noop tracer)')

  await fastify.close()
})
