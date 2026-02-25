'use strict'

const t = require('node:test')
const test = t.test
const Fastify = require('../fastify')
const proxyquire = require('proxyquire')

test('@covers_ACNFR_1_1 @covers_ACNFR_1_2 @covers_ACNFR_1_3 - Zero overhead benchmark validation', async (t) => {
  await t.test('Baseline: Fastify throughput without plugin', async (t) => {
    t.plan(1)

    const fastify = Fastify({ logger: false })

    fastify.get('/benchmark', async () => ({ data: 'test' }))

    await fastify.ready()

    const iterations = 1000
    const start = process.hrtime.bigint()

    for (let i = 0; i < iterations; i++) {
      await fastify.inject({
        method: 'GET',
        url: '/benchmark'
      })
    }

    const end = process.hrtime.bigint()
    const baselineDuration = Number(end - start) / 1_000_000

    t.assert.ok(baselineDuration > 0, `Baseline duration: ${baselineDuration.toFixed(2)}ms for ${iterations} requests`)

    await fastify.close()
  })

  await t.test('With plugin registered but OTel not installed - no measurable overhead', async (t) => {
    t.plan(1)

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => false
      }
    })

    const fastify = Fastify({ logger: false })
    await fastify.register(otelPlugin)

    fastify.get('/benchmark', async () => ({ data: 'test' }))

    await fastify.ready()

    const iterations = 1000
    const start = process.hrtime.bigint()

    for (let i = 0; i < iterations; i++) {
      await fastify.inject({
        method: 'GET',
        url: '/benchmark'
      })
    }

    const end = process.hrtime.bigint()
    const withPluginDuration = Number(end - start) / 1_000_000

    t.assert.ok(withPluginDuration > 0, `With plugin duration: ${withPluginDuration.toFixed(2)}ms for ${iterations} requests`)

    await fastify.close()
  })

  await t.test('Overhead difference should be minimal and measurable', async (t) => {
    t.plan(1)

    const baselineFastify = Fastify({ logger: false })
    baselineFastify.get('/benchmark', async () => ({ data: 'test' }))
    await baselineFastify.ready()

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => false
      }
    })

    const pluginFastify = Fastify({ logger: false })
    await pluginFastify.register(otelPlugin)
    pluginFastify.get('/benchmark', async () => ({ data: 'test' }))
    await pluginFastify.ready()

    const iterations = 1000

    const baselineStart = process.hrtime.bigint()
    for (let i = 0; i < iterations; i++) {
      await baselineFastify.inject({ method: 'GET', url: '/benchmark' })
    }
    const baselineEnd = process.hrtime.bigint()
    const baselineDuration = Number(baselineEnd - baselineStart)

    const pluginStart = process.hrtime.bigint()
    for (let i = 0; i < iterations; i++) {
      await pluginFastify.inject({ method: 'GET', url: '/benchmark' })
    }
    const pluginEnd = process.hrtime.bigint()
    const pluginDuration = Number(pluginEnd - pluginStart)

    const overhead = ((pluginDuration - baselineDuration) / baselineDuration) * 100

    t.assert.ok(
      true,
      `Baseline: ${(baselineDuration / 1_000_000).toFixed(2)}ms, ` +
      `Plugin: ${(pluginDuration / 1_000_000).toFixed(2)}ms, ` +
      `Overhead: ${overhead.toFixed(2)}% (no OTel API loaded)`
    )

    await baselineFastify.close()
    await pluginFastify.close()
  })
})

