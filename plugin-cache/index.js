'use strict'

const fp = require('fastify-plugin')
const LRUCache = require('./lib/lru-cache')
const parseCacheControl = require('./lib/cache-control')
const { generateETag, matchesETag } = require('./lib/etag')

const kSkipStore = Symbol('kSkipStore')
const kBypassCache = Symbol('kBypassCache')

async function cachePlugin (fastify, opts) {
  const maxItems = opts.maxItems ?? 1000
  const defaultTtl = opts.ttl ?? 60000
  const methods = new Set((opts.methods ?? ['GET']).map(m => m.toUpperCase()))
  const globalVary = (opts.vary ?? []).map(h => h.toLowerCase())

  const lru = new LRUCache(maxItems)
  let hits = 0
  let misses = 0

  function buildCacheKey (request, varyHeaders) {
    // TODO: implement in features pass
    throw new Error('not implemented')
  }

  function purge (key) {
    // TODO: implement in features pass
    throw new Error('not implemented')
  }

  function purgeByPrefix (urlPrefix) {
    // TODO: implement in features pass
    throw new Error('not implemented')
  }

  function clear () {
    // TODO: implement in features pass
    throw new Error('not implemented')
  }

  function stats () {
    return {
      items: lru.size,
      maxItems,
      hits,
      misses
    }
  }

  fastify.decorate('cache', { purge, purgeByPrefix, clear, stats })

  async function onRequestHook (request, reply) {
    // TODO: implement in features pass
  }

  async function onSendHook (request, reply, payload) {
    // TODO: implement in features pass
    return payload
  }

  fastify.addHook('onRequest', onRequestHook)
  fastify.addHook('onSend', onSendHook)
}

module.exports = fp(cachePlugin, {
  fastify: '5.x',
  name: 'fastify-response-cache'
})
