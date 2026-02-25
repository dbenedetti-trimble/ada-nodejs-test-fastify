'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-09: HTTP semantic convention attributes on server span
test('VAL-09: HTTP semantic convention attributes', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/items', async () => ({ items: [] }))

  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: {
      'user-agent': 'test-agent'
    }
  })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const attrs = serverSpan.attributes

  t.assert.strictEqual(attrs['http.request.method'], 'GET')
  t.assert.strictEqual(attrs['url.path'], '/items')
  t.assert.strictEqual(attrs['url.query'], 'page=2')
  t.assert.strictEqual(attrs['http.response.status_code'], 200)
  t.assert.strictEqual(attrs['user_agent.original'], 'test-agent')
  t.assert.strictEqual(attrs['http.route'], '/items')

  t.assert.strictEqual(typeof attrs['http.response.status_code'], 'number', 'status_code is a number')
  t.assert.strictEqual(typeof attrs['network.protocol.version'], 'string', 'protocol version is set')

  await fastify.close()
})

test('url.query is omitted when no query string', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/items', async () => ({ items: [] }))

  await fastify.inject({ method: 'GET', url: '/items' })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['url.query'], undefined, 'url.query is omitted')

  await fastify.close()
})

test('user_agent.original is omitted when header is absent', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { 'user-agent': '' }
  })

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['user_agent.original'], undefined, 'user_agent is omitted for empty header')

  await fastify.close()
})
