'use strict'

const { test } = require('node:test')
const Fastify = require('../..')
const otelPlugin = require('..')
const { setupOtel, teardownOtel, getSpans } = require('./helper')
const { SpanKind } = require('@opentelemetry/api')

test('hook spans: created when hookSpans is true', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.ok(hookSpans.length > 0, 'hook spans are created')

  const hookNames = hookSpans.map(s => s.name)
  t.assert.ok(hookNames.includes('fastify.hook.onRequest'), 'onRequest hook span created')
  t.assert.ok(hookNames.includes('fastify.hook.preHandler'), 'preHandler hook span created')
})

test('hook spans: are children of server span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  for (const hookSpan of hookSpans) {
    t.assert.strictEqual(
      hookSpan.parentSpanId,
      serverSpan.spanContext().spanId,
      `${hookSpan.name} is child of server span`
    )
  }
})

test('hook spans: not created when hookSpans is false', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: false })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans when disabled')
})

test('hook spans: onError span created only on error', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/ok', async () => ({ ok: true }))
  fastify.get('/fail', async () => { throw new Error('boom') })
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/ok' })
  let spans = await getSpans(exporter, provider)
  let onErrorSpans = spans.filter(s => s.name === 'fastify.hook.onError')
  t.assert.strictEqual(onErrorSpans.length, 0, 'no onError span for successful request')

  exporter.reset()
  await fastify.inject({ method: 'GET', url: '/fail' })
  spans = await getSpans(exporter, provider)
  onErrorSpans = spans.filter(s => s.name === 'fastify.hook.onError')
  t.assert.strictEqual(onErrorSpans.length, 1, 'onError span created for error request')
})

test('hook spans: onResponse does not get its own hook span', async t => {
  const { provider, exporter } = setupOtel()
  t.after(() => teardownOtel(provider))

  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(otelPlugin, { hookSpans: true })
  fastify.get('/test', async () => ({ ok: true }))
  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/test' })
  const spans = await getSpans(exporter, provider)
  const onResponseHookSpans = spans.filter(s => s.name === 'fastify.hook.onResponse')

  t.assert.strictEqual(onResponseHookSpans.length, 0, 'no onResponse hook span')
})
