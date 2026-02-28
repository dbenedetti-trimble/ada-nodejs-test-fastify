import { FastifyPluginCallback } from 'fastify'

export interface FastifyResponseCacheOptions {
  /** Maximum number of cached responses. Default: 1000 */
  maxItems?: number
  /** Default TTL in milliseconds. Default: 60000 */
  ttl?: number
  /** HTTP methods to cache. Default: ['GET'] */
  methods?: string[]
  /** Global Vary headers to include in cache key. Default: [] */
  vary?: string[]
}

export interface CacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

export interface FastifyResponseCacheDecorator {
  /** Remove a specific cache entry by its key. Returns true if the entry existed. */
  purge(key: string): boolean
  /** Remove all entries whose URL segment starts with the given prefix. Returns count removed. */
  purgeByPrefix(urlPrefix: string): number
  /** Remove all cache entries and reset hit/miss counters. */
  clear(): void
  /** Return current cache statistics. */
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: FastifyResponseCacheDecorator
  }

  interface FastifyContextConfig {
    cache?: boolean | {
      ttl?: number
      vary?: string[]
    }
  }
}

declare const fastifyResponseCache: FastifyPluginCallback<FastifyResponseCacheOptions>
export default fastifyResponseCache
export { fastifyResponseCache }
