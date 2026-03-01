import { FastifyPluginCallback, FastifyRequest, FastifyInstance } from 'fastify'
import { Tracer, Span } from '@opentelemetry/api'

export interface FastifyOtelOptions {
  /**
   * Register `fastify.otel` decorator and `request.otelSpan` decorator.
   * @default true
   */
  exposeApi?: boolean

  /**
   * Create child spans for each lifecycle hook phase.
   * @default true
   */
  hookSpans?: boolean

  /**
   * Route URL patterns to exclude from instrumentation.
   * @default []
   */
  ignoreRoutes?: string[]

  /**
   * Override default span naming logic.
   * Receives the Fastify request and returns the span name string.
   */
  spanNameFormatter?: (request: FastifyRequest) => string
}

declare module 'fastify' {
  interface FastifyInstance {
    /** OTel Tracer and plugin API. Available when exposeApi is true and OTel is installed. */
    otel: {
      tracer: Tracer
    }
  }

  interface FastifyRequest {
    /**
     * The active server span for this request.
     * Undefined when the route is in ignoreRoutes or OTel is not installed.
     */
    otelSpan: Span | undefined
  }
}

declare const fastifyOtel: FastifyPluginCallback<FastifyOtelOptions>

export default fastifyOtel
export { fastifyOtel }
