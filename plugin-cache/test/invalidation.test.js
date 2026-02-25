'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')
const cachePlugin = require('../index')

test('@covers_ACFR_8_1 @unit_test: purge(key) removes the exact entry and returns true if it existed', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  let callCount = 0
  fastify.get('/users', { config: { cache: true } }, async () => {
    callCount++
    return { users: ['alice', 'bob'] }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res1.statusCode, 200)
  t.assert.strictEqual(callCount, 1)

  const res2 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res2.statusCode, 200)
  t.assert.strictEqual(callCount, 1)
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT')

  const purgeResult = fastify.cache.purge('GET|/users|')
  t.assert.strictEqual(purgeResult, true)

  const res3 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res3.statusCode, 200)
  t.assert.strictEqual(callCount, 2)
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS')

  await fastify.close()
})

test('@covers_ACFR_8_1 @unit_test: purge(key) returns false if entry does not exist', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  const purgeResult = fastify.cache.purge('GET|/nonexistent|')
  t.assert.strictEqual(purgeResult, false)

  await fastify.close()
})

test('@covers_ACFR_8_2 @unit_test: purgeByPrefix(prefix) removes all entries whose URL starts with the given prefix', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  let usersCallCount = 0
  let users123CallCount = 0
  let users456CallCount = 0
  let postsCallCount = 0

  fastify.get('/users', { config: { cache: true } }, async () => {
    usersCallCount++
    return { users: [] }
  })

  fastify.get('/users/123', { config: { cache: true } }, async () => {
    users123CallCount++
    return { user: 'alice' }
  })

  fastify.get('/users/456', { config: { cache: true } }, async () => {
    users456CallCount++
    return { user: 'bob' }
  })

  fastify.get('/posts', { config: { cache: true } }, async () => {
    postsCallCount++
    return { posts: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users/123' })
  await fastify.inject({ method: 'GET', url: '/users/456' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  t.assert.strictEqual(usersCallCount, 1)
  t.assert.strictEqual(users123CallCount, 1)
  t.assert.strictEqual(users456CallCount, 1)
  t.assert.strictEqual(postsCallCount, 1)

  const removedCount = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(removedCount, 3)

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1)

  const res1 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(usersCallCount, 2)

  const res2 = await fastify.inject({ method: 'GET', url: '/users/123' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(users123CallCount, 2)

  const res3 = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT')
  t.assert.strictEqual(postsCallCount, 1)

  await fastify.close()
})

test('@covers_ACFR_8_2 @unit_test: purgeByPrefix(prefix) returns 0 if no entries match', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })

  const removedCount = fastify.cache.purgeByPrefix('/posts')
  t.assert.strictEqual(removedCount, 0)

  const stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1)

  await fastify.close()
})

test('@covers_ACFR_8_3 @unit_test: clear() removes all entries and resets stats counters', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  let usersCallCount = 0
  let postsCallCount = 0

  fastify.get('/users', { config: { cache: true } }, async () => {
    usersCallCount++
    return { users: [] }
  })

  fastify.get('/posts', { config: { cache: true } }, async () => {
    postsCallCount++
    return { posts: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/users' })
  await fastify.inject({ method: 'GET', url: '/posts' })
  await fastify.inject({ method: 'GET', url: '/posts' })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 2)
  t.assert.strictEqual(stats.hits, 2)
  t.assert.strictEqual(stats.misses, 2)

  fastify.cache.clear()

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  const res1 = await fastify.inject({ method: 'GET', url: '/users' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS')
  t.assert.strictEqual(usersCallCount, 2)

  const res2 = await fastify.inject({ method: 'GET', url: '/posts' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS')
  t.assert.strictEqual(postsCallCount, 2)

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 2)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.close()
})

test('@covers_ACFR_8_4 @unit_test: stats() returns current item count, max items, total hits, and total misses', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 100, ttl: 60000 })

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.maxItems, 100)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.inject({ method: 'GET', url: '/users' })

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1)
  t.assert.strictEqual(stats.maxItems, 100)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 1)

  await fastify.inject({ method: 'GET', url: '/users' })

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1)
  t.assert.strictEqual(stats.maxItems, 100)
  t.assert.strictEqual(stats.hits, 1)
  t.assert.strictEqual(stats.misses, 1)

  await fastify.close()
})

