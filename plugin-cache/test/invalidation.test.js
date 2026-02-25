'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_8_1 - purge(key) removes the exact entry and returns true if it existed, false otherwise', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const response1 = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(response1.headers['x-cache'], 'MISS')

  const response2 = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(response2.headers['x-cache'], 'HIT')

  const cacheKey = 'GET|/test|'
  const purgeResult = fastify.cache.purge(cacheKey)
  t.assert.strictEqual(purgeResult, true, 'purge returns true when entry exists')

  const purgeResult2 = fastify.cache.purge(cacheKey)
  t.assert.strictEqual(purgeResult2, false, 'purge returns false when entry does not exist')

  const response3 = await fastify.inject({ url: '/test' })
  t.assert.strictEqual(response3.headers['x-cache'], 'MISS', 'Cache miss after purge')

  await fastify.close()
})

test('@covers_ACFR_8_2 - purgeByPrefix(prefix) removes all entries whose URL starts with the given prefix', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { data: 'all users' }
  })

  fastify.get('/users/123', { config: { cache: true } }, async () => {
    return { data: 'user 123' }
  })

  fastify.get('/posts', { config: { cache: true } }, async () => {
    return { data: 'all posts' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/users' })
  await fastify.inject({ url: '/users/123' })
  await fastify.inject({ url: '/posts' })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.items, 3, '3 entries cached')

  const response1 = await fastify.inject({ url: '/users' })
  t.assert.strictEqual(response1.headers['x-cache'], 'HIT', '/users is cached')

  const response2 = await fastify.inject({ url: '/users/123' })
  t.assert.strictEqual(response2.headers['x-cache'], 'HIT', '/users/123 is cached')

  const response3 = await fastify.inject({ url: '/posts' })
  t.assert.strictEqual(response3.headers['x-cache'], 'HIT', '/posts is cached')

  const purgeCount = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(purgeCount, 2, 'purgeByPrefix returns count of purged entries')

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 1, 'Only 1 entry remains after purge')

  const response4 = await fastify.inject({ url: '/users' })
  t.assert.strictEqual(response4.headers['x-cache'], 'MISS', '/users is purged')

  const response5 = await fastify.inject({ url: '/users/123' })
  t.assert.strictEqual(response5.headers['x-cache'], 'MISS', '/users/123 is purged')

  const response6 = await fastify.inject({ url: '/posts' })
  t.assert.strictEqual(response6.headers['x-cache'], 'HIT', '/posts is still cached')

  await fastify.close()
})

test('@covers_ACFR_8_3 - clear() removes all entries and resets stats counters', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/test1', { config: { cache: true } }, async () => {
    return { data: 'test1' }
  })

  fastify.get('/test2', { config: { cache: true } }, async () => {
    return { data: 'test2' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/test1' })
  await fastify.inject({ url: '/test2' })
  await fastify.inject({ url: '/test1' })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.items, 2, '2 entries cached')
  t.assert.strictEqual(stats1.hits, 1, '1 cache hit')
  t.assert.strictEqual(stats1.misses, 2, '2 cache misses')

  fastify.cache.clear()

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 0, 'All entries cleared')
  t.assert.strictEqual(stats2.hits, 0, 'Hit counter reset to 0')
  t.assert.strictEqual(stats2.misses, 0, 'Miss counter reset to 0')

  const response = await fastify.inject({ url: '/test1' })
  t.assert.strictEqual(response.headers['x-cache'], 'MISS', 'Cache miss after clear')

  await fastify.close()
})

test('@covers_ACFR_8_4 - stats() returns current item count, max items, total hits, and total misses', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { maxItems: 500 })

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.items, 0, 'Initial items is 0')
  t.assert.strictEqual(stats1.maxItems, 500, 'maxItems is 500')
  t.assert.strictEqual(stats1.hits, 0, 'Initial hits is 0')
  t.assert.strictEqual(stats1.misses, 0, 'Initial misses is 0')

  await fastify.inject({ url: '/test' })

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 1, '1 entry cached')
  t.assert.strictEqual(stats2.maxItems, 500, 'maxItems still 500')
  t.assert.strictEqual(stats2.hits, 0, 'No hits yet')
  t.assert.strictEqual(stats2.misses, 1, '1 miss')

  await fastify.inject({ url: '/test' })

  const stats3 = fastify.cache.stats()
  t.assert.strictEqual(stats3.items, 1, 'Still 1 entry')
  t.assert.strictEqual(stats3.maxItems, 500, 'maxItems still 500')
  t.assert.strictEqual(stats3.hits, 1, '1 hit')
  t.assert.strictEqual(stats3.misses, 1, 'Still 1 miss')

  await fastify.inject({ url: '/test' })
  await fastify.inject({ url: '/test' })

  const stats4 = fastify.cache.stats()
  t.assert.strictEqual(stats4.items, 1, 'Still 1 entry')
  t.assert.strictEqual(stats4.hits, 3, '3 hits total')
  t.assert.strictEqual(stats4.misses, 1, 'Still 1 miss')

  await fastify.close()
})

