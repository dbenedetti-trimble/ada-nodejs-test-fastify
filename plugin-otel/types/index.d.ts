import { FastifyPluginCallback } from 'fastify'
import { Tracer, Span, Context } from '@opentelemetry/api'

declare module 'fastify' {
  interface FastifyInstance {
    otel?: {
      tracer: Tracer;
    };
  }

  interface FastifyRequest {
    otelSpan?: Span;
    otelContext?: Context;
    otelHandlerSpan?: Span;
    otelServerError?: Error;
    otelInSerializationPhase?: boolean;
  }
}

export interface FastifyOtelOptions {
  exposeApi?: boolean;
  hookSpans?: boolean;
  ignoreRoutes?: Array<string | RegExp>;
  spanNameFormatter?: ((request: import('fastify').FastifyRequest) => string) | null;
}

declare const fastifyOtel: FastifyPluginCallback<FastifyOtelOptions>

export default fastifyOtel
export { fastifyOtel }
