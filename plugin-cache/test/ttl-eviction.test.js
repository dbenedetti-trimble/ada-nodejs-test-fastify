'use strict'

const { test } = require('node:test')
const Fastify = require('../../fastify')

test('@covers_ACFR_6_1 @unit_test: Entry stored with TTL of 100ms is a miss after 100ms', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let handlerCalls = 0
  fastify.get('/short-ttl', {
    config: { cache: { ttl: 100 } }
  }, () => {
    handlerCalls++
    return { data: 'short ttl response' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/short-ttl' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS', 'first request is a miss')

  const res2 = await fastify.inject({ method: 'GET', url: '/short-ttl' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'second request within TTL is a hit')

  await new Promise(resolve => setTimeout(resolve, 110))

  const res3 = await fastify.inject({ method: 'GET', url: '/short-ttl' })
  t.assert.strictEqual(res3.headers['x-cache'], 'MISS', 'request after TTL expiry is a miss')
  t.assert.strictEqual(handlerCalls, 2, 'handler called twice: initial miss and after expiry')

  await fastify.close()
})

test('@covers_ACFR_6_2 @unit_test: Entry stored with TTL of 10000ms is a hit before expiry', async (t) => {
  t.plan(4)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  let handlerCalls = 0
  fastify.get('/long-ttl', {
    config: { cache: { ttl: 10000 } }
  }, () => {
    handlerCalls++
    return { data: 'long ttl response' }
  })

  await fastify.ready()

  const res1 = await fastify.inject({ method: 'GET', url: '/long-ttl' })
  t.assert.strictEqual(res1.headers['x-cache'], 'MISS', 'first request is a miss')

  const res2 = await fastify.inject({ method: 'GET', url: '/long-ttl' })
  t.assert.strictEqual(res2.headers['x-cache'], 'HIT', 'second request is a hit')

  await new Promise(resolve => setTimeout(resolve, 100))

  const res3 = await fastify.inject({ method: 'GET', url: '/long-ttl' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'request after 100ms is still a hit')
  t.assert.strictEqual(handlerCalls, 1, 'handler called only once')

  await fastify.close()
})

test('@covers_ACFR_6_3 @unit_test: When cache has maxItems entries and a new one is added, the least recently accessed entry is evicted', async (t) => {
  t.plan(7)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 3, ttl: 60000 })

  fastify.get('/item1', { config: { cache: true } }, () => ({ item: 1 }))
  fastify.get('/item2', { config: { cache: true } }, () => ({ item: 2 }))
  fastify.get('/item3', { config: { cache: true } }, () => ({ item: 3 }))
  fastify.get('/item4', { config: { cache: true } }, () => ({ item: 4 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/item1' })
  await fastify.inject({ method: 'GET', url: '/item2' })
  await fastify.inject({ method: 'GET', url: '/item3' })

  t.assert.strictEqual(fastify.cache.stats().items, 3, 'cache has 3 items')

  const res1Hit = await fastify.inject({ method: 'GET', url: '/item1' })
  t.assert.strictEqual(res1Hit.headers['x-cache'], 'HIT', 'item1 is a hit')

  const res2Hit = await fastify.inject({ method: 'GET', url: '/item2' })
  t.assert.strictEqual(res2Hit.headers['x-cache'], 'HIT', 'item2 is a hit')

  const res3Hit = await fastify.inject({ method: 'GET', url: '/item3' })
  t.assert.strictEqual(res3Hit.headers['x-cache'], 'HIT', 'item3 is a hit')

  await fastify.inject({ method: 'GET', url: '/item4' })

  t.assert.strictEqual(fastify.cache.stats().items, 3, 'cache still has 3 items after eviction')

  const res1AfterEviction = await fastify.inject({ method: 'GET', url: '/item1' })
  t.assert.strictEqual(res1AfterEviction.headers['x-cache'], 'MISS', 'item1 was evicted (oldest entry)')

  const res4Hit = await fastify.inject({ method: 'GET', url: '/item4' })
  t.assert.strictEqual(res4Hit.headers['x-cache'], 'HIT', 'item4 is now cached')

  await fastify.close()
})

test('@covers_ACFR_6_4 @unit_test: Accessing an entry (cache hit) updates its recency (prevents eviction)', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 3, ttl: 60000 })

  fastify.get('/item1', { config: { cache: true } }, () => ({ item: 1 }))
  fastify.get('/item2', { config: { cache: true } }, () => ({ item: 2 }))
  fastify.get('/item3', { config: { cache: true } }, () => ({ item: 3 }))
  fastify.get('/item4', { config: { cache: true } }, () => ({ item: 4 }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/item1' })
  await fastify.inject({ method: 'GET', url: '/item2' })
  await fastify.inject({ method: 'GET', url: '/item3' })

  await fastify.inject({ method: 'GET', url: '/item1' })

  await fastify.inject({ method: 'GET', url: '/item4' })

  const res1 = await fastify.inject({ method: 'GET', url: '/item1' })
  t.assert.strictEqual(res1.headers['x-cache'], 'HIT', 'item1 still cached (recency updated)')

  const res3 = await fastify.inject({ method: 'GET', url: '/item3' })
  t.assert.strictEqual(res3.headers['x-cache'], 'HIT', 'item3 still cached')

  const res4 = await fastify.inject({ method: 'GET', url: '/item4' })
  t.assert.strictEqual(res4.headers['x-cache'], 'HIT', 'item4 cached')

  const res2 = await fastify.inject({ method: 'GET', url: '/item2' })
  t.assert.strictEqual(res2.headers['x-cache'], 'MISS', 'item2 was evicted (was oldest)')

  t.assert.strictEqual(fastify.cache.stats().items, 3, 'cache has 3 items')

  await fastify.close()
})

test('@covers_ACFR_6_5 @unit_test: Expired entries are cleaned up on access (lazy eviction), not via timers', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { ttl: 60000 })

  let handlerCalls = 0
  fastify.get('/lazy-cleanup', {
    config: { cache: { ttl: 100 } }
  }, () => {
    handlerCalls++
    return { data: 'response' }
  })

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/lazy-cleanup' })

  t.assert.strictEqual(fastify.cache.stats().items, 1, 'entry is in cache')

  await new Promise(resolve => setTimeout(resolve, 110))

  t.assert.strictEqual(fastify.cache.stats().items, 1, 'expired entry still in cache (no timer cleanup)')

  await fastify.inject({ method: 'GET', url: '/lazy-cleanup' })

  t.assert.strictEqual(fastify.cache.stats().items, 1, 'cache size is 1 (expired entry replaced)')
  t.assert.strictEqual(handlerCalls, 2, 'handler called twice: initial and after expiry')

  const res = await fastify.inject({ method: 'GET', url: '/lazy-cleanup' })
  t.assert.strictEqual(res.headers['x-cache'], 'HIT', 'new entry is now cached')

  await fastify.close()
})

test('TTL expiry with multiple routes', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/route-a', { config: { cache: { ttl: 100 } } }, () => ({ route: 'a' }))
  fastify.get('/route-b', { config: { cache: { ttl: 500 } } }, () => ({ route: 'b' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/route-a' })
  await fastify.inject({ method: 'GET', url: '/route-b' })

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'both routes cached')

  await new Promise(resolve => setTimeout(resolve, 110))

  const resA = await fastify.inject({ method: 'GET', url: '/route-a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS', 'route-a expired')

  const resB = await fastify.inject({ method: 'GET', url: '/route-b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'HIT', 'route-b still valid')

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'both routes in cache')

  await new Promise(resolve => setTimeout(resolve, 400))

  const resBExpired = await fastify.inject({ method: 'GET', url: '/route-b' })
  t.assert.strictEqual(resBExpired.headers['x-cache'], 'MISS', 'route-b now expired')

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'both routes refreshed in cache')

  await fastify.close()
})

test('LRU eviction respects access order across multiple requests', async (t) => {
  t.plan(6)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 2 })

  fastify.get('/a', { config: { cache: true } }, () => ({ route: 'a' }))
  fastify.get('/b', { config: { cache: true } }, () => ({ route: 'b' }))
  fastify.get('/c', { config: { cache: true } }, () => ({ route: 'c' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/a' })
  await fastify.inject({ method: 'GET', url: '/b' })

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'cache is full with a and b')

  await fastify.inject({ method: 'GET', url: '/c' })

  t.assert.strictEqual(fastify.cache.stats().items, 2, 'cache still has 2 items after adding c')

  const resA = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA.headers['x-cache'], 'MISS', '/a was evicted')

  const resC = await fastify.inject({ method: 'GET', url: '/c' })
  t.assert.strictEqual(resC.headers['x-cache'], 'HIT', '/c still in cache')

  const resA2 = await fastify.inject({ method: 'GET', url: '/a' })
  t.assert.strictEqual(resA2.headers['x-cache'], 'HIT', '/a is now cached')

  const resB = await fastify.inject({ method: 'GET', url: '/b' })
  t.assert.strictEqual(resB.headers['x-cache'], 'MISS', '/b was evicted')

  await fastify.close()
})

test('Stats counters track hits and misses correctly with TTL expiry', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'))

  fastify.get('/stats-test', {
    config: { cache: { ttl: 100 } }
  }, () => ({ data: 'test' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/stats-test' })
  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 1, 'one miss')
  t.assert.strictEqual(stats.hits, 0, 'no hits yet')

  await fastify.inject({ method: 'GET', url: '/stats-test' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 1, 'one hit')

  await new Promise(resolve => setTimeout(resolve, 110))

  await fastify.inject({ method: 'GET', url: '/stats-test' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 2, 'two misses after expiry')
  t.assert.strictEqual(stats.hits, 1, 'still one hit')

  await fastify.close()
})

test('Stats counters track hits and misses correctly with LRU eviction', async (t) => {
  t.plan(5)
  const fastify = Fastify()

  await fastify.register(require('../index'), { maxItems: 2 })

  fastify.get('/x', { config: { cache: true } }, () => ({ route: 'x' }))
  fastify.get('/y', { config: { cache: true } }, () => ({ route: 'y' }))
  fastify.get('/z', { config: { cache: true } }, () => ({ route: 'z' }))

  await fastify.ready()

  await fastify.inject({ method: 'GET', url: '/x' })
  await fastify.inject({ method: 'GET', url: '/y' })

  let stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 2, 'two misses')
  t.assert.strictEqual(stats.hits, 0, 'no hits')

  await fastify.inject({ method: 'GET', url: '/x' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 1, 'one hit')

  await fastify.inject({ method: 'GET', url: '/z' })

  await fastify.inject({ method: 'GET', url: '/y' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.misses, 4, 'four misses (y was evicted)')

  await fastify.inject({ method: 'GET', url: '/z' })
  stats = fastify.cache.stats()
  t.assert.strictEqual(stats.hits, 2, 'two hits')

  await fastify.close()
})
