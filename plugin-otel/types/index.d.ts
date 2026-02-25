import { FastifyPluginCallback, FastifyRequest } from 'fastify'

interface OtelPluginOptions {
  exposeApi?: boolean
  hookSpans?: boolean
  ignoreRoutes?: string[]
  spanNameFormatter?: (request: FastifyRequest) => string
}

interface FastifyOtel {
  tracer: import('@opentelemetry/api').Tracer
}

declare const otelPlugin: FastifyPluginCallback<OtelPluginOptions>

export default otelPlugin
export { otelPlugin, OtelPluginOptions, FastifyOtel }

declare module 'fastify' {
  interface FastifyInstance {
    otel: FastifyOtel
  }
  interface FastifyRequest {
    otelSpan: import('@opentelemetry/api').Span | null
  }
}
