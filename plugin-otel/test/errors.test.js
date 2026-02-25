'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { setupOtel, teardownOtel, getSpans } = require('./setup')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')

const otelPlugin = require('../index')

// VAL-10: Error recording on handler exception
test('VAL-10: handler exception recorded on spans', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/fail', async () => {
    throw new Error('db failed')
  })

  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500)

  const spans = getSpans(otelCtx.exporter)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')

  const handlerEvents = handlerSpan.events
  const exceptionEvent = handlerEvents.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'handler span has exception event')

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 500)

  await fastify.close()
})

// VAL-11: 5xx response without exception sets error status
test('VAL-11: 5xx without exception sets error on server span', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/unavailable', async (request, reply) => {
    reply.code(503).send({ error: 'unavailable' })
  })

  const res = await fastify.inject({ method: 'GET', url: '/unavailable' })
  t.assert.strictEqual(res.statusCode, 503)

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR')
  t.assert.ok(serverSpan.status.message.includes('503'), 'error message includes status code')

  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span status is UNSET')

  await fastify.close()
})

// VAL-12: 4xx response does not set error status
test('VAL-12: 4xx does not set error status', async (t) => {
  const otelCtx = setupOtel()
  t.after(() => teardownOtel(otelCtx))

  const fastify = Fastify()
  await fastify.register(otelPlugin)

  fastify.get('/notfound', async (request, reply) => {
    reply.code(404).send({ error: 'not found' })
  })

  const res = await fastify.inject({ method: 'GET', url: '/notfound' })
  t.assert.strictEqual(res.statusCode, 404)

  const spans = getSpans(otelCtx.exporter)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status is UNSET')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)

  await fastify.close()
})
