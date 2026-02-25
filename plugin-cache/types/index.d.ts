import { FastifyPluginAsync } from 'fastify'

export interface CachePluginOptions {
  /** Maximum number of cached responses. Default: 1000 */
  maxItems?: number
  /** Default TTL in milliseconds. Default: 60000 (1 minute) */
  ttl?: number
  /** HTTP methods to cache. Default: ['GET'] */
  methods?: string[]
  /** Global Vary headers to include in cache key derivation. Default: [] */
  vary?: string[]
}

export interface CacheRouteLevelConfig {
  /** Override default TTL for this route (in milliseconds) */
  ttl?: number
  /** Additional Vary headers for this route */
  vary?: string[]
}

export interface CacheStats {
  /** Current number of items in the cache */
  items: number
  /** Maximum number of items allowed */
  maxItems: number
  /** Total cache hits since start or last clear() */
  hits: number
  /** Total cache misses since start or last clear() */
  misses: number
}

export interface CacheDecorator {
  /** Purge a specific cache entry by its exact key. Returns true if the entry existed. */
  purge(key: string): boolean
  /** Purge all cache entries whose URL starts with the given prefix. Returns the number of entries removed. */
  purgeByPrefix(prefix: string): number
  /** Purge all cache entries and reset stats. */
  clear(): void
  /** Get current cache statistics. */
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: CacheDecorator
  }

  interface FastifyContextConfig {
    cache?: boolean | CacheRouteLevelConfig
  }
}

declare const cachePlugin: FastifyPluginAsync<CachePluginOptions>
export default cachePlugin
