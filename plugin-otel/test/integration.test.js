'use strict'

const { test, after } = require('node:test')
const Fastify = require('fastify')
const { SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const { setupOtel, shutdownOtel } = require('./helper')
const otelPlugin = require('../index')

after(() => shutdownOtel())

test('complete request produces server and handler spans with correct attributes', async t => {
  t.plan(5)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/users/:id', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/users/42' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span exists')
  t.assert.ok(handlerSpan, 'handler span exists')
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id')
  t.assert.strictEqual(serverSpan.attributes['http.response.status_code'], 200)
  t.assert.strictEqual(handlerSpan.parentSpanId, serverSpan.spanContext().spanId)
})

test('full hook spans scenario with multiple hook phases', async t => {
  t.plan(4)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', async () => { })
  fastify.addHook('preHandler', async () => { })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const onRequestHookSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  const preHandlerHookSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(onRequestHookSpan, 'onRequest hook span exists')
  t.assert.ok(preHandlerHookSpan, 'preHandler hook span exists')
  t.assert.strictEqual(onRequestHookSpan.parentSpanId, serverSpan.spanContext().spanId)
  t.assert.ok(handlerSpan, 'handler span exists')
})

test('W3C propagation + custom attribute on server span', async t => {
  t.plan(3)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async (request) => {
    request.otelSpan.setAttribute('user.id', '42')
    return { ok: true }
  })

  await fastify.inject({
    method: 'GET',
    url: '/test',
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    }
  })

  const serverSpan = exporter.getFinishedSpans().find(s => s.kind === SpanKind.SERVER)
  t.assert.strictEqual(serverSpan.spanContext().traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  t.assert.strictEqual(serverSpan.parentSpanId, '00f067aa0ba902b7')
  t.assert.strictEqual(serverSpan.attributes['user.id'], '42')
})

test('error in request results in error spans and correct status code', async t => {
  t.plan(3)
  const { exporter } = setupOtel()

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/fail', async () => { throw new Error('failure') })
  const response = await fastify.inject({ method: 'GET', url: '/fail' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.strictEqual(response.statusCode, 500)
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR)
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR)
})
