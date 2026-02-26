'use strict'

// @covers_ACFR_6_1 @covers_ACFR_6_2 @covers_ACFR_6_3 @covers_ACFR_6_4 @covers_ACFR_6_5
// @covers_ACDP_1_1 @covers_ACDP_1_2 @covers_ACDP_1_3
// @covers_ACDP_2_1 @covers_ACDP_2_2 @covers_ACDP_2_3 @covers_ACDP_2_4
// @unit_test

const { test } = require('node:test')
const { install } = require('@sinonjs/fake-timers')
const LRUCache = require('../lib/lru-cache')

function makeEntry (overrides) {
  return {
    body: '{"ok":true}',
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    etag: 'W/"abcdef1234567890"',
    expiry: Date.now() + 10000,
    ...overrides
  }
}

// @covers_ACFR_6_1
test('entry stored with TTL of 100ms is a miss after 100ms', (t) => {
  t.plan(2)
  const clock = install()
  const cache = new LRUCache(100)
  const entry = makeEntry({ expiry: Date.now() + 100 })
  cache.set('key1', entry)

  t.assert.ok(cache.get('key1') !== null, 'should hit before expiry')

  clock.tick(100)
  t.assert.strictEqual(cache.get('key1'), null, 'should miss after TTL expires')

  clock.uninstall()
})

// @covers_ACFR_6_2
test('entry stored with TTL of 10000ms is a hit before expiry', (t) => {
  t.plan(1)
  const clock = install()
  const cache = new LRUCache(100)
  cache.set('key2', makeEntry({ expiry: Date.now() + 10000 }))

  clock.tick(9999)
  t.assert.ok(cache.get('key2') !== null, 'should still be a hit before expiry')

  clock.uninstall()
})

// @covers_ACFR_6_3 @covers_ACDP_2_3
test('least recently accessed entry is evicted when cache is full', (t) => {
  t.plan(3)
  const cache = new LRUCache(2)
  cache.set('a', makeEntry())
  cache.set('b', makeEntry())
  cache.set('c', makeEntry())

  t.assert.strictEqual(cache.get('a'), null, 'a should be evicted (oldest insertion)')
  t.assert.ok(cache.get('b') !== null, 'b should remain')
  t.assert.ok(cache.get('c') !== null, 'c should remain')
})

// @covers_ACFR_6_4 @covers_ACDP_2_2
test('accessing an entry updates its recency and prevents eviction', (t) => {
  t.plan(3)
  const cache = new LRUCache(2)
  cache.set('a', makeEntry())
  cache.set('b', makeEntry())

  cache.get('a')

  cache.set('c', makeEntry())

  t.assert.ok(cache.get('a') !== null, 'a should survive (accessed recently)')
  t.assert.strictEqual(cache.get('b'), null, 'b should be evicted (LRU)')
  t.assert.ok(cache.get('c') !== null, 'c should remain')
})

// @covers_ACFR_6_5 @covers_ACDP_2_4
test('expired entries are removed on access (lazy eviction), not via timers', (t) => {
  t.plan(2)
  const clock = install()
  const cache = new LRUCache(100)
  cache.set('key', makeEntry({ expiry: Date.now() + 50 }))

  t.assert.strictEqual(cache.size, 1, 'entry exists before expiry')

  clock.tick(50)
  cache.get('key')
  t.assert.strictEqual(cache.size, 0, 'entry removed lazily on access after expiry')

  clock.uninstall()
})

// @covers_ACDP_1_1 @covers_ACDP_1_2 @covers_ACDP_1_3
test('cache entry structure contains required fields with correct types', (t) => {
  t.plan(5)
  const cache = new LRUCache(100)
  const now = Date.now()
  const ttl = 5000
  const entry = {
    body: '{"data":1}',
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    etag: 'W/"1234567890abcdef"',
    expiry: now + ttl
  }
  cache.set('e1', entry)

  const result = cache.get('e1')
  t.assert.strictEqual(typeof result.body, 'string', 'body is string')
  t.assert.strictEqual(typeof result.statusCode, 'number', 'statusCode is number')
  t.assert.strictEqual(typeof result.headers, 'object', 'headers is object')
  t.assert.ok(result.etag.startsWith('W/"') && result.etag.length === 20, 'etag is W/"16-char-hex"')
  t.assert.ok(result.expiry > now, 'expiry is Date.now() + ttl')
})

// @covers_ACDP_2_1
test('cache uses JavaScript Map for O(1) lookup and insertion-order tracking', (t) => {
  t.plan(2)
  const cache = new LRUCache(10)
  cache.set('x', makeEntry())
  t.assert.ok(cache._map instanceof Map, 'internal storage is a Map')
  t.assert.strictEqual(cache.size, 1, 'size reflects map size')
})