test('@covers_ACFR_8_5 - Hit/miss counters increment correctly as requests are served', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/route1', { config: { cache: true } }, async () => {
    return { data: 'route1' }
  })

  fastify.get('/route2', { config: { cache: true } }, async () => {
    return { data: 'route2' }
  })

  await fastify.listen({ port: 0 })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.hits, 0)
  t.assert.strictEqual(stats1.misses, 0)

  await fastify.inject({ url: '/route1' })
  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.hits, 0, 'No hits after first request')
  t.assert.strictEqual(stats2.misses, 1, '1 miss after first request')

  await fastify.inject({ url: '/route1' })
  const stats3 = fastify.cache.stats()
  t.assert.strictEqual(stats3.hits, 1, '1 hit after second request')
  t.assert.strictEqual(stats3.misses, 1, 'Miss count unchanged')

  await fastify.inject({ url: '/route2' })
  const stats4 = fastify.cache.stats()
  t.assert.strictEqual(stats4.hits, 1, 'Hit count unchanged')
  t.assert.strictEqual(stats4.misses, 2, '2 misses (route1 miss + route2 miss)')

  await fastify.inject({ url: '/route2' })
  const stats5 = fastify.cache.stats()
  t.assert.strictEqual(stats5.hits, 2, '2 hits (route1 hit + route2 hit)')
  t.assert.strictEqual(stats5.misses, 2, 'Miss count unchanged')

  await fastify.inject({ url: '/route1' })
  await fastify.inject({ url: '/route1' })
  await fastify.inject({ url: '/route2' })
  const stats6 = fastify.cache.stats()
  t.assert.strictEqual(stats6.hits, 5, '5 hits total')
  t.assert.strictEqual(stats6.misses, 2, 'Still 2 misses')

  await fastify.close()
})

test('@unit_test - purgeByPrefix handles query parameters correctly', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { data: 'users' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/users' })
  await fastify.inject({ url: '/users?page=1' })
  await fastify.inject({ url: '/users?page=2' })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.items, 3, '3 different entries cached')

  const purgeCount = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(purgeCount, 3, 'All entries with /users prefix purged')

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 0, 'All entries removed')

  await fastify.close()
})

test('@unit_test - purgeByPrefix with Vary headers', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin, { vary: ['Accept'] })

  fastify.get('/data', { config: { cache: true } }, async () => {
    return { data: 'content' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/data', headers: { accept: 'application/json' } })
  await fastify.inject({ url: '/data', headers: { accept: 'text/html' } })
  await fastify.inject({ url: '/other' })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.items, 2, '2 entries cached (different Accept headers)')

  const purgeCount = fastify.cache.purgeByPrefix('/data')
  t.assert.strictEqual(purgeCount, 2, 'Both /data entries purged')

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 0, 'All entries removed')

  await fastify.close()
})

test('@unit_test - purge with non-existent key', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  const result1 = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(result1, false, 'purge returns false for non-existent key')

  await fastify.inject({ url: '/test' })

  const result2 = fastify.cache.purge('POST|/test|')
  t.assert.strictEqual(result2, false, 'purge returns false for wrong method')

  const result3 = fastify.cache.purge('GET|/test|')
  t.assert.strictEqual(result3, true, 'purge returns true for existing entry')

  await fastify.close()
})

test('@unit_test - purgeByPrefix with no matches', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { data: 'users' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/users' })

  const purgeCount = fastify.cache.purgeByPrefix('/posts')
  t.assert.strictEqual(purgeCount, 0, 'purgeByPrefix returns 0 when no matches')

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1, 'Original entry still cached')

  await fastify.close()
})

test('@unit_test - clear on empty cache', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  fastify.cache.clear()

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('@unit_test - stats after clear and new requests', async t => {
  const fastify = Fastify({ logger: false })

  await fastify.register(cachePlugin)

  fastify.get('/test', { config: { cache: true } }, async () => {
    return { data: 'test' }
  })

  await fastify.listen({ port: 0 })

  await fastify.inject({ url: '/test' })
  await fastify.inject({ url: '/test' })

  const stats1 = fastify.cache.stats()
  t.assert.strictEqual(stats1.hits, 1)
  t.assert.strictEqual(stats1.misses, 1)

  fastify.cache.clear()

  await fastify.inject({ url: '/test' })
  await fastify.inject({ url: '/test' })

  const stats2 = fastify.cache.stats()
  t.assert.strictEqual(stats2.items, 1, '1 entry cached again')
  t.assert.strictEqual(stats2.hits, 1, 'Hit counter starts fresh')
  t.assert.strictEqual(stats2.misses, 1, 'Miss counter starts fresh')

  await fastify.close()
})
