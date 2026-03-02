import { FastifyPluginCallback } from 'fastify'

interface CacheRouteConfig {
  ttl?: number
  vary?: string[]
}

interface CacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

interface CacheDecorator {
  purge(key: string): boolean
  purgeByPrefix(urlPrefix: string): number
  clear(): void
  stats(): CacheStats
}

interface CachePluginOptions {
  maxItems?: number
  ttl?: number
  methods?: string[]
  vary?: string[]
}

declare const cachePlugin: FastifyPluginCallback<CachePluginOptions>

export default cachePlugin
export { CachePluginOptions, CacheRouteConfig, CacheStats, CacheDecorator }

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheDecorator
  }

  interface FastifyContextConfig {
    cache?: boolean | CacheRouteConfig
  }
}
