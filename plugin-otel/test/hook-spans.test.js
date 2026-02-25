'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const { NodeTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node')
const { trace, SpanKind } = require('@opentelemetry/api')
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

test('@covers_ACFR_4_1: With hookSpans: true, each hook phase that executes produces a child span', async (t) => {
  t.plan(8)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preValidation', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.addHook('onSend', async (request, reply, payload) => payload)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()

  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const onRequestSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  const preValidationSpan = spans.find(s => s.name === 'fastify.hook.preValidation')
  const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
  const onSendSpan = spans.find(s => s.name === 'fastify.hook.onSend')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.ok(onRequestSpan, 'onRequest hook span should exist')
  t.assert.ok(preValidationSpan, 'preValidation hook span should exist')
  t.assert.ok(preHandlerSpan, 'preHandler hook span should exist')
  t.assert.ok(onSendSpan, 'onSend hook span should exist')

  const onResponseSpan = spans.find(s => s.name === 'fastify.hook.onResponse')
  t.assert.ok(!onResponseSpan, 'onResponse should not have a hook span')

  t.assert.ok(spans.length >= 6, 'should have server, handler, and hook spans')
})

test('@covers_ACFR_4_2: Span names follow the fastify.hook.{hookName} convention', async (t) => {
  t.plan(7)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preParsing', async (request, reply, payload) => payload)
  fastify.addHook('preValidation', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.addHook('preSerialization', async (request, reply, payload) => payload)
  fastify.addHook('onSend', async (request, reply, payload) => payload)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.onRequest'), 'onRequest span name is correct')
  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.preParsing'), 'preParsing span name is correct')
  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.preValidation'), 'preValidation span name is correct')
  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.preHandler'), 'preHandler span name is correct')
  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.preSerialization'), 'preSerialization span name is correct')
  t.assert.ok(hookSpans.some(s => s.name === 'fastify.hook.onSend'), 'onSend span name is correct')
  t.assert.ok(!hookSpans.some(s => s.name === 'fastify.hook.onResponse'), 'onResponse should not have hook span')
})

test('@covers_ACFR_4_3: Hook spans are children of the server request span, siblings of the handler span', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preHandler', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()

  const serverSpan = spans.find(s => s.name === 'GET /test')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')

  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.ok(handlerSpan, 'handler span should exist')
  t.assert.ok(preHandlerSpan, 'preHandler hook span should exist')

  t.assert.strictEqual(
    preHandlerSpan.parentSpanContext.spanId,
    serverSpan.spanContext().spanId,
    'hook span should be child of server span (sibling of handler)'
  )
})

test('@covers_ACFR_4_4: With hookSpans: false, no hook spans are created', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: false })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preValidation', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.addHook('onSend', async (request, reply, payload) => payload)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans should be created')
  t.assert.ok(spans.find(s => s.name === 'GET /test'), 'server span should still exist')
  t.assert.ok(spans.find(s => s.name === 'fastify.handler'), 'handler span should still exist')
})

test('@covers_ACFR_4_4: With hookSpans undefined (default), no hook spans are created', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.addHook('preHandler', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.strictEqual(hookSpans.length, 0, 'no hook spans should be created by default')
  t.assert.ok(spans.find(s => s.name === 'GET /test'), 'server span should still exist')
  t.assert.ok(spans.find(s => s.name === 'fastify.handler'), 'handler span should still exist')
})

test('@covers_ACFR_4_5: Hook phases that have no registered hooks do not produce spans', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preHandler', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.strictEqual(hookSpans.length, 1, 'only preHandler hook span should exist')
  t.assert.ok(hookSpans[0].name === 'fastify.hook.preHandler', 'should be preHandler hook span')
  t.assert.ok(!spans.some(s => s.name === 'fastify.hook.preParsing'), 'no preParsing span without hooks')
})

