'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const otelPlugin = require('../index')
const { setupOtel, teardownOtel, getSpans, findSpan } = require('./helper')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')

test('VAL-10: error recording on handler exception', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/fail', async () => {
    throw new Error('db failed')
  })

  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500)

  const spans = getSpans(exporter)
  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.ok(handlerSpan.events.length > 0, 'handler span has events')
  t.assert.strictEqual(handlerSpan.events[0].name, 'exception')

  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 500)
})

test('VAL-11: 5xx response without exception sets error status', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/unavailable', async (request, reply) => {
    reply.code(503)
    return { error: 'unavailable' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/unavailable' })
  t.assert.strictEqual(res.statusCode, 503)

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR')
  t.assert.strictEqual(serverSpan.status.message, 'HTTP 503')

  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span status is UNSET')
})

test('VAL-12: 4xx response does not set error status', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/notfound', async (request, reply) => {
    reply.code(404)
    return { error: 'not found' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(res.statusCode, 404)

  const spans = getSpans(exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.ok(serverSpan, 'server span exists')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status is UNSET')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
})

test('async rejected promise records error on handler span', async t => {
  const { exporter, provider } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/reject', async () => {
    return Promise.reject(new Error('async fail'))
  })

  const res = await fastify.inject({ method: 'GET', url: '/reject' })
  t.assert.strictEqual(res.statusCode, 500)

  const spans = getSpans(exporter)
  const handlerSpan = findSpan(spans, 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'async fail')
})
