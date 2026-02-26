'use strict'

// @covers_ACFR_9_1 @covers_ACFR_9_2 @covers_ACFR_9_3 @covers_ACFR_9_4 @covers_ACFR_9_5
// @unit_test

const { test } = require('node:test')
const { generateETag, matchesETag } = require('../lib/etag')

// @covers_ACFR_9_1
test('generateETag returns W/"16-char-hex" format', (t) => {
  t.plan(1)
  const etag = generateETag('hello')
  t.assert.match(etag, /^W\/"[0-9a-f]{16}"$/, 'ETag must be W/"<16 lowercase hex chars>"')
})

// @covers_ACFR_9_1
test('generateETag is deterministic: same body always produces same ETag', (t) => {
  t.plan(2)
  const body = JSON.stringify({ users: [1, 2, 3] })
  t.assert.strictEqual(generateETag(body), generateETag(body), 'same string body produces same ETag')
  t.assert.strictEqual(generateETag({ a: 1 }), generateETag({ a: 1 }), 'same object body produces same ETag')
})

// @covers_ACFR_9_1
test('generateETag JSON.stringifies object bodies before hashing', (t) => {
  t.plan(2)
  const obj = { key: 'value' }
  const str = JSON.stringify(obj)
  const etagFromObj = generateETag(obj)
  const etagFromStr = generateETag(str)
  t.assert.match(etagFromObj, /^W\/"[0-9a-f]{16}"$/, 'object body produces valid ETag format')
  t.assert.strictEqual(etagFromObj, etagFromStr, 'object body hashed same as its JSON string')
})

// @covers_ACFR_9_1
test('generateETag produces different ETags for different bodies', (t) => {
  t.plan(1)
  const etag1 = generateETag('hello')
  const etag2 = generateETag('world')
  t.assert.notStrictEqual(etag1, etag2, 'different bodies must produce different ETags')
})

// @covers_ACFR_9_2
test('matchesETag returns true when If-None-Match exactly matches stored ETag', (t) => {
  t.plan(1)
  const etag = generateETag('response body')
  t.assert.strictEqual(matchesETag(etag, etag), true, 'exact ETag match must return true')
})

// @covers_ACFR_9_3
test('matchesETag returns false when If-None-Match does not match stored ETag', (t) => {
  t.plan(2)
  const etag = generateETag('response body')
  t.assert.strictEqual(matchesETag('W/"wrongetag123456"', etag), false, 'non-matching ETag must return false')
  t.assert.strictEqual(matchesETag('W/"0000000000000000"', etag), false, 'non-matching ETag returns false')
})

// @covers_ACFR_9_3
test('matchesETag returns false when If-None-Match header is absent', (t) => {
  t.plan(3)
  const etag = generateETag('body')
  t.assert.strictEqual(matchesETag(null, etag), false, 'null header returns false')
  t.assert.strictEqual(matchesETag(undefined, etag), false, 'undefined header returns false')
  t.assert.strictEqual(matchesETag('', etag), false, 'empty header returns false')
})

// @covers_ACFR_9_4
test('matchesETag returns true when If-None-Match is wildcard *', (t) => {
  t.plan(2)
  const etag = generateETag('any body')
  t.assert.strictEqual(matchesETag('*', etag), true, 'wildcard * matches any ETag')
  t.assert.strictEqual(matchesETag('  *  ', etag), true, 'wildcard * with whitespace matches any ETag')
})

// @covers_ACFR_9_5
test('matchesETag checks all ETags in comma-separated If-None-Match list', (t) => {
  t.plan(3)
  const etag = generateETag('response body')
  const wrongEtag = 'W/"0000000000000000"'

  t.assert.strictEqual(
    matchesETag(`${wrongEtag}, ${etag}`, etag),
    true,
    'matching ETag found in comma-separated list must return true'
  )
  t.assert.strictEqual(
    matchesETag(`${etag}, ${wrongEtag}`, etag),
    true,
    'matching ETag first in comma-separated list must return true'
  )
  t.assert.strictEqual(
    matchesETag(`${wrongEtag}, W/"1111111111111111"`, etag),
    false,
    'no matching ETag in comma-separated list must return false'
  )
})
