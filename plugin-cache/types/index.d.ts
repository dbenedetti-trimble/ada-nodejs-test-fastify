import { FastifyPluginCallback } from 'fastify'

export interface FastifyResponseCacheOptions {
  maxItems?: number
  ttl?: number
  methods?: string[]
  vary?: string[]
}

export interface CacheStats {
  items: number
  maxItems: number
  hits: number
  misses: number
}

export interface FastifyResponseCacheDecorator {
  purge(key: string): boolean
  purgeByPrefix(urlPrefix: string): number
  clear(): void
  stats(): CacheStats
}

declare module 'fastify' {
  interface FastifyInstance {
    cache: FastifyResponseCacheDecorator
  }
}

declare const fastifyResponseCache: FastifyPluginCallback<FastifyResponseCacheOptions>
export default fastifyResponseCache
export { fastifyResponseCache }
