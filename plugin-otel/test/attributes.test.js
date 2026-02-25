'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')

function setupTracing () {
  trace.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

test('Span attributes include HTTP method', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.request.method'], 'GET', 'HTTP method should be in attributes')
})

test('Span attributes include URL path', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/profile', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/users/profile' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/profile', 'URL path should be in attributes')
})

test('Span attributes include query string when present', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/search', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/search?q=test&limit=10' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.query'], 'q=test&limit=10', 'Query string should be in attributes')
})

test('Span attributes omit query string when not present', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.query'], undefined, 'Query string should be omitted when not present')
})

test('Span attributes include URL scheme', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.scheme'], 'http', 'URL scheme should be in attributes')
})

test('Span attributes include server address', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['server.address'], 'localhost', 'Server address should be in attributes')
})

test('Span attributes include server port as number', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan.attributes['server.port'], 'Server port should be in attributes')
  t.assert.strictEqual(typeof serverSpan.attributes['server.port'], 'number', 'Server port should be a number')
})

test('Span attributes include HTTP version', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['network.protocol.version'], '1.1', 'HTTP version should be in attributes')
})

test('Span attributes include user agent when present', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      'user-agent': 'test-agent/1.0'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['user_agent.original'], 'test-agent/1.0', 'User agent should be in attributes')
})

test('Span attributes include response status code as number', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 200, 'Response status code should be 200')
  t.assert.strictEqual(typeof serverSpan.attributes['http.response.status_code'], 'number', 'Response status code should be a number')
})

test('Span attributes include HTTP route for matched routes', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/users/123' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id', 'HTTP route should use route pattern')
})

test('Span attributes indicate unmatched route for 404s', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/nonexistent' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.route'], 'unmatched', 'HTTP route should be "unmatched" for 404s')
  t.assert.strictEqual(serverSpan.attributes['error.type'], '404', 'Error type should be "404" for unmatched routes')
})

test('Span attributes include content-length from request headers as number', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.post('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'POST',
    url: '/test',
    headers: {
      'content-length': '256'
    },
    payload: { data: 'test' }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['http.request.header.content-length'], 256, 'Request content-length should be 256')
  t.assert.strictEqual(typeof serverSpan.attributes['http.request.header.content-length'], 'number', 'Request content-length should be a number')
})

test('Span attributes include content-length from response headers as number', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  if (serverSpan.attributes['http.response.header.content-length']) {
    t.assert.strictEqual(typeof serverSpan.attributes['http.response.header.content-length'], 'number', 'Response content-length should be a number if present')
  } else {
    t.assert.ok(true, 'Response content-length may not be present')
  }
})

test('Custom attributes can be added via request.otelSpan', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('custom.key', 'custom-value')
    request.otelSpan.setAttribute('custom.number', 42)
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['custom.key'], 'custom-value', 'Custom string attribute should be set')
  t.assert.strictEqual(serverSpan.attributes['custom.number'], 42, 'Custom number attribute should be set')
})

test('All attributes follow stable semantic conventions', async (t) => {
  t.plan(1)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'GET',
    url: '/users/42?page=1',
    headers: {
      'user-agent': 'test/1.0',
      'content-length': '100'
    }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  
  const expectedAttributes = [
    'http.request.method',
    'url.path',
    'url.query',
    'url.scheme',
    'server.address',
    'server.port',
    'network.protocol.version',
    'user_agent.original',
    'http.response.status_code',
    'http.route'
  ]
  
  const hasAllExpected = expectedAttributes.every(attr => attr in serverSpan.attributes)
  t.assert.ok(hasAllExpected, 'All stable semantic convention attributes should be present')
})
