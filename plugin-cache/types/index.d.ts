import { FastifyPluginCallback } from 'fastify'

export interface CachePluginOptions {
  /** Maximum number of cached responses. Default: 1000 */
  maxItems?: number
  /** Default TTL in milliseconds. Default: 60000 (1 minute) */
  ttl?: number
  /** HTTP methods to cache. Default: ['GET'] */
  methods?: string[]
  /** Global Vary headers to include in the cache key. Default: [] */
  vary?: string[]
}

export interface CacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

export interface CacheDecorator {
  /** Remove one entry by exact cache key. Returns true if the entry existed. */
  purge(key: string): boolean
  /** Remove all entries whose URL starts with the given prefix. Returns the number removed. */
  purgeByPrefix(urlPrefix: string): number
  /** Remove all entries and reset hit/miss counters. */
  clear(): void
  /** Return current cache statistics. */
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheDecorator
  }

  interface FastifyContextConfig {
    cache?: boolean | { ttl?: number; vary?: string[] }
  }
}

declare const cachePlugin: FastifyPluginCallback<CachePluginOptions>
export = cachePlugin
