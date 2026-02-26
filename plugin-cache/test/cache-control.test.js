'use strict'

// @covers_ACFR_7_1 @covers_ACFR_7_2 @covers_ACFR_7_3 @covers_ACFR_7_4
// @covers_ACFR_7_5 @covers_ACFR_7_6 @covers_ACFR_7_7
// @unit_test

const { test } = require('node:test')
const { parseResponseCC, parseRequestCC } = require('../lib/cache-control')

// @covers_ACFR_7_1
test('parseResponseCC: no-store returns { noStore: true }', (t) => {
  t.plan(2)
  const result = parseResponseCC('no-store')
  t.assert.strictEqual(result.noStore, true)
  t.assert.strictEqual(result.private, undefined)
})

// @covers_ACFR_7_2
test('parseResponseCC: private returns { private: true }', (t) => {
  t.plan(2)
  const result = parseResponseCC('private')
  t.assert.strictEqual(result.private, true)
  t.assert.strictEqual(result.noStore, undefined)
})

// @covers_ACFR_7_3
test('parseResponseCC: max-age=30 returns { maxAge: 30 }', (t) => {
  t.plan(2)
  const result = parseResponseCC('max-age=30')
  t.assert.strictEqual(result.maxAge, 30)
  t.assert.strictEqual(result.sMaxAge, undefined)
})

// @covers_ACFR_7_4
test('parseResponseCC: s-maxage=10, max-age=30 returns { sMaxAge: 10, maxAge: 30 }', (t) => {
  t.plan(2)
  const result = parseResponseCC('s-maxage=10, max-age=30')
  t.assert.strictEqual(result.sMaxAge, 10)
  t.assert.strictEqual(result.maxAge, 30)
})

// @covers_ACFR_7_5
test('parseRequestCC: no-cache returns { noCache: true }', (t) => {
  t.plan(2)
  const result = parseRequestCC('no-cache')
  t.assert.strictEqual(result.noCache, true)
  t.assert.strictEqual(result.noStore, undefined)
})

// @covers_ACFR_7_5
test('parseRequestCC: no-store returns { noStore: true }', (t) => {
  t.plan(2)
  const result = parseRequestCC('no-store')
  t.assert.strictEqual(result.noStore, true)
  t.assert.strictEqual(result.noCache, undefined)
})

// @covers_ACFR_7_6
test('parseResponseCC: no-cache returns { noCache: true }', (t) => {
  t.plan(1)
  const result = parseResponseCC('no-cache')
  t.assert.strictEqual(result.noCache, true)
})

// @covers_ACFR_7_7
test('parseResponseCC: absent header returns empty object', (t) => {
  t.plan(3)
  const resultNull = parseResponseCC(null)
  const resultUndefined = parseResponseCC(undefined)
  const resultEmpty = parseResponseCC('')
  t.assert.deepStrictEqual(resultNull, {})
  t.assert.deepStrictEqual(resultUndefined, {})
  t.assert.deepStrictEqual(resultEmpty, {})
})

// @covers_ACFR_7_7
test('parseRequestCC: absent header returns empty object', (t) => {
  t.plan(2)
  const resultNull = parseRequestCC(null)
  const resultUndefined = parseRequestCC(undefined)
  t.assert.deepStrictEqual(resultNull, {})
  t.assert.deepStrictEqual(resultUndefined, {})
})

test('parseResponseCC: multiple directives parsed correctly', (t) => {
  t.plan(3)
  const result = parseResponseCC('no-store, max-age=60, private')
  t.assert.strictEqual(result.noStore, true)
  t.assert.strictEqual(result.maxAge, 60)
  t.assert.strictEqual(result.private, true)
})

test('parseResponseCC: s-maxage takes priority value over max-age (both parsed)', (t) => {
  t.plan(2)
  const result = parseResponseCC('max-age=300, s-maxage=60')
  t.assert.strictEqual(result.sMaxAge, 60)
  t.assert.strictEqual(result.maxAge, 300)
})
