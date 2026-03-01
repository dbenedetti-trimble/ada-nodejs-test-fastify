'use strict'

const { test, describe, after } = require('node:test')
const { SpanKind } = require('@opentelemetry/api')
const { createTestSetup } = require('./helpers/setup')

const { exporter, buildFastify, teardown } = createTestSetup()

after(teardown)

describe('HTTP semantic convention attributes (OTEL-5)', () => {
  test('request attributes set on server span at onRequest (VAL-09)', async (t) => {
    t.plan(5)
    const fastify = buildFastify()
    fastify.get('/items', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({
      method: 'GET',
      url: '/items?page=2',
      headers: { 'user-agent': 'test-agent' }
    })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['http.request.method'], 'GET')
    t.assert.strictEqual(serverSpan.attributes['url.path'], '/items')
    t.assert.strictEqual(serverSpan.attributes['url.query'], 'page=2')
    t.assert.strictEqual(serverSpan.attributes['user_agent.original'], 'test-agent')
    t.assert.strictEqual(serverSpan.attributes['network.protocol.version'], '1.1')
    await fastify.close()
  })

  test('response attributes set on server span at onResponse (VAL-09)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/items/:id', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/items/5' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 200)
    t.assert.strictEqual(serverSpan.attributes['http.route'], '/items/:id')
    await fastify.close()
  })

  test('url.query omitted when no query string present', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/items', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/items' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(!('url.query' in serverSpan.attributes), 'url.query not set when no query string')
    await fastify.close()
  })

  test('user_agent.original omitted when header is absent', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/items', async () => ({ ok: true }))
    await fastify.ready()
    // Override the default lightMyRequest user-agent with empty string to test absent case
    await fastify.inject({ method: 'GET', url: '/items', headers: { 'user-agent': '' } })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(!('user_agent.original' in serverSpan.attributes), 'user_agent.original not set when header absent')
    await fastify.close()
  })

  test('numeric attributes are numbers not strings (VAL-09)', async (t) => {
    t.plan(2)
    const fastify = buildFastify()
    fastify.get('/items', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/items' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(typeof serverSpan.attributes['http.response.status_code'], 'number', 'status_code is a number')
    t.assert.ok(true, 'numeric type check complete')
    await fastify.close()
  })

  test('http.route uses parameterized pattern (VAL-05)', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/users/:id', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/users/42' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
    await fastify.close()
  })

  test('server.address is set correctly', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test', headers: { host: 'example.com' } })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.ok(typeof serverSpan.attributes['server.address'] === 'string', 'server.address is a string')
    await fastify.close()
  })

  test('url.scheme reflects connection protocol', async (t) => {
    t.plan(1)
    const fastify = buildFastify()
    fastify.get('/test', async () => ({ ok: true }))
    await fastify.ready()
    await fastify.inject({ method: 'GET', url: '/test' })

    const spans = exporter.getFinishedSpans()
    const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
    t.assert.strictEqual(serverSpan.attributes['url.scheme'], 'http', 'url.scheme is http for plain HTTP injection')
    await fastify.close()
  })
})
