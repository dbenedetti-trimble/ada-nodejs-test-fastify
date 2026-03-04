import { FastifyPluginCallback } from 'fastify'

interface CachePluginOptions {
  maxItems?: number
  ttl?: number
  methods?: string[]
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

interface RouteCacheOptions {
  ttl?: number
  vary?: string[]
}

declare const cachePlugin: FastifyPluginCallback<CachePluginOptions>

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheDecorator
  }

  interface FastifyContextConfig {
    cache?: boolean | RouteCacheOptions
  }
}

export default cachePlugin
export { CachePluginOptions, CacheStats, CacheDecorator, RouteCacheOptions }
