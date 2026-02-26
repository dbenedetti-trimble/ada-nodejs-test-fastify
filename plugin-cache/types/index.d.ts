import { FastifyPluginCallback } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    cache: FastifyCacheDecorator
  }

  interface RouteShorthandOptions {
    config?: {
      cache?: boolean | ResponseCacheRouteOptions
    }
  }
}

export interface ResponseCacheRouteOptions {
  ttl?: number
  vary?: string[]
}

export interface FastifyResponseCacheOptions {
  maxItems?: number
  ttl?: number
  methods?: string[]
  vary?: string[]
}

export interface ResponseCacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

export interface FastifyCacheDecorator {
  purge(key: string): boolean
  purgeByPrefix(prefix: string): void
  clear(): void
  stats(): ResponseCacheStats
}

declare const fastifyResponseCache: FastifyPluginCallback<FastifyResponseCacheOptions>

export default fastifyResponseCache
export { fastifyResponseCache }
