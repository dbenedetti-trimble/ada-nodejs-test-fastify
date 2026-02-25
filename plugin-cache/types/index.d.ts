import { FastifyPluginAsync } from 'fastify'

/**
 * Options for the response cache plugin
 */
export interface ResponseCachePluginOptions {
  /**
   * Maximum number of cached responses
   * @default 1000
   */
  maxItems?: number;

  /**
   * Default TTL (time-to-live) in milliseconds for cached responses
   * @default 60000
   */
  ttl?: number;

  /**
   * HTTP methods to cache
   * @default ['GET']
   */
  methods?: string[];

  /**
   * Global Vary headers to include in cache key derivation
   * @default []
   */
  vary?: string[];
}

/**
 * Route-level cache configuration
 */
export interface RouteCacheConfig {
  /**
   * Override default TTL for this route (milliseconds)
   */
  ttl?: number;

  /**
   * Additional Vary headers for this route (merged with global vary headers)
   */
  vary?: string[];
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Current number of cached items
   */
  items: number;

  /**
   * Maximum number of cached items (from plugin options)
   */
  maxItems: number;

  /**
   * Total number of cache hits
   */
  hits: number;

  /**
   * Total number of cache misses
   */
  misses: number;
}

/**
 * Cache decorator API for manual cache control
 */
export interface CacheDecorator {
  /**
   * Purge a specific cache entry by exact key
   * @param key - Cache key (format: method|url|vary_headers)
   * @returns true if entry existed and was removed, false otherwise
   */
  purge(key: string): boolean;

  /**
   * Purge all cache entries whose URL starts with the given prefix
   * @param prefix - URL prefix to match (e.g., '/users')
   * @returns number of entries removed
   */
  purgeByPrefix(prefix: string): number;

  /**
   * Clear all cache entries and reset stats counters
   */
  clear(): void;

  /**
   * Get current cache statistics
   * @returns Cache statistics object
   */
  stats(): CacheStats;
}

/**
 * Fastify Response Cache Plugin
 *
 * In-memory LRU cache for HTTP responses with ETag support, Cache-Control parsing,
 * and conditional request handling (304 Not Modified).
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import responseCachePlugin from '@fastify/response-cache';
 *
 * const fastify = Fastify();
 *
 * fastify.register(responseCachePlugin, {
 *   maxItems: 1000,
 *   ttl: 60000,
 *   methods: ['GET'],
 *   vary: []
 * });
 *
 * fastify.get('/users', {
 *   config: {
 *     cache: {
 *       ttl: 30000,
 *       vary: ['Accept']
 *     }
 *   }
 * }, async (request, reply) => {
 *   return { users: [] };
 * });
 *
 * // Manual cache control
 * fastify.cache.purge('GET|/users|');
 * fastify.cache.purgeByPrefix('/users');
 * fastify.cache.clear();
 * const stats = fastify.cache.stats();
 * ```
 */
declare const responseCachePlugin: FastifyPluginAsync<ResponseCachePluginOptions>

export default responseCachePlugin

/**
 * Augment Fastify type definitions to include cache decorator
 */
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Cache decorator for manual cache control
     */
    cache: CacheDecorator;
  }

  interface FastifyContextConfig {
    /**
     * Route-level cache configuration
     *
     * - Set to `true` to enable caching with default TTL
     * - Set to object to customize TTL and Vary headers
     * - Omit or set to falsy value to disable caching for this route
     */
    cache?: boolean | RouteCacheConfig;
  }
}
