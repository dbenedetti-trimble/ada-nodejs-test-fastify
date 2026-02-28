'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-09: HTTP semantic convention attributes on server span
test('server span carries correct HTTP semantic convention attributes', async (t) => {
  t.plan(5)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/items', async () => [])
  await fastify.inject({
    method: 'GET',
    url: '/items?page=2',
    headers: { 'user-agent': 'test-agent' }
  })

  const span = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['http.request.method'], 'GET')
  t.assert.strictEqual(span.attributes['url.path'], '/items')
  t.assert.strictEqual(span.attributes['url.query'], 'page=2')
  t.assert.strictEqual(span.attributes['user_agent.original'], 'test-agent')
  t.assert.strictEqual(typeof span.attributes['http.response.status_code'], 'number')
})

// url.query omitted when no query string
test('url.query is omitted when no query string present', async (t) => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/plain', async () => ({}))
  await fastify.inject({ method: 'GET', url: '/plain' })

  const span = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(span.attributes['url.query'], undefined)
})
