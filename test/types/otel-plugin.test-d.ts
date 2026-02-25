import { expectType, expectAssignable } from 'tsd'
import fastify, { FastifyInstance, FastifyRequest } from '../../fastify'
import otelPlugin, { OtelPluginOptions } from '../../index'

const app: FastifyInstance = fastify()

// Test plugin registration with no options
expectAssignable<FastifyInstance>(app.register(otelPlugin))

// Test plugin registration with options
expectAssignable<FastifyInstance>(
  app.register(otelPlugin, {
    exposeApi: true,
    hookSpans: false,
    ignoreRoutes: ['/health', '/metrics'],
    spanNameFormatter: (request) => `${request.method} ${request.url}`
  })
)

// Test OtelPluginOptions type
expectAssignable<OtelPluginOptions>({
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: [],
  spanNameFormatter: (req) => req.method
})

expectAssignable<OtelPluginOptions>({})

// Test fastify.otel decorator
app.register(otelPlugin).after(() => {
  expectType<any>(app.otel.tracer)
  expectType<{ tracer: any }>(app.otel)
})

// Test request.otelSpan decorator
app.register(otelPlugin).get('/test', (request, reply) => {
  expectType<any>(request.otelSpan)

  if (request.otelSpan) {
    expectType<any>(request.otelSpan)
    request.otelSpan.setAttribute('custom.attribute', 'value')
    request.otelSpan.addEvent('custom event')
  }

  reply.send({ ok: true })
})

// Test with exposeApi: false (decorators still typed but may be undefined at runtime)
app.register(otelPlugin, { exposeApi: false }).get('/no-api', (request, reply) => {
  expectType<any>(request.otelSpan)
  reply.send({ ok: true })
})

// Test with hookSpans enabled
app.register(otelPlugin, { hookSpans: true }).get('/hooks', (request, reply) => {
  expectType<any>(request.otelSpan)
  reply.send({ ok: true })
})

// Test with ignoreRoutes
app.register(otelPlugin, { ignoreRoutes: ['/health'] }).get('/health', (request, reply) => {
  expectType<any>(request.otelSpan)
  reply.send({ ok: true })
})

// Test spanNameFormatter with proper typing
app.register(otelPlugin, {
  spanNameFormatter: (request: FastifyRequest) => {
    expectType<string>(request.method)
    expectType<string>(request.url)
    return `Custom: ${request.method} ${request.url}`
  }
})
