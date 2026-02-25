'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api')
const otelPlugin = require('../index')

function setupTracing () {
  trace.disable()
  const exporter = new InMemorySpanExporter()
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)]
  })
  provider.register()
  return { exporter, provider }
}

test('@covers_ACFR_6_1: Handler exceptions are recorded on the handler span via recordException', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Handler exception')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')

  const exceptionEvent = handlerSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception should be recorded via recordException on handler span')
})

test('@covers_ACFR_6_2: Handler span status is set to ERROR when the handler throws', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Handler error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span status should be ERROR')
})

test('@covers_ACFR_6_3: Server span status is set to ERROR for 5xx responses', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/server-error', async (request, reply) => {
    reply.code(500).send({ error: 'Internal Server Error' })
  })

  fastify.get('/bad-gateway', async (request, reply) => {
    reply.code(502).send({ error: 'Bad Gateway' })
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/server-error' })
  await fastify.inject({ method: 'GET', url: '/bad-gateway' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 2, 'two server spans should exist')
  t.assert.strictEqual(serverSpans[0].status.code, SpanStatusCode.ERROR, 'first server span (500) status should be ERROR')
  t.assert.strictEqual(serverSpans[1].status.code, SpanStatusCode.ERROR, 'second server span (502) status should be ERROR')
})

test('@covers_ACFR_6_4: Server span status is UNSET for 4xx responses', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/not-found', async (request, reply) => {
    reply.code(404).send({ error: 'Not Found' })
  })

  fastify.get('/bad-request', async (request, reply) => {
    reply.code(400).send({ error: 'Bad Request' })
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/not-found' })
  await fastify.inject({ method: 'GET', url: '/bad-request' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 2, 'two server spans should exist')
  t.assert.strictEqual(serverSpans[0].status.code, SpanStatusCode.UNSET, 'first server span (404) status should be UNSET')
  t.assert.strictEqual(serverSpans[1].status.code, SpanStatusCode.UNSET, 'second server span (400) status should be UNSET')
})

test('@covers_ACFR_6_5: The error message is included in the span status description', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Specific error message')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.message, 'Specific error message', 'error message should be in span status description')
})

test('@covers_ACFR_6_6: Errors that occur in hooks (not the handler) are recorded on the server span', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.addHook('preHandler', async (request, reply) => {
    throw new Error('Hook error')
  })

  fastify.get('/test', async () => {
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span status should be ERROR for hook error')
  
  const exceptionEvent = serverSpan.events.find(e => e.name === 'exception')
  t.assert.ok(exceptionEvent, 'exception should be recorded on server span for hook errors')
})

test('@covers_ACFR_6_7: Both sync thrown errors and async rejected promises are captured', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/sync-error', (request, reply) => {
    throw new Error('Sync error')
  })

  fastify.get('/async-error', async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    throw new Error('Async error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/sync-error' })
  await fastify.inject({ method: 'GET', url: '/async-error' })

  const spans = exporter.getFinishedSpans()
  const handlerSpans = spans.filter(s => s.name === 'fastify.handler')

  t.assert.strictEqual(handlerSpans.length, 2, 'two handler spans should exist')
  t.assert.strictEqual(handlerSpans[0].status.code, SpanStatusCode.ERROR, 'sync error should be captured')
  t.assert.strictEqual(handlerSpans[1].status.code, SpanStatusCode.ERROR, 'async error should be captured')

  const bothHaveExceptions = handlerSpans.every(span => 
    span.events.some(e => e.name === 'exception')
  )
  t.assert.ok(bothHaveExceptions, 'both sync and async errors should have exception events')
})

test('Server span records error for handler exception resulting in 5xx', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Unhandled error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span should have ERROR status for unhandled exception')
})

test('Server span status UNSET for successful 2xx responses', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/success', async () => {
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/success' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status should be UNSET for successful responses')
})

test('Server span status UNSET for 3xx redirect responses', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/redirect', async (request, reply) => {
    reply.code(301).send()
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/redirect' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.UNSET, 'server span status should be UNSET for redirect responses')
})

test('Handler and server span both record errors appropriately', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Test error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'handler span should have ERROR status')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span should have ERROR status')
})

test('Error in onError hook is recorded on server span when hookSpans is enabled', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onError', async (request, reply, error) => {
  })

  fastify.get('/error', async () => {
    throw new Error('Handler error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/error' })

  const spans = exporter.getFinishedSpans()
  const hookSpan = spans.find(s => s.name === 'fastify.hook.onError')
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(hookSpan, 'onError hook span should exist when hookSpans is enabled')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'server span should have ERROR status')
})
