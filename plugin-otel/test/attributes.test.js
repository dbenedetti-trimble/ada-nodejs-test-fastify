'use strict'

const { test } = require('node:test')
const { buildRequestAttributes, buildResponseAttributes } = require('../lib/span-attributes')

function makeRequest (overrides) {
  return Object.assign({
    method: 'GET',
    url: '/users/42',
    protocol: 'http',
    hostname: 'localhost',
    socket: { localPort: 3000 },
    raw: { httpVersion: '1.1' },
    headers: { 'user-agent': 'test-agent/1.0' },
    routeOptions: { url: '/users/:id', config: { url: '/users/:id' } }
  }, overrides)
}

// @covers_ACFR_5_1 @covers_ACFR_5_5 @covers_ACFR_5_6 @unit_test
test('buildRequestAttributes - all attributes with correct types', t => {
  t.plan(11)
  const request = makeRequest({
    url: '/users/42?page=1',
    headers: { 'user-agent': 'TestAgent/2.0', 'content-length': '128' }
  })
  const attrs = buildRequestAttributes(request)

  t.assert.strictEqual(attrs['http.request.method'], 'GET')
  t.assert.strictEqual(attrs['url.path'], '/users/42')
  t.assert.strictEqual(attrs['url.query'], 'page=1')
  t.assert.strictEqual(attrs['url.scheme'], 'http')
  t.assert.strictEqual(attrs['server.address'], 'localhost')
  t.assert.strictEqual(attrs['server.port'], 3000)
  t.assert.strictEqual(attrs['network.protocol.version'], '1.1')
  t.assert.strictEqual(attrs['user_agent.original'], 'TestAgent/2.0')
  t.assert.strictEqual(attrs['http.request.header.content-length'], 128)
  t.assert.strictEqual(typeof attrs['server.port'], 'number')
  t.assert.strictEqual(typeof attrs['http.request.header.content-length'], 'number')
})

// @covers_ACFR_5_4 @unit_test
test('buildRequestAttributes - optional attributes omitted when absent', t => {
  t.plan(2)
  const attrs = buildRequestAttributes(makeRequest({ url: '/test', headers: {} }))

  t.assert.ok(!('url.query' in attrs), 'url.query absent without query string')
  t.assert.ok(!('user_agent.original' in attrs), 'user_agent.original absent without header')
})

// @covers_ACFR_5_2 @covers_ACFR_5_3 @covers_ACFR_5_5 @covers_ACFR_5_6 @unit_test
test('buildResponseAttributes - all attributes with correct types and route pattern', t => {
  t.plan(5)
  const headers = { 'content-length': '64' }
  const reply = { statusCode: 200, getHeader (n) { return headers[n] } }
  const attrs = buildResponseAttributes(makeRequest(), reply)

  t.assert.strictEqual(attrs['http.response.status_code'], 200)
  t.assert.strictEqual(attrs['http.route'], '/users/:id')
  t.assert.strictEqual(attrs['http.response.header.content-length'], 64)
  t.assert.strictEqual(typeof attrs['http.response.status_code'], 'number')
  t.assert.strictEqual(typeof attrs['http.response.header.content-length'], 'number')
})

// @covers_ACFR_5_3 @unit_test
test('buildResponseAttributes - http.route fallback and 404 handling', t => {
  t.plan(2)
  const noReply = { statusCode: 200, getHeader () { return undefined } }

  const fallback = buildResponseAttributes(makeRequest({ routeOptions: { url: '/items/:id' } }), noReply)
  t.assert.strictEqual(fallback['http.route'], '/items/:id')

  const notFound = buildResponseAttributes(makeRequest({ routeOptions: { url: undefined } }), noReply)
  t.assert.strictEqual(notFound['http.route'], '')
})
