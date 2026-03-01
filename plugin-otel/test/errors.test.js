'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('handler exception is recorded on handler and server spans', async t => {
  t.plan(3)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => { throw new Error('db failed') })
  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
})

test('5xx response without exception sets error status on server span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (req, reply) => reply.code(503).send({ error: 'unavailable' }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET)
})

test('4xx response does not set error status on server span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (req, reply) => reply.code(404).send({ error: 'not found' }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
})

test('server span status is ERROR for 5xx with message including status code', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/test', async (req, reply) => reply.code(500).send({ error: 'internal' }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(serverSpan.status.message, 'HTTP 500')
})

test('async handler rejection is recorded on handler span', async t => {
  t.plan(2)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin)
  fastify.get('/fail', async () => {
    return Promise.reject(new Error('async error'))
  })
  await fastify.inject({ method: 'GET', url: '/fail' })

  const handlerSpan = exporter.getFinishedSpans().find(s => s.name === 'fastify.handler')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'async error')
})
