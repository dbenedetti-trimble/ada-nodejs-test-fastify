'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')

test('handler span: created as child of server span', async t => {
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
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(
    handlerSpan.parentSpanId,
    serverSpan.spanContext().spanId,
    'handler span is child of server span'
  )
})

test('handler span: covers only handler execution', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return { ok: true }
  })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span exists')
})

test('handler span: records exception when handler throws', async t => {
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

  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.message, 'db failed')
  t.assert.ok(handlerSpan.events.length > 0, 'exception recorded')
  t.assert.strictEqual(handlerSpan.events[0].name, 'exception')
})

test('handler span: async handler with promise', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/async', async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    return { ok: true }
  })
  await fastify.ready()

  const res = await fastify.inject({ method: 'GET', url: '/async' })
  t.assert.strictEqual(res.statusCode, 200)

  const spans = await getSpans(exporter, provider)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  t.assert.ok(handlerSpan, 'handler span exists for async handler')
})
