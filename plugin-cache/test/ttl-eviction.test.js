'use strict'

const { test } = require('node:test')
const LRUCache = require('../lib/lru-cache')

test('TTL expiry and LRU eviction', async (t) => {
  await t.test('@covers_ACFR_6_1 - Entry stored with TTL of 100ms is a miss after 100ms', async (t) => {
    t.plan(2)

    const cache = new LRUCache(10)
    const key = 'test-key'
    const entry = {
      body: 'test body',
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      etag: 'W/"abc123"',
      expiry: Date.now() + 100
    }

    cache.set(key, entry)
    t.assert.ok(cache.get(key), 'Entry exists before expiry')

    await new Promise(resolve => setTimeout(resolve, 150))

    const expiredEntry = cache.get(key)
    t.assert.strictEqual(expiredEntry, undefined, 'Entry is undefined after 100ms expiry')
  })

  await t.test('@covers_ACFR_6_2 - Entry stored with TTL of 10000ms is a hit before expiry', async (t) => {
    t.plan(2)

    const cache = new LRUCache(10)
    const key = 'long-lived-key'
    const entry = {
      body: 'long lived content',
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      etag: 'W/"def456"',
      expiry: Date.now() + 10000
    }

    cache.set(key, entry)

    const retrieved = cache.get(key)
    t.assert.ok(retrieved, 'Entry exists before expiry')
    t.assert.strictEqual(retrieved.body, 'long lived content', 'Entry body matches original')
  })

  await t.test('@covers_ACFR_6_3 - When cache has maxItems entries and a new one is added, the least recently accessed entry is evicted', async (t) => {
    t.plan(3)

    const cache = new LRUCache(3)

    cache.set('key1', { body: 'body1', statusCode: 200, headers: {}, etag: 'W/"1"', expiry: Date.now() + 10000 })
    cache.set('key2', { body: 'body2', statusCode: 200, headers: {}, etag: 'W/"2"', expiry: Date.now() + 10000 })
    cache.set('key3', { body: 'body3', statusCode: 200, headers: {}, etag: 'W/"3"', expiry: Date.now() + 10000 })

    t.assert.strictEqual(cache.size(), 3, 'Cache has 3 entries at capacity')

    cache.set('key4', { body: 'body4', statusCode: 200, headers: {}, etag: 'W/"4"', expiry: Date.now() + 10000 })

    t.assert.strictEqual(cache.size(), 3, 'Cache still has 3 entries after eviction')
    t.assert.strictEqual(cache.get('key1'), undefined, 'Oldest entry (key1) was evicted')
  })

  await t.test('@covers_ACFR_6_4 - Accessing an entry (cache hit) updates its recency (prevents eviction)', async (t) => {
    t.plan(4)

    const cache = new LRUCache(3)

    cache.set('key1', { body: 'body1', statusCode: 200, headers: {}, etag: 'W/"1"', expiry: Date.now() + 10000 })
    cache.set('key2', { body: 'body2', statusCode: 200, headers: {}, etag: 'W/"2"', expiry: Date.now() + 10000 })
    cache.set('key3', { body: 'body3', statusCode: 200, headers: {}, etag: 'W/"3"', expiry: Date.now() + 10000 })

    cache.get('key1')

    cache.set('key4', { body: 'body4', statusCode: 200, headers: {}, etag: 'W/"4"', expiry: Date.now() + 10000 })

    t.assert.ok(cache.get('key1'), 'key1 was not evicted (accessed before key4 added)')
    t.assert.strictEqual(cache.get('key2'), undefined, 'key2 was evicted (least recently used)')
    t.assert.ok(cache.get('key3'), 'key3 still exists')
    t.assert.ok(cache.get('key4'), 'key4 was added successfully')
  })

  await t.test('@covers_ACFR_6_5 - Expired entries are cleaned up on access (lazy eviction), not via timers', async (t) => {
    t.plan(3)

    const cache = new LRUCache(10)
    const key = 'expire-on-access'
    const entry = {
      body: 'will expire',
      statusCode: 200,
      headers: {},
      etag: 'W/"expire"',
      expiry: Date.now() + 50
    }

    cache.set(key, entry)
    t.assert.strictEqual(cache.size(), 1, 'Entry is stored in cache')

    await new Promise(resolve => setTimeout(resolve, 100))

    t.assert.strictEqual(cache.size(), 1, 'Entry still exists in Map before access (no background cleanup)')

    const result = cache.get(key)
    t.assert.strictEqual(result, undefined, 'Entry returns undefined on access after expiry (lazy eviction)')
  })

  await t.test('LRU cache updates statistics correctly', async (t) => {
    t.plan(4)

    const cache = new LRUCache(5)
    const entry = { body: 'test', statusCode: 200, headers: {}, etag: 'W/"1"', expiry: Date.now() + 10000 }

    cache.set('key1', entry)

    cache.get('key1')
    const stats1 = cache.stats()
    t.assert.strictEqual(stats1.hits, 1, 'Hit counter incremented on cache hit')

    cache.get('key2')
    const stats2 = cache.stats()
    t.assert.strictEqual(stats2.misses, 1, 'Miss counter incremented on cache miss')

    t.assert.strictEqual(stats2.items, 1, 'Stats shows current item count')
    t.assert.strictEqual(stats2.maxItems, 5, 'Stats shows maxItems configuration')
  })

  await t.test('LRU cache clears statistics on clear()', async (t) => {
    t.plan(3)

    const cache = new LRUCache(5)
    const entry = { body: 'test', statusCode: 200, headers: {}, etag: 'W/"1"', expiry: Date.now() + 10000 }

    cache.set('key1', entry)
    cache.get('key1')
    cache.get('key2')

    cache.clear()

    const stats = cache.stats()
    t.assert.strictEqual(stats.items, 0, 'Cache is empty after clear')
    t.assert.strictEqual(stats.hits, 0, 'Hit counter reset to 0')
    t.assert.strictEqual(stats.misses, 0, 'Miss counter reset to 0')
  })

  await t.test('LRU cache handles updating existing key', async (t) => {
    t.plan(3)

    const cache = new LRUCache(3)
    const entry1 = { body: 'original', statusCode: 200, headers: {}, etag: 'W/"1"', expiry: Date.now() + 10000 }
    const entry2 = { body: 'updated', statusCode: 200, headers: {}, etag: 'W/"2"', expiry: Date.now() + 10000 }

    cache.set('key1', entry1)
    cache.set('key2', { body: 'body2', statusCode: 200, headers: {}, etag: 'W/"3"', expiry: Date.now() + 10000 })
    cache.set('key3', { body: 'body3', statusCode: 200, headers: {}, etag: 'W/"4"', expiry: Date.now() + 10000 })

    t.assert.strictEqual(cache.size(), 3, 'Cache has 3 entries')

    cache.set('key1', entry2)

    t.assert.strictEqual(cache.size(), 3, 'Cache still has 3 entries after update')
    t.assert.strictEqual(cache.get('key1').body, 'updated', 'Entry was updated with new value')
  })
})
