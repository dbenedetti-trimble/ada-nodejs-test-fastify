'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('server span lifecycle', () => {
  test('one SERVER span created per request (VAL-04)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpans.length, 1, 'exactly one SERVER span')
    t.assert.strictEqual(serverSpans[0].name, 'GET /test')
    await fastify.close()
  })

  test('server span name is METHOD + route pattern (VAL-04)', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/hello', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/hello' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.name, 'GET /hello')
    await fastify.close()
  })

  test('server span uses route pattern not resolved URL (VAL-05)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/users/:id', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/users/42' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'span name uses route pattern')
    t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42', 'url.path is resolved URL')
    await fastify.close()
  })

  test('server span duration covers full request lifecycle', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/slow', async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/slow' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    // Duration in nanoseconds: endTime - startTime
    const durationMs = (serverSpan.duration[0] * 1e3) + (serverSpan.duration[1] / 1e6)
    t.assert.ok(durationMs >= 25, `server span duration ${durationMs}ms covers handler execution`)
    await fastify.close()
  })

  test('404 route span name is METHOD only', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/not-found' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    // For 404, routeOptions.url is undefined, so span name is just "GET"
    t.assert.strictEqual(serverSpan.name, 'GET', '404 span name is METHOD only')
    await fastify.close()
  })

  test('server span is accessible from the request object (VAL-17)', async (t) => {
    t.plan(1)
    const fastify = buildFastify({ exposeApi: true })
    fastify.get('/test', async (request) => {
      request.otelSpan.setAttribute('test.custom', 'yes')
      return { ok: true }
    })
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['test.custom'], 'yes', 'custom attribute set via request.otelSpan appears on span')
    await fastify.close()
  })
})
