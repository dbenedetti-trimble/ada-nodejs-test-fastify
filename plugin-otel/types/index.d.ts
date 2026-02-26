import type { Span, Tracer } from '@opentelemetry/api'
import type { FastifyPluginCallback } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    otel: {
      tracer: Tracer;
    };
  }
  interface FastifyRequest {
    otelSpan?: Span;
  }
}

export interface FastifyOtelOptions {
  exposeApi?: boolean;
  hookSpans?: boolean;
  ignoreRoutes?: string[];
  spanNameFormatter?: ((request: import('fastify').FastifyRequest) => string) | null;
}

declare const fastifyOtel: FastifyPluginCallback<FastifyOtelOptions>
export default fastifyOtel
export { fastifyOtel }
