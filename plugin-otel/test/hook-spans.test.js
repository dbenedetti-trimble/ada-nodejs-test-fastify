'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { SpanKind } = require('@opentelemetry/api')
const otelPlugin = require('../index')
const { setupOtel } = require('./helper')

// VAL-07: Hook spans created when hookSpans is true
test('hook spans are created when hookSpans is true', async (t) => {
  t.plan(2)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find((s) => s.kind === SpanKind.SERVER)
  const hookSpans = spans.filter((s) => s.name.startsWith('fastify.hook.'))
  t.assert.ok(hookSpans.length > 0, 'hook spans were created')
  t.assert.ok(
    hookSpans.every((s) => s.parentSpanId === serverSpan.spanContext().spanId),
    'all hook spans are children of server span'
  )
})

// VAL-08: No hook spans when hookSpans is false
test('no hook spans when hookSpans is false', async (t) => {
  t.plan(1)
  const { exporter, provider } = setupOtel()
  t.after(() => provider.shutdown())

  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/test' })

  const hookSpans = exporter.getFinishedSpans().filter((s) => s.name.startsWith('fastify.hook.'))
  t.assert.strictEqual(hookSpans.length, 0)
})
