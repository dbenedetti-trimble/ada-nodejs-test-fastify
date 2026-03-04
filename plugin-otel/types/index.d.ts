import { FastifyPluginCallback, FastifyRequest } from 'fastify'
import { Tracer, Span } from '@opentelemetry/api'

interface OtelPluginOptions {
  exposeApi?: boolean
  hookSpans?: boolean
  ignoreRoutes?: string[]
  spanNameFormatter?: (request: FastifyRequest) => string
}

interface OtelDecorator {
  tracer: Tracer
}

declare const otelPlugin: FastifyPluginCallback<OtelPluginOptions>

export default otelPlugin
export { OtelPluginOptions, OtelDecorator }

declare module 'fastify' {
  interface FastifyInstance {
    otel: OtelDecorator
  }
  interface FastifyRequest {
    otelSpan: Span | null | undefined
  }
}
