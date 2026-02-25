/// <reference types="node" />

import { FastifyPluginCallback } from './types/plugin'
import { FastifyRequest } from './types/request'

declare module './fastify' {
  interface FastifyInstance {
    otel: {
      tracer: any
    }
  }

  interface FastifyRequest {
    otelSpan: any
  }
}

export interface OtelPluginOptions {
  /**
   * Expose the OTel API via fastify.otel and request.otelSpan decorators.
   * @default true
   */
  exposeApi?: boolean

  /**
   * Enable automatic span creation for lifecycle hook phases.
   * @default false
   */
  hookSpans?: boolean

  /**
   * Array of route URLs to exclude from instrumentation.
   * Routes matching these patterns will not create spans.
   * @default []
   */
  ignoreRoutes?: string[]

  /**
   * Custom function to format span names.
   * @param request - The Fastify request object
   * @returns The formatted span name
   */
  spanNameFormatter?: (request: FastifyRequest) => string
}

declare const otelPlugin: FastifyPluginCallback<OtelPluginOptions>

export default otelPlugin
export { otelPlugin }
