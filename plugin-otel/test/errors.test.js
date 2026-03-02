'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')

test('errors: handler exception recorded on handler span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/fail', async () => {
    throw new Error('db failed')
  })
  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/fail' })
  t.assert.strictEqual(res.statusCode, 500)

  const spans = await getSpans(exporter, provider)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.ok(handlerSpan.events.some(e => e.name === 'exception'), 'exception event recorded')
})

test('errors: 5xx response sets server span to ERROR', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/fail', async () => {
    throw new Error('db failed')
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 500)
})

test('errors: 5xx without exception (explicit reply.code) sets ERROR on server span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/unavailable', async (request, reply) => {
    reply.code(503)
    return { error: 'unavailable' }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/unavailable' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.ok(serverSpan.status.message.includes('503'))
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.UNSET, 'handler span is UNSET when no exception')
})

test('errors: 4xx response does not set ERROR status', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/notfound', async (request, reply) => {
    reply.code(404)
    return { error: 'not found' }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/notfound' })

  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET)
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 404)
})

test('errors: async rejected promise captured', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/reject', async () => {
    await new Promise((resolve, reject) => setTimeout(() => reject(new Error('async fail')), 10))
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/reject' })

  const spans = await getSpans(exporter, provider)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'async fail')
})
