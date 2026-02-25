import { expectType, expectAssignable, expectError } from 'tsd'
import fastify, { FastifyInstance, FastifyRequest } from 'fastify'
import fastifyOtel, { FastifyOtelOptions } from '../types/index'
import { Tracer, Span, Context } from '@opentelemetry/api'

const app = fastify()

// Test plugin registration with no options
expectAssignable<FastifyInstance>(app.register(fastifyOtel))

// Test plugin registration with empty options
expectAssignable<FastifyInstance>(app.register(fastifyOtel, {}))

// Test plugin registration with all options
const options: FastifyOtelOptions = {
  exposeApi: true,
  hookSpans: true,
  ignoreRoutes: ['/health', /^\/metrics/],
  spanNameFormatter: (request) => `${request.method} ${request.url}`
}
expectAssignable<FastifyInstance>(app.register(fastifyOtel, options))

// Test plugin registration with partial options
expectAssignable<FastifyInstance>(app.register(fastifyOtel, { exposeApi: true }))
expectAssignable<FastifyInstance>(app.register(fastifyOtel, { hookSpans: false }))
expectAssignable<FastifyInstance>(app.register(fastifyOtel, { ignoreRoutes: ['/health'] }))

// Test invalid options
expectError(app.register(fastifyOtel, { exposeApi: 'true' }))
expectError(app.register(fastifyOtel, { hookSpans: 'false' }))
expectError(app.register(fastifyOtel, { ignoreRoutes: [123] }))

// Test FastifyInstance.otel decorator when exposeApi is enabled
app.register(fastifyOtel, { exposeApi: true })
app.ready(() => {
  if (app.otel) {
    expectType<Tracer>(app.otel.tracer)
  }
})

// Test FastifyRequest decorators
app.get('/test', async (request, reply) => {
  if (request.otelSpan) {
    expectType<Span>(request.otelSpan)
    request.otelSpan.setAttribute('test.key', 'value')
  }

  if (request.otelContext) {
    expectType<Context>(request.otelContext)
  }

  if (request.otelHandlerSpan) {
    expectType<Span>(request.otelHandlerSpan)
  }

  if (request.otelServerError) {
    expectType<Error>(request.otelServerError)
  }

  if (request.otelInSerializationPhase) {
    expectType<boolean>(request.otelInSerializationPhase)
  }

  reply.send({ ok: true })
})

// Test tracer API usage
app.register(fastifyOtel, { exposeApi: true })
app.get('/users/:id', async (request, reply) => {
  if (app.otel && request.otelSpan) {
    const tracer = app.otel.tracer
    expectType<Tracer>(tracer)

    const span = request.otelSpan
    expectType<Span>(span)
    span.setAttribute('user.id', request.params.id)

    const context = request.otelContext
    if (context) {
      expectType<Context>(context)
      const dbSpan = tracer.startSpan('db.query', { parent: span })
      expectType<Span>(dbSpan)
      dbSpan.end()
    }
  }

  reply.send({ userId: request.params.id })
})

// Test spanNameFormatter function signature
const customFormatter = (request: FastifyRequest): string => {
  expectType<string>(request.method)
  expectType<string>(request.url)
  return `${request.method} ${request.url}`
}

expectAssignable<FastifyInstance>(
  app.register(fastifyOtel, { spanNameFormatter: customFormatter })
)

// Test ignoreRoutes with strings
expectAssignable<FastifyInstance>(
  app.register(fastifyOtel, { ignoreRoutes: ['/health', '/metrics'] })
)

// Test ignoreRoutes with RegExp
expectAssignable<FastifyInstance>(
  app.register(fastifyOtel, { ignoreRoutes: [/^\/api\/internal/] })
)

// Test ignoreRoutes with mixed types
expectAssignable<FastifyInstance>(
  app.register(fastifyOtel, { ignoreRoutes: ['/health', /^\/metrics/] })
)
