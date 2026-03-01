import { expectType, expectAssignable } from 'tsd'
import fastify, { FastifyInstance } from 'fastify'
import otelPlugin from '../../types/index'
import type { Tracer, Span } from '@opentelemetry/api'

const app = fastify()
expectAssignable<FastifyInstance>(app.register(otelPlugin, { hookSpans: false }))

app.register(otelPlugin).after(() => {
  expectType<Tracer>(app.otel.tracer)
})

app.get('/test', async (request) => {
  expectType<Span | null>(request.otelSpan)
})