test('@covers_ACFR_8_5 @unit_test: Hit/miss counters increment correctly as requests are served', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  fastify.get('/posts', { config: { cache: true } }, async () => {
    return { posts: [] }
  })

  await fastify.ready()

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.inject({ method: 'GET', url: '/users' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 1)

  await fastify.inject({ method: 'GET', url: '/users' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 1)
  t.assert.strictEqual(stats.misses, 1)

  await fastify.inject({ method: 'GET', url: '/users' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2)
  t.assert.strictEqual(stats.misses, 1)

  await fastify.inject({ method: 'GET', url: '/posts' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.inject({ method: 'GET', url: '/posts' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 3)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.close()
})

test('@covers_ACFR_8_5 @unit_test: Hit/miss counters work correctly with expired entries', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 100 })

  fastify.get('/users', { config: { cache: { ttl: 100 } } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users' })
  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 1)

  await fastify.inject({ method: 'GET', url: '/users' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 1)
  t.assert.strictEqual(stats.misses, 1)

  await new Promise(resolve => setTimeout(resolve, 150))

  await fastify.inject({ method: 'GET', url: '/users' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 1)
  t.assert.strictEqual(stats.misses, 2)

  await fastify.close()
})

test('@covers_ACFR_8_1 @covers_ACFR_8_2 @covers_ACFR_8_4 @unit_test: Integration test with all cache invalidation methods', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/api/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  fastify.get('/api/users/123', { config: { cache: true } }, async () => {
    return { user: 'alice' }
  })

  fastify.get('/api/posts', { config: { cache: true } }, async () => {
    return { posts: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/api/users' })
  await fastify.inject({ method: 'GET', url: '/api/users/123' })
  await fastify.inject({ method: 'GET', url: '/api/posts' })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 3)
  t.assert.strictEqual(stats.misses, 3)

  await fastify.inject({ method: 'GET', url: '/api/users' })
  await fastify.inject({ method: 'GET', url: '/api/users/123' })
  await fastify.inject({ method: 'GET', url: '/api/posts' })

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 3)

  const purgeResult = fastify.cache.purge('GET|/api/users|')
  t.assert.strictEqual(purgeResult, true)

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 2)

  const removedCount = fastify.cache.purgeByPrefix('/api/users')
  t.assert.strictEqual(removedCount, 1)

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 1)

  fastify.cache.clear()

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)
  t.assert.strictEqual(stats.hits, 0)
  t.assert.strictEqual(stats.misses, 0)

  await fastify.close()
})

test('@covers_ACFR_8_2 @unit_test: purgeByPrefix with query strings', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/users', { config: { cache: true } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users?page=1' })
  await fastify.inject({ method: 'GET', url: '/users?page=2' })
  await fastify.inject({ method: 'GET', url: '/users?page=3' })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 3)

  const removedCount = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(removedCount, 3)

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)

  await fastify.close()
})

test('@covers_ACFR_8_2 @unit_test: purgeByPrefix with vary headers', async (t) => {
  const fastify = Fastify()
  await fastify.register(cachePlugin, { maxItems: 10, ttl: 60000 })

  fastify.get('/users', { config: { cache: { vary: ['Accept'] } } }, async () => {
    return { users: [] }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/users', headers: { accept: 'application/json' } })
  await fastify.inject({ method: 'GET', url: '/users', headers: { accept: 'text/html' } })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 2)

  const removedCount = fastify.cache.purgeByPrefix('/users')
  t.assert.strictEqual(removedCount, 2)

  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.items, 0)

  await fastify.close()
})
