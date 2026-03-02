'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('attributes: request attributes set at span creation', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/items', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/items?page=2&limit=10',
    headers: {
      'user-agent': 'test-agent',
      'content-length': '256'
    }
  })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['http.request.method'], 'GET')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/items')
  t.assert.strictEqual(serverSpan.attributes['url.query'], 'page=2&limit=10')
  t.assert.strictEqual(serverSpan.attributes['network.protocol.version'], '1.1')
  t.assert.strictEqual(serverSpan.attributes['user_agent.original'], 'test-agent')
  t.assert.strictEqual(serverSpan.attributes['http.request.header.content-length'], 256)
})

test('attributes: response attributes set at span completion', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/items', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/items' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 200)
  t.assert.strictEqual(typeof serverSpan.attributes['http.response.status_code'], 'number')
  t.assert.strictEqual(serverSpan.attributes['http.route'], '/items')
})

test('attributes: url.query omitted when no query string', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['url.query'], undefined, 'url.query not set')
})

test('attributes: user_agent.original set when header present via inject', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: { 'user-agent': 'my-custom-agent' }
  })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['user_agent.original'], 'my-custom-agent')
})

test('attributes: http.route uses parameterized pattern', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(serverSpan.attributes['url.path'], '/users/42')
})

test('attributes: status_code is a number', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(typeof serverSpan.attributes['http.response.status_code'], 'number')
})