test('@covers_ACFR_4_6: onError hook span is only created when an error actually occurs', async (t) => {
  t.plan(5)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onError', async (request, reply, error) => {})

  fastify.get('/success', async () => ({ ok: true }))
  fastify.get('/error', async () => {
    throw new Error('Test error')
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/success' })
  const successSpans = exporter.getFinishedSpans()
  const successErrorSpans = successSpans.filter(s => s.name === 'fastify.hook.onError')

  t.assert.strictEqual(successErrorSpans.length, 0, 'no onError span when no error occurs')

  exporter.reset()

  await fastify.inject({ method: 'GET', url: '/error' })
  const errorSpans = exporter.getFinishedSpans()
  const onErrorSpan = errorSpans.find(s => s.name === 'fastify.hook.onError')

  t.assert.ok(onErrorSpan, 'onError span should exist when error occurs')

  const serverSpan = errorSpans.find(s => s.name === 'GET /error')
  t.assert.ok(serverSpan, 'server span should exist')
  t.assert.strictEqual(onErrorSpan.parentSpanContext.spanId, serverSpan.spanContext().spanId, 'onError span should be child of server span')
  t.assert.strictEqual(onErrorSpan.kind, SpanKind.INTERNAL, 'onError span kind should be INTERNAL')
})

test('@covers_ACFR_4_7: onResponse does not get its own hook span (it\'s the end point of the server span)', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onResponse', async () => {})
  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const onResponseSpan = spans.find(s => s.name === 'fastify.hook.onResponse')

  t.assert.ok(!onResponseSpan, 'onResponse should not have its own hook span')
  t.assert.ok(spans.find(s => s.name === 'GET /test'), 'server span should still exist')
})

test('Hook span timing is accurate', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preHandler', async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')

  t.assert.ok(preHandlerSpan, 'preHandler span should exist')

  const duration = (preHandlerSpan.endTime[0] - preHandlerSpan.startTime[0]) * 1000 +
                   (preHandlerSpan.endTime[1] - preHandlerSpan.startTime[1]) / 1000000

  t.assert.ok(duration < 100, 'hook span should be quick (marker span, not timing all hooks)')
})

test('Hook spans work correctly with ignoreRoutes', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    hookSpans: true,
    ignoreRoutes: ['/health']
  })

  fastify.addHook('preHandler', async () => {})

  fastify.get('/test', async () => ({ ok: true }))
  fastify.get('/health', async () => ({ status: 'ok' }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/health' })
  let spans = exporter.getFinishedSpans()

  t.assert.strictEqual(spans.length, 0, 'no spans should be created for ignored routes')

  exporter.reset()

  await fastify.inject({ method: 'GET', url: '/test' })
  spans = exporter.getFinishedSpans()

  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))
  t.assert.ok(spans.length > 0, 'spans should be created for non-ignored routes')
  t.assert.ok(hookSpans.length > 0, 'hook spans should be created for non-ignored routes')
  t.assert.ok(spans.find(s => s.name === 'GET /test'), 'server span should exist for non-ignored routes')
})

test('Multiple hook phases create separate spans with correct ordering', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  const executionOrder = []

  fastify.addHook('onRequest', async () => {
    executionOrder.push('onRequest')
  })

  fastify.addHook('preValidation', async () => {
    executionOrder.push('preValidation')
  })

  fastify.addHook('preHandler', async () => {
    executionOrder.push('preHandler')
  })

  fastify.get('/test', async () => {
    executionOrder.push('handler')
    return { ok: true }
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    executionOrder.push('onSend')
    return payload
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()

  t.assert.deepStrictEqual(
    executionOrder,
    ['onRequest', 'preValidation', 'preHandler', 'handler', 'onSend'],
    'hooks should execute in correct order'
  )

  const onRequestSpan = spans.find(s => s.name === 'fastify.hook.onRequest')
  const preValidationSpan = spans.find(s => s.name === 'fastify.hook.preValidation')
  const preHandlerSpan = spans.find(s => s.name === 'fastify.hook.preHandler')
  const onSendSpan = spans.find(s => s.name === 'fastify.hook.onSend')
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(onRequestSpan && preValidationSpan && preHandlerSpan && onSendSpan && handlerSpan, 'all hook and handler spans should exist')

  const serverSpan = spans.find(s => s.name === 'GET /test')
  t.assert.ok(serverSpan, 'server span should exist')
})

test('Hook spans have correct span kind (INTERNAL)', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.addHook('onSend', async (request, reply, payload) => payload)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const hookSpans = spans.filter(s => s.name.startsWith('fastify.hook.'))

  t.assert.ok(hookSpans.length >= 3, 'should have at least 3 hook spans')

  hookSpans.forEach(span => {
    t.assert.strictEqual(span.kind, SpanKind.INTERNAL, `${span.name} should have INTERNAL span kind`)
  })
})

test('Hook spans work with preParsing hook', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preParsing', async (request, reply, payload) => payload)

  fastify.post('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { data: 'test' }
  })

  const spans = exporter.getFinishedSpans()
  const preParsingSpan = spans.find(s => s.name === 'fastify.hook.preParsing')

  t.assert.ok(preParsingSpan, 'preParsing span should exist')
  t.assert.strictEqual(preParsingSpan.kind, SpanKind.INTERNAL, 'preParsing span kind should be INTERNAL')
})

test('Hook spans work with preSerialization hook', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preSerialization', async (request, reply, payload) => payload)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const preSerializationSpan = spans.find(s => s.name === 'fastify.hook.preSerialization')

  t.assert.ok(preSerializationSpan, 'preSerialization span should exist')
  t.assert.strictEqual(preSerializationSpan.kind, SpanKind.INTERNAL, 'preSerialization span kind should be INTERNAL')
})