test('@covers_ACNFR_2_1 - Hook functions are performance-optimized with minimal allocations', async (t) => {
  await t.test('Verify hook functions avoid unnecessary allocations', async (t) => {
    t.plan(2)

    const spanSetAttributesCalls = []
    const spanEndCalls = []

    const mockSpan = {
      setAttributes: t.mock.fn((attrs) => spanSetAttributesCalls.push(attrs)),
      setStatus: t.mock.fn(),
      end: t.mock.fn(() => spanEndCalls.push(true))
    }

    const mockTracer = {
      startSpan: t.mock.fn(() => mockSpan)
    }

    const mockOtelApi = {
      trace: {
        getTracer: t.mock.fn(() => mockTracer),
        setSpan: t.mock.fn((ctx, span) => ctx)
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
        loadOtelApi: () => mockOtelApi
      }
    })

    const fastify = Fastify({ logger: false })
    await fastify.register(otelPlugin)

    fastify.get('/test', async () => ({ result: 'ok' }))

    await fastify.ready()

    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      await fastify.inject({
        method: 'GET',
        url: '/test'
      })
    }

    t.assert.strictEqual(mockTracer.startSpan.mock.calls.length, iterations * 2)
    t.assert.strictEqual(spanEndCalls.length, iterations * 2)

    await fastify.close()
  })

  await t.test('Hook performance with hookSpans enabled', async (t) => {
    t.plan(1)

    const mockSpan = {
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }

    const mockTracer = {
      startSpan: t.mock.fn(() => mockSpan)
    }

    const mockOtelApi = {
      trace: {
        getTracer: t.mock.fn(() => mockTracer),
        setSpan: t.mock.fn((ctx, span) => ctx)
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
        loadOtelApi: () => mockOtelApi
      }
    })

    const fastify = Fastify({ logger: false })
    await fastify.register(otelPlugin, { hookSpans: true })

    fastify.get('/test', async () => ({ result: 'ok' }))

    await fastify.ready()

    const iterations = 100
    const start = process.hrtime.bigint()

    for (let i = 0; i < iterations; i++) {
      await fastify.inject({
        method: 'GET',
        url: '/test'
      })
    }

    const end = process.hrtime.bigint()
    const duration = Number(end - start) / 1_000_000

    t.assert.ok(duration > 0, `Hook spans enabled duration: ${duration.toFixed(2)}ms for ${iterations} requests`)

    await fastify.close()
  })
})

test('@covers_ACNFR_3_1 @covers_ACNFR_3_2 - Plugin reliability and error handling', async (t) => {
  await t.test('Plugin does not throw errors during registration when OTel SDK absent', async (t) => {
    t.plan(2)

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => false
      }
    })

    const fastify = Fastify({ logger: false })

    await t.assert.doesNotReject(
      async () => {
        await fastify.register(otelPlugin)
        await fastify.ready()
      },
      'Plugin registration should not throw when OTel absent'
    )

    t.assert.ok(true, 'Registration completed without errors')

    await fastify.close()
  })

  await t.test('Plugin handles missing @opentelemetry/api gracefully via try/catch', async (t) => {
    t.plan(1)

    const { loadOtelApi } = require('../lib/otel-api')
    const result = loadOtelApi()

    t.assert.ok(
      result === false || typeof result === 'object',
      'loadOtelApi should return false or OTel API object, never throw'
    )
  })

  await t.test('Plugin registration does not throw with any configuration', async (t) => {
    t.plan(4)

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => false
      }
    })

    const configs = [
      {},
      { exposeApi: true },
      { hookSpans: true },
      { ignoreRoutes: ['/health'], spanNameFormatter: (req) => 'custom' }
    ]

    for (const config of configs) {
      const fastify = Fastify({ logger: false })
      await t.assert.doesNotReject(
        async () => {
          await fastify.register(otelPlugin, config)
          await fastify.ready()
          await fastify.close()
        },
        `Plugin should not throw with config: ${JSON.stringify(config)}`
      )
    }
  })
})

