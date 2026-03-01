import fastify, { FastifyInstance } from 'fastify'
import { expectType, expectAssignable, expectError } from 'tsd'
import otelPlugin, { FastifyOtelOptions, otelPlugin as namedExport } from '../../types/index'
import type { Tracer, Span } from '@opentelemetry/api'

// Plugin can be registered with no options
expectAssignable<FastifyInstance>(fastify().register(otelPlugin))

// Plugin can be registered with valid options
expectAssignable<FastifyInstance>(fastify().register(otelPlugin, {
  exposeApi: true,
  hookSpans: false,
  ignoreRoutes: ['/health'],
  spanNameFormatter: (req) => `${req.method} ${req.url}`
}))

// Plugin can be registered with partial options
expectAssignable<FastifyInstance>(fastify().register(otelPlugin, { hookSpans: false }))
expectAssignable<FastifyInstance>(fastify().register(otelPlugin, { ignoreRoutes: [] }))

// Named export works the same as default export
expectAssignable<FastifyInstance>(fastify().register(namedExport))

// FastifyOtelOptions types are correct
expectAssignable<FastifyOtelOptions>({})
expectAssignable<FastifyOtelOptions>({ exposeApi: true })
expectAssignable<FastifyOtelOptions>({ hookSpans: false })
expectAssignable<FastifyOtelOptions>({ ignoreRoutes: ['/health', '/metrics'] })
expectAssignable<FastifyOtelOptions>({ spanNameFormatter: (req) => req.method })

// Invalid option types should produce errors
expectError<FastifyOtelOptions>({ exposeApi: 'yes' })
expectError<FastifyOtelOptions>({ hookSpans: 1 })
expectError<FastifyOtelOptions>({ ignoreRoutes: '/health' })

// fastify.otel.tracer is the correct type after registration
const app = fastify()
app.register(otelPlugin).after(() => {
  expectType<Tracer>(app.otel.tracer)
})

// request.otelSpan is Span | null in route handlers
app.get('/test', async (request) => {
  expectType<Span | null>(request.otelSpan)
})
