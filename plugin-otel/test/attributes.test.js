'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('server span carries correct HTTP semantic convention attributes', async t => {
  t.plan(4)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/items', async () => ([]))
  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: { 'user-agent': 'test-agent' }
  })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.request.method'], 'GET')
  t.assert.strictEqual(span.attributes['url.query'], 'page=2')
  t.assert.strictEqual(span.attributes['user_agent.original'], 'test-agent')
  t.assert.strictEqual(typeof span.attributes['http.response.status_code'], 'number')
})

test('url.path is the path without query string', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/items', async () => ([]))
  await fastify.inject({ method: 'GET', url: '/items?page=2' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['url.path'], '/items')
  t.assert.strictEqual(span.attributes['url.query'], 'page=2')
})

test('url.query is omitted when there is no query string', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/items', async () => ([]))
  await fastify.inject({ method: 'GET', url: '/items' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['url.query'], undefined)
})

test('user_agent.original is set when user-agent header is present', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/items', async () => ([]))
  await fastify.inject({ method: 'GET', url: '/items', headers: { 'user-agent': 'my-client/1.0' } })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['user_agent.original'], 'my-client/1.0')
})

test('http.response.status_code is set as a number', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (req, reply) => reply.code(201).send({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(typeof span.attributes['http.response.status_code'], 'number')
  t.assert.strictEqual(span.attributes['http.response.status_code'], 201)
})

test('http.route uses parameterized pattern', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/users/42' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.route'], '/users/:id')
  t.assert.strictEqual(span.attributes['url.path'], '/users/42')
})

test('network.protocol.version is set', async t => {
  t.plan(1)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const span = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(span.attributes['network.protocol.version'], 'network.protocol.version is set')
})
