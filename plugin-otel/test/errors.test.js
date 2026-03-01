'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const { setupOtel } = require('./helper')
const otelPlugin = require('../index')

test('VAL-10: handler exception records error on handler and server spans', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('db failed') })

  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status is ERROR')
  t.assert.strictEqual(handlerSpan.status.message, 'db failed', 'handler span status message')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR for 5xx')
})

test('VAL-11: 5xx response without exception sets error status on server span', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/unavailable', async (req, reply) => {
    return reply.code(503).send({ error: 'unavailable' })
  })

  await fastify.inject({ method: 'GET', url: '/unavailable' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status is ERROR for 503')
  t.assert.ok(serverSpan.status.message.includes('503'), 'server span status message includes status code')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span status is UNSET (no exception)')
})

test('VAL-12: 4xx response does not set error status', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/notfound', async (req, reply) => {
    return reply.code(404).send({ error: 'not found' })
  })

  await fastify.inject({ method: 'GET', url: '/notfound' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status is UNSET for 4xx')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404, 'http.response.status_code is 404')
})

test('handler exception is recorded via recordException', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('test error') })

  await fastify.inject({ method: 'GET', url: '/fail' })

  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan.events.length > 0, 'exception event recorded on handler span')
  const exceptionEvent = handlerSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception event exists')
})

test('onError hook span is created when error occurs and hookSpans: true', async t => {
  const { exporter } = setupOtel()
  // provider is module-scoped, no shutdown needed per test

  const fastify = Fastify({ logger: false })
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/fail', async () => { throw new Error('oops') })

  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const onErrorSpan = spans.find(s => s.name === 'fastify.hook.onError')
  t.assert.ok(onErrorSpan, 'fastify.hook.onError span is created on error')
})
