'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-09: HTTP semantic convention attributes on server span', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/items', async () => [])

  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: { 'user-agent': 'test-agent' }
  })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.request.method'], 'GET', 'http.request.method')
  t.assert.strictEqual(span.attributes['url.path'], '/items', 'url.path')
  t.assert.strictEqual(span.attributes['url.query'], 'page=2', 'url.query')
  t.assert.strictEqual(span.attributes['user_agent.original'], 'test-agent', 'user_agent.original')
  t.assert.strictEqual(typeof span.attributes['http.response.status_code'], 'number', 'http.response.status_code is a number')
  t.assert.strictEqual(span.attributes['http.response.status_code'], 200, 'http.response.status_code value')
})

test('url.query is omitted when there is no query string', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['url.query'], undefined, 'url.query is not set when no query string')
})

test('user_agent.original is set when user-agent header is present', async t => {
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/test', headers: { 'user-agent': 'my-client/1.0' } })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['user_agent.original'], 'my-client/1.0', 'user_agent.original is set from header')
})

test('http.route uses parameterized route pattern', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/users/:id/posts/:postId', async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/users/42/posts/7' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.route'], '/users/:id/posts/:postId', 'http.route uses pattern')
  t.assert.strictEqual(span.attributes['url.path'], '/users/42/posts/7', 'url.path uses resolved URL')
})

test('http.request.method and network.protocol.version are set', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.post('/test', async () => ({ ok: true }))

  await fastify.inject({ method: 'POST', url: '/test' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.request.method'], 'POST')
  t.assert.ok(span.attributes['network.protocol.version'], 'network.protocol.version is set')
})
