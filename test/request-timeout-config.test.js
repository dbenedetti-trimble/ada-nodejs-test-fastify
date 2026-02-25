'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const {
  FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT
} = require('../lib/errors')

test('Request Timeout Configuration', async t => {
  // @covers_ACFR_1_3 - Routes without requestTimeout have no timer
  await t.test('route without requestTimeout has no timer configured', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_1_1 - Routes with requestTimeout: N start a timer
  await t.test('route with requestTimeout has timer configured', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 2000 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 2000)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_1_4 - Invalid values throw error
  await t.test('non-integer requestTimeout throws error', async (t) => {
    t.plan(1)

    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.get('/', { requestTimeout: 'invalid' }, async () => {
        return { hello: 'world' }
      })
    }, FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT)
  })

  // @covers_ACFR_1_4 - Negative values throw error
  await t.test('negative requestTimeout throws error', async (t) => {
    t.plan(1)

    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.get('/', { requestTimeout: -1 }, async () => {
        return { hello: 'world' }
      })
    }, FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT)
  })

  // @covers_ACFR_1_4 - Float values throw error
  await t.test('float requestTimeout throws error', async (t) => {
    t.plan(1)

    const fastify = Fastify()

    t.assert.throws(() => {
      fastify.get('/', { requestTimeout: 1.5 }, async () => {
        return { hello: 'world' }
      })
    }, FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT)
  })

  // @covers_ACFR_1_5 - requestTimeout: 0 disables timeout
  await t.test('requestTimeout: 0 disables timeout', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 0 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 0)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_2_1 - routeTimeout sets default for all routes
  await t.test('routeTimeout on constructor sets default', async (t) => {
    t.plan(2)

    const fastify = Fastify({ routeTimeout: 30000 })

    fastify.get('/', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_2_2 - Per-route requestTimeout overrides routeTimeout
  await t.test('per-route requestTimeout overrides routeTimeout', async (t) => {
    t.plan(2)

    const fastify = Fastify({ routeTimeout: 30000 })

    fastify.get('/', { requestTimeout: 5000 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_2_3 - requestTimeout: 0 disables even when routeTimeout is set
  await t.test('requestTimeout: 0 disables when routeTimeout is set', async (t) => {
    t.plan(2)

    const fastify = Fastify({ routeTimeout: 30000 })

    fastify.get('/', { requestTimeout: 0 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 0)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_2_4 - No timer when neither is set
  await t.test('no timer when neither requestTimeout nor routeTimeout is set', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_2_5 - Exposed via fastify.initialConfig.routeTimeout
  await t.test('routeTimeout exposed via initialConfig', async (t) => {
    t.plan(2)

    const fastify = Fastify({ routeTimeout: 30000 })

    await fastify.ready()

    t.assert.strictEqual(fastify.initialConfig.routeTimeout, 30000)

    const fastify2 = Fastify()
    await fastify2.ready()
    t.assert.strictEqual(fastify2.initialConfig.routeTimeout, 0)
  })

  // @covers_ACFR_2_6 - Must be non-negative integer
  await t.test('routeTimeout must be non-negative integer', async (t) => {
    t.plan(3)

    t.assert.throws(() => {
      Fastify({ routeTimeout: -1 })
    }, FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT)

    t.assert.throws(() => {
      Fastify({ routeTimeout: 'invalid' })
    })

    t.assert.throws(() => {
      Fastify({ routeTimeout: 1.5 })
    })
  })

  // @covers_ACFR_7_1 - Returns route's timeout in ms
  await t.test('routeOptions returns timeout in milliseconds', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 5000 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_7_2 - Returns route-level value when set, otherwise global
  await t.test('routeOptions returns route-level or global routeTimeout', async (t) => {
    t.plan(4)

    const fastify = Fastify({ routeTimeout: 30000 })

    fastify.get('/global', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
      return { hello: 'world' }
    })

    fastify.get('/override', { requestTimeout: 10000 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 10000)
      return { hello: 'world' }
    })

    await fastify.ready()

    let response = await fastify.inject({
      method: 'GET',
      url: '/global'
    })
    t.assert.strictEqual(response.statusCode, 200)

    response = await fastify.inject({
      method: 'GET',
      url: '/override'
    })
    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_7_3 - Returns undefined when no timeout configured
  await t.test('routeOptions returns undefined when no timeout', async (t) => {
    t.plan(2)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_7_4 - Returns 0 when explicitly disabled
  await t.test('routeOptions returns 0 when explicitly disabled', async (t) => {
    t.plan(3)

    const fastify = Fastify({ routeTimeout: 30000 })

    fastify.get('/disabled', { requestTimeout: 0 }, async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 0)
      return { hello: 'world' }
    })

    fastify.get('/zero-global', async (request, reply) => {
      return { hello: 'world' }
    })

    await fastify.ready()

    const response1 = await fastify.inject({
      method: 'GET',
      url: '/disabled'
    })
    t.assert.strictEqual(response1.statusCode, 200)

    const fastify2 = Fastify({ routeTimeout: 0 })
    fastify2.get('/', async (request, reply) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 0)
      return { hello: 'world' }
    })
    await fastify2.ready()
  })

  // @unit_test - Test multiple route methods with requestTimeout
  await t.test('requestTimeout works with all HTTP methods', async (t) => {
    t.plan(4)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 1000 }, async (request) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 1000)
      return { method: 'GET' }
    })

    fastify.post('/', { requestTimeout: 2000 }, async (request) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 2000)
      return { method: 'POST' }
    })

    await fastify.ready()

    let response = await fastify.inject({ method: 'GET', url: '/' })
    t.assert.strictEqual(response.statusCode, 200)

    response = await fastify.inject({ method: 'POST', url: '/' })
    t.assert.strictEqual(response.statusCode, 200)
  })

  // @integration_test - Test requestTimeout option follows bodyLimit pattern
  await t.test('requestTimeout follows bodyLimit pattern', async (t) => {
    t.plan(4)

    const fastify = Fastify({
      routeTimeout: 30000,
      bodyLimit: 1024
    })

    fastify.get('/route1', { requestTimeout: 5000 }, async (request) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
      t.assert.strictEqual(request.routeOptions.bodyLimit, 1024)
      return { ok: true }
    })

    fastify.get('/route2', { bodyLimit: 2048 }, async (request) => {
      t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
      t.assert.strictEqual(request.routeOptions.bodyLimit, 2048)
      return { ok: true }
    })

    await fastify.ready()
  })
})
