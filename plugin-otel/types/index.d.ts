import { FastifyPluginCallback, FastifyRequest } from 'fastify'
import type { Tracer, Span } from '@opentelemetry/api'

export interface FastifyOtelOptions {
  /** Register fastify.otel and request.otelSpan decorators. Default: true */
  exposeApi?: boolean
  /** Create child spans per lifecycle hook phase. Default: true */
  hookSpans?: boolean
  /** Route URL patterns to exclude from instrumentation. Default: [] */
  ignoreRoutes?: string[]
  /** Override default span name. Receives FastifyRequest; returns string. Default: null */
  spanNameFormatter?: (request: FastifyRequest) => string
}

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

declare const otelPlugin: FastifyPluginCallback<FastifyOtelOptions>
export default otelPlugin
export { otelPlugin }
