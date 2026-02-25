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

test('@integration: Complete request lifecycle creates expected span hierarchy', async (t) => {
  t.plan(5)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('preHandler', async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
  })

  fastify.get('/users/:id', async (request) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return { userId: request.params.id, name: 'Test User' }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/users/42' })

  t.assert.strictEqual(response.statusCode, 200, 'Request should succeed')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const hookSpan = spans.find(s => s.name === 'fastify.hook.preHandler')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(handlerSpan, 'Handler span should exist')
  t.assert.ok(hookSpan, 'Hook span should exist')
  t.assert.strictEqual(serverSpan.name, 'GET /users/:id', 'Server span should use route pattern')
})

test('@integration: Error handling creates proper span status and events', async (t) => {
  t.plan(6)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/error', async () => {
    throw new Error('Test error')
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/error' })

  t.assert.strictEqual(response.statusCode, 500, 'Request should return 500')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(handlerSpan, 'Handler span should exist')
  t.assert.strictEqual(serverSpan.status.code, SpanStatusCode.ERROR, 'Server span should have ERROR status')
  t.assert.strictEqual(handlerSpan.status.code, SpanStatusCode.ERROR, 'Handler span should have ERROR status')
  t.assert.ok(handlerSpan.events.some(e => e.name === 'exception'), 'Handler span should have exception event')
})

test('@integration: Multiple requests create independent traces', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })
  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 3, 'Three server spans should exist')

  const traceIds = serverSpans.map(s => s.spanContext().traceId)
  const uniqueTraceIds = new Set(traceIds)

  t.assert.strictEqual(uniqueTraceIds.size, 3, 'Each request should have unique trace ID')
  t.assert.ok(serverSpans.every(s => s.name === 'GET /test'), 'All spans should have correct name')
  t.assert.ok(spans.filter(s => s.name === 'fastify.handler').length === 3, 'Three handler spans should exist')
})

test('@integration: Distributed tracing with incoming traceparent', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/service', async (request) => {
    const dbSpan = fastify.otel.tracer.startSpan('db.query', {}, request.otelContext)
    dbSpan.setAttribute('db.system', 'postgresql')
    await new Promise(resolve => setTimeout(resolve, 5))
    dbSpan.end()
    return { data: 'result' }
  })

  t.after(() => { fastify.close() })

  const traceId = '0af7651916cd43dd8448eb211c80319c'
  const parentSpanId = 'b7ad6b7169203331'
  const traceparent = `00-${traceId}-${parentSpanId}-01`

  await fastify.inject({
    method: 'GET',
    url: '/service',
    headers: { traceparent }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const dbSpan = spans.find(s => s.name === 'db.query')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(dbSpan, 'DB span should exist')
  t.assert.strictEqual(serverSpan.spanContext().traceId, traceId, 'Server span should preserve trace ID')
  t.assert.strictEqual(dbSpan.spanContext().traceId, traceId, 'DB span should inherit trace ID')
})

test('@integration: ignoreRoutes excludes all instrumentation', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, {
    hookSpans: true,
    ignoreRoutes: ['/health', /^\/metrics/]
  })

  fastify.addHook('preHandler', async () => {})

  fastify.get('/api/users', async () => ({ users: [] }))
  fastify.get('/health', async () => ({ status: 'ok' }))
  fastify.get('/metrics/stats', async () => ({ metrics: [] }))

  t.after(() => { fastify.close() })

  const r1 = await fastify.inject({ method: 'GET', url: '/health' })
  const r2 = await fastify.inject({ method: 'GET', url: '/metrics/stats' })
  const r3 = await fastify.inject({ method: 'GET', url: '/api/users' })

  t.assert.strictEqual(r1.statusCode, 200, '/health should work')
  t.assert.strictEqual(r2.statusCode, 200, '/metrics/stats should work')
  t.assert.strictEqual(r3.statusCode, 200, '/api/users should work')

  const spans = exporter.getFinishedSpans()
  t.assert.ok(spans.every(s => !s.name.includes('/health') && !s.name.includes('/metrics')), 'Ignored routes should not create spans')
})

