// @covers_ACNFR_3_1 @covers_ACNFR_5_2 @typescript_test
import type { Span, Tracer } from '@opentelemetry/api'
import fastify from '../../fastify'
import { expectType } from 'tsd'

declare module '../../fastify' {
  interface FastifyInstance {
    otel: {
      tracer: Tracer;
    };
  }
  interface FastifyRequest {
    otelSpan?: Span;
  }
}

const app = fastify()

app.get('/', (request) => {
  expectType<{ tracer: Tracer }>(app.otel)
  expectType<Tracer>(app.otel.tracer)
  expectType<Span | undefined>(request.otelSpan)
})
