import type { FastifyPluginCallback, FastifyRequest } from 'fastify'
import type { Tracer, Span } from '@opentelemetry/api'

export interface FastifyOtelOptions {
  exposeApi?: boolean
  hookSpans?: boolean
  ignoreRoutes?: string[]
  spanNameFormatter?: (request: FastifyRequest) => string
}

declare module 'fastify' {
  interface FastifyInstance {
    otel: { tracer: Tracer }
  }
  interface FastifyRequest {
    otelSpan: Span | null
  }
}

declare const otelPlugin: FastifyPluginCallback<FastifyOtelOptions>
export default otelPlugin
export { otelPlugin }