test('@integration: Custom span attributes and child spans', async (t) => {
  t.plan(6)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  fastify.get('/orders/:orderId', async (request) => {
    request.otelSpan.setAttribute('order.id', request.params.orderId)
    request.otelSpan.setAttribute('order.priority', 'high')

    const dbSpan = fastify.otel.tracer.startSpan('db.query', {}, request.otelContext)
    dbSpan.setAttribute('db.statement', 'SELECT * FROM orders WHERE id = ?')
    await new Promise(resolve => setTimeout(resolve, 5))
    dbSpan.end()

    const cacheSpan = fastify.otel.tracer.startSpan('cache.get', {}, request.otelContext)
    cacheSpan.setAttribute('cache.key', `order:${request.params.orderId}`)
    await new Promise(resolve => setTimeout(resolve, 3))
    cacheSpan.end()

    return { orderId: request.params.orderId }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/orders/12345' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const dbSpan = spans.find(s => s.name === 'db.query')
  const cacheSpan = spans.find(s => s.name === 'cache.get')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(dbSpan, 'DB span should exist')
  t.assert.ok(cacheSpan, 'Cache span should exist')
  t.assert.strictEqual(serverSpan.attributes['order.id'], '12345', 'Custom attribute should be set')
  t.assert.strictEqual(dbSpan.attributes['db.statement'], 'SELECT * FROM orders WHERE id = ?', 'DB span should have statement')
  t.assert.strictEqual(cacheSpan.attributes['cache.key'], 'order:12345', 'Cache span should have key')
})

test('@integration: HTTP semantic conventions coverage', async (t) => {
  t.plan(12)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.post('/api/resources/:id', async (request) => {
    return { id: request.params.id, created: true }
  })

  t.after(() => { fastify.close() })

  const response = await fastify.inject({
    method: 'POST',
    url: '/api/resources/42?filter=active&sort=desc',
    headers: {
      'user-agent': 'integration-test/1.0'
    },
    payload: { data: 'test' }
  })

  t.assert.strictEqual(response.statusCode, 200, 'Response status should be 200')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const attrs = serverSpan.attributes

  t.assert.strictEqual(attrs['http.request.method'], 'POST', 'HTTP method')
  t.assert.strictEqual(attrs['url.path'], '/api/resources/42', 'URL path')
  t.assert.strictEqual(attrs['url.query'], 'filter=active&sort=desc', 'Query string')
  t.assert.strictEqual(attrs['url.scheme'], 'http', 'URL scheme')
  t.assert.strictEqual(attrs['server.address'], 'localhost', 'Server address')
  t.assert.ok(attrs['server.port'], 'Server port')
  t.assert.strictEqual(attrs['network.protocol.version'], '1.1', 'HTTP version')
  t.assert.strictEqual(attrs['user_agent.original'], 'integration-test/1.0', 'User agent')
  t.assert.strictEqual(attrs['http.response.status_code'], 200, 'Response status')
  t.assert.strictEqual(attrs['http.route'], '/api/resources/:id', 'HTTP route')
  t.assert.strictEqual(typeof attrs['server.port'], 'number', 'Server port type')
})

test('@integration: Hook spans with all lifecycle phases', async (t) => {
  t.plan(8)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { hookSpans: true })

  fastify.addHook('onRequest', async () => {})
  fastify.addHook('preParsing', async (request, reply, payload) => payload)
  fastify.addHook('preValidation', async () => {})
  fastify.addHook('preHandler', async () => {})
  fastify.addHook('preSerialization', async (request, reply, payload) => payload)
  fastify.addHook('onSend', async (request, reply, payload) => payload)

  fastify.post('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { data: 'test' }
  })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(handlerSpan, 'Handler span should exist')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.onRequest'), 'onRequest hook span')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.preParsing'), 'preParsing hook span')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.preValidation'), 'preValidation hook span')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.preHandler'), 'preHandler hook span')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.preSerialization'), 'preSerialization hook span')
  t.assert.ok(spans.some(s => s.name === 'fastify.hook.onSend'), 'onSend hook span')
})