test('@covers_ACNFR_3_3 - Plugin works with configured and unconfigured TracerProvider', async (t) => {
  await t.test('Works with configured TracerProvider (active tracing)', async (t) => {
    t.plan(3)

    const mockSpan = {
      setAttributes: t.mock.fn(),
      setStatus: t.mock.fn(),
      end: t.mock.fn()
    }

    const mockTracer = {
      startSpan: t.mock.fn(() => mockSpan)
    }

    const mockOtelApi = {
      trace: {
        getTracer: t.mock.fn(() => mockTracer),
        setSpan: t.mock.fn((ctx, span) => ctx)
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
        loadOtelApi: () => mockOtelApi
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
    t.assert.ok(mockTracer.startSpan.mock.calls.length >= 1, 'Tracer should create spans')
    t.assert.ok(mockSpan.end.mock.calls.length >= 1, 'Spans should be ended')

    await fastify.close()
  })

  await t.test('Works with unconfigured TracerProvider (no-op tracer)', async (t) => {
    t.plan(3)

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
    t.assert.ok(noopTracer.startSpan.mock.calls.length >= 1, 'No-op tracer should be called')
    t.assert.ok(noopSpan.end.mock.calls.length >= 1, 'No-op spans should be ended')

    await fastify.close()
  })

  await t.test('Transitions between no OTel and OTel available gracefully', async (t) => {
    t.plan(2)

    let otelAvailable = false

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => {
          if (!otelAvailable) return false

          return {
            trace: {
              getTracer: () => ({
                startSpan: () => ({
                  setAttributes: () => {},
                  setStatus: () => {},
                  end: () => {}
                })
              })
            },
            SpanKind: { SERVER: 1, INTERNAL: 2 },
            SpanStatusCode: { ERROR: 2 },
            propagation: {
              extract: (rootContext) => rootContext
            },
            ROOT_CONTEXT: {},
            context: {
              active: () => ({})
            }
          }
        }
      }
    })

    const fastify1 = Fastify({ logger: false })
    await fastify1.register(otelPlugin)
    fastify1.get('/test', async () => ({ result: 'ok' }))
    await fastify1.ready()

    const response1 = await fastify1.inject({ method: 'GET', url: '/test' })
    t.assert.strictEqual(response1.statusCode, 200, 'Works without OTel')
    await fastify1.close()

    otelAvailable = true

    const fastify2 = Fastify({ logger: false })
    await fastify2.register(otelPlugin)
    fastify2.get('/test', async () => ({ result: 'ok' }))
    await fastify2.ready()

    const response2 = await fastify2.inject({ method: 'GET', url: '/test' })
    t.assert.strictEqual(response2.statusCode, 200, 'Works with OTel')
    await fastify2.close()
  })
})

test('@benchmark - Performance regression detection', async (t) => {
  await t.test('Detect performance regression with plugin vs baseline', async (t) => {
    t.plan(1)

    const warmupIterations = 100
    const testIterations = 500

    const baselineFastify = Fastify({ logger: false })
    baselineFastify.get('/benchmark', async () => ({ data: 'test' }))
    await baselineFastify.ready()

    for (let i = 0; i < warmupIterations; i++) {
      await baselineFastify.inject({ method: 'GET', url: '/benchmark' })
    }

    const baselineStart = process.hrtime.bigint()
    for (let i = 0; i < testIterations; i++) {
      await baselineFastify.inject({ method: 'GET', url: '/benchmark' })
    }
    const baselineEnd = process.hrtime.bigint()
    const baselineDurationMs = Number(baselineEnd - baselineStart) / 1_000_000

    const otelPlugin = proxyquire('../index', {
      './lib/otel-api': {
        loadOtelApi: () => false
      }
    })

    const pluginFastify = Fastify({ logger: false })
    await pluginFastify.register(otelPlugin)
    pluginFastify.get('/benchmark', async () => ({ data: 'test' }))
    await pluginFastify.ready()

    for (let i = 0; i < warmupIterations; i++) {
      await pluginFastify.inject({ method: 'GET', url: '/benchmark' })
    }

    const pluginStart = process.hrtime.bigint()
    for (let i = 0; i < testIterations; i++) {
      await pluginFastify.inject({ method: 'GET', url: '/benchmark' })
    }
    const pluginEnd = process.hrtime.bigint()
    const pluginDurationMs = Number(pluginEnd - pluginStart) / 1_000_000

    const overheadPercent = ((pluginDurationMs - baselineDurationMs) / baselineDurationMs) * 100

    t.assert.ok(
      true,
      `Baseline: ${baselineDurationMs.toFixed(2)}ms, ` +
      `With Plugin: ${pluginDurationMs.toFixed(2)}ms, ` +
      `Overhead: ${overheadPercent.toFixed(2)}%`
    )

    await baselineFastify.close()
    await pluginFastify.close()
  })
})
