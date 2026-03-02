import { FastifyPluginCallback } from 'fastify'
import { Tracer, Span } from '@opentelemetry/api'

declare module 'fastify' {
  interface FastifyInstance {
    otel: {
      tracer: Tracer
    }
  }

  interface FastifyRequest {
    otelSpan: Span | null
  }
}

export interface FastifyOtelOptions {
  exposeApi?: boolean
  hookSpans?: boolean
  ignoreRoutes?: string[]
  spanNameFormatter?: ((request: import('fastify').FastifyRequest) => string) | null
}

declare const fastifyOtel: FastifyPluginCallback<FastifyOtelOptions>

export default fastifyOtel
export { fastifyOtel }