test('@integration: Complex nested async operations', async (t) => {
  t.plan(7)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin, { exposeApi: true })

  async function fetchUser (tracer, ctx, userId) {
    const span = tracer.startSpan('service.fetchUser', {}, ctx)
    span.setAttribute('user.id', userId)
    await new Promise(resolve => setTimeout(resolve, 5))
    span.end()
  }

  async function fetchOrders (tracer, ctx, userId) {
    const span = tracer.startSpan('service.fetchOrders', {}, ctx)
    span.setAttribute('user.id', userId)
    await new Promise(resolve => setTimeout(resolve, 5))
    span.end()
  }

  fastify.get('/user-dashboard/:userId', async (request) => {
    await fetchUser(fastify.otel.tracer, request.otelContext, request.params.userId)
    await fetchOrders(fastify.otel.tracer, request.otelContext, request.params.userId)
    return { dashboard: 'data' }
  })

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/user-dashboard/999' })

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)
  const handlerSpan = spans.find(s => s.name === 'fastify.handler')
  const userSpan = spans.find(s => s.name === 'service.fetchUser')
  const ordersSpan = spans.find(s => s.name === 'service.fetchOrders')

  t.assert.ok(serverSpan, 'Server span should exist')
  t.assert.ok(handlerSpan, 'Handler span should exist')
  t.assert.ok(userSpan, 'User fetch span should exist')
  t.assert.ok(ordersSpan, 'Orders fetch span should exist')

  const traceId = serverSpan.spanContext().traceId
  t.assert.strictEqual(userSpan.spanContext().traceId, traceId, 'User span should share trace ID')
  t.assert.strictEqual(ordersSpan.spanContext().traceId, traceId, 'Orders span should share trace ID')
  t.assert.strictEqual(spans.length, 4, 'Four spans total')
})

test('@integration: 404 handling and unmatched routes', async (t) => {
  t.plan(4)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/exists', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  const response = await fastify.inject({ method: 'GET', url: '/does-not-exist' })

  t.assert.strictEqual(response.statusCode, 404, 'Should return 404')

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  t.assert.ok(serverSpan, 'Server span should exist for 404')
  t.assert.strictEqual(serverSpan.attributes['http.route'], 'unmatched', 'Route should be marked unmatched')
  t.assert.strictEqual(serverSpan.name, 'GET', 'Span name should be just the method')
})

test('@integration: Multiple routes with different methods', async (t) => {
  t.plan(6)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/resources', async () => ({ resources: [] }))
  fastify.post('/resources', async () => ({ created: true }))
  fastify.put('/resources/:id', async () => ({ updated: true }))
  fastify.delete('/resources/:id', async () => ({ deleted: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/resources' })
  await fastify.inject({ method: 'POST', url: '/resources', payload: {} })
  await fastify.inject({ method: 'PUT', url: '/resources/1', payload: {} })
  await fastify.inject({ method: 'DELETE', url: '/resources/1' })

  const spans = exporter.getFinishedSpans()
  const serverSpans = spans.filter(s => s.kind === SpanKind.SERVER)

  t.assert.strictEqual(serverSpans.length, 4, 'Four server spans should exist')
  t.assert.ok(serverSpans.some(s => s.name === 'GET /resources'), 'GET span')
  t.assert.ok(serverSpans.some(s => s.name === 'POST /resources'), 'POST span')
  t.assert.ok(serverSpans.some(s => s.name === 'PUT /resources/:id'), 'PUT span')
  t.assert.ok(serverSpans.some(s => s.name === 'DELETE /resources/:id'), 'DELETE span')
  t.assert.strictEqual(spans.filter(s => s.name === 'fastify.handler').length, 4, 'Four handler spans')
})

test('@integration: Plugin works without exposeApi option', async (t) => {
  t.plan(3)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  fastify.get('/test', async () => ({ ok: true }))

  t.after(() => { fastify.close() })

  await fastify.inject({ method: 'GET', url: '/test' })

  const spans = exporter.getFinishedSpans()
  
  t.assert.ok(spans.length > 0, 'Spans should be created')
  t.assert.ok(spans.some(s => s.kind === SpanKind.SERVER), 'Server span should exist')
  t.assert.strictEqual(fastify.otel, undefined, 'otel decorator should not exist without exposeApi')
})

test('@integration: Span timing accuracy', async (t) => {
  t.plan(2)

  const { exporter } = setupTracing()
  const fastify = Fastify({ logger: false })

  await fastify.register(otelPlugin)

  const handlerDelay = 50

  fastify.get('/test', async () => {
    await new Promise(resolve => setTimeout(resolve, handlerDelay))
    return { ok: true }
  })

  t.after(() => { fastify.close() })

  const startTime = Date.now()
  await fastify.inject({ method: 'GET', url: '/test' })
  const endTime = Date.now()

  const spans = exporter.getFinishedSpans()
  const serverSpan = spans.find(s => s.kind === SpanKind.SERVER)

  const spanDuration = (serverSpan.endTime[0] - serverSpan.startTime[0]) * 1000 +
                       (serverSpan.endTime[1] - serverSpan.startTime[1]) / 1000000

  const requestDuration = endTime - startTime

  t.assert.ok(spanDuration >= handlerDelay, 'Span duration should cover at least handler time')
  t.assert.ok(Math.abs(spanDuration - requestDuration) < 50, 'Span duration should approximate request duration')
})
