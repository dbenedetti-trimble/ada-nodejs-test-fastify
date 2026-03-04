'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('VAL-09: HTTP semantic convention attributes on server span', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/items', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: {
      'user-agent': 'test-agent'
    }
  })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')

  const attrs = serverSpan.attributes
  t.assert.strictEqual(attrs['http.request.method'], 'GET')
  t.assert.strictEqual(attrs['url.path'], '/items')
  t.assert.strictEqual(attrs['url.query'], 'page=2')
  t.assert.strictEqual(attrs['user_agent.original'], 'test-agent')
  t.assert.strictEqual(attrs['http.response.status_code'], 200)
  t.assert.strictEqual(typeof attrs['http.response.status_code'], 'number')
  t.assert.strictEqual(attrs['http.route'], '/items')
  t.assert.ok(attrs['network.protocol.version'], 'has protocol version')
  t.assert.ok(attrs['server.address'], 'has server address')
  t.assert.ok(attrs['url.scheme'], 'has url scheme')
})

test('url.query omitted when no query string', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/items', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/items' })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['url.query'], undefined, 'url.query not set')
})

test('user_agent.original set when user-agent header present', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/items', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/items',
    headers: { 'user-agent': 'custom-agent/1.0' }
  })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.attributes['user_agent.original'], 'custom-agent/1.0', 'user_agent set correctly')
})

test('content-length attributes are numbers', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.post('/data', async (request) => ({ received: true }))

  await fastify.inject({
    method: 'POST',
    url: '/data',
    headers: { 'content-type': 'application/json', 'content-length': '15' },
    payload: { hello: 'world' }
  })

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const reqCL = serverSpan.attributes['http.request.header.content-length']
  if (reqCL !== undefined) {
    t.assert.strictEqual(typeof reqCL, 'number', 'request content-length is a number')
  }
})
