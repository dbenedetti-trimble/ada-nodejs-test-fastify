'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-10: Handler exception sets ERROR on handler and server spans
test('handler exception is recorded on handler and server spans', async (t) => {
  t.plan(3)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('db failed') })
  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find((s) => s.name === 'fastify.handler')
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
})

// VAL-11: 5xx response without exception sets ERROR status on server span
test('5xx response sets ERROR status on server span without handler exception', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/unavailable', async (req, reply) => {
    return reply.code(503).send({ error: 'unavailable' })
  })
  await fastify.inject({ method: 'GET', url: '/unavailable' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find((s) => s.name === 'fastify.handler')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET)
})

// VAL-12: 4xx response does not set error status
test('4xx response does not set error status on server span', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin)
  fastify.get('/notfound', async (req, reply) => {
    return reply.code(404).send({ error: 'not found' })
  })
  await fastify.inject({ method: 'GET', url: '/notfound' })

  const serverSpan = exporter.getFinishedSpans().find((s) => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
})
