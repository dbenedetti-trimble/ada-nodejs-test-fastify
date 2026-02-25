/// <reference types="node" />

import { FastifyPluginCallback } from 'fastify'

declare namespace fastifyResponseCache {
  export interface CacheOptions {
    /**
     * Maximum number of cached entries (default: 1000)
     */
    maxItems?: number

    /**
     * Default TTL in milliseconds (default: 60000 / 1 minute)
     */
    ttl?: number

    /**
     * HTTP methods to cache (default: ['GET'])
     */
    methods?: string[]

    /**
     * Global Vary headers to include in cache key (default: [])
     */
    vary?: string[]
  }

  export interface RouteCacheConfig {
    /**
     * Enable caching for this route with default settings
     */
    cache?: boolean | RouteCacheOptions
  }

  export interface RouteCacheOptions {
    /**
     * Override default TTL for this route (milliseconds)
     */
    ttl?: number

    /**
     * Additional Vary headers for this route
     */
    vary?: string[]
  }

  export interface CacheStats {
    /**
     * Current number of cached entries
     */
    items: number

    /**
     * Maximum number of entries allowed
     */
    maxItems: number

    /**
     * Total number of cache hits
     */
    hits: number

    /**
     * Total number of cache misses
     */
    misses: number
  }

  export interface CacheDecorator {
    /**
     * Remove a specific cache entry by key
     * @param key - The cache key to remove
     * @returns true if the entry existed and was removed, false otherwise
     */
    purge(key: string): boolean

    /**
     * Remove all cache entries whose URL starts with the given prefix
     * @param prefix - The URL prefix to match
     * @returns The number of entries removed
     */
    purgeByPrefix(prefix: string): number

    /**
     * Remove all cache entries and reset stats counters
     */
    clear(): void

    /**
     * Get current cache statistics
     * @returns Cache statistics object
     */
    stats(): CacheStats
  }

  export const fastifyResponseCache: FastifyPluginCallback<CacheOptions>
  export { fastifyResponseCache as default }
}

declare function fastifyResponseCache (
  ...params: Parameters<FastifyPluginCallback<fastifyResponseCache.CacheOptions>>
): ReturnType<FastifyPluginCallback<fastifyResponseCache.CacheOptions>>

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Cache management decorator
     */
    cache: fastifyResponseCache.CacheDecorator
  }

  interface FastifyContextConfig {
    /**
     * Cache configuration for the route
     */
    cache?: boolean | fastifyResponseCache.RouteCacheOptions
  }
}

export = fastifyResponseCache
