import type { FastifyPluginAsync } from 'fastify'

export interface FastifyResponseCacheOptions {
  /** Maximum number of cached responses. Default: 1000 */
  maxItems?: number
  /** Default TTL in milliseconds. Default: 60000 (1 minute) */
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

export interface FastifyCacheDecorator {
  /** Remove a specific cache entry by key. Returns true if it existed. */
  purge(key: string): boolean
  /** Remove all entries whose URL starts with the given prefix. Returns count removed. */
  purgeByPrefix(prefix: string): number
  /** Remove all entries and reset stats counters. */
  clear(): void
  /** Return current cache statistics. */
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: FastifyCacheDecorator
  }
}

declare const fastifyResponseCache: FastifyPluginAsync<FastifyResponseCacheOptions>
export default fastifyResponseCache
export { fastifyResponseCache }
