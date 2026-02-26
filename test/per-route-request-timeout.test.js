'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('..')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// @covers_ACFR_3_1 @covers_ACAPI_4_1 @covers_ACAPI_4_2 @unit_test
test('per-route requestTimeout triggers 408', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(res.json().error, 'Request Timeout')
  t.assert.strictEqual(res.json().message, 'Request Timeout')
})

// @covers_ACFR_6_1 @unit_test
test('request completes before timeout - no 408', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async () => {
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(res.json().success, true)
})

// @covers_ACAPI_3_1 @unit_test
test('request.signal is an AbortSignal', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return { success: true }
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

// @covers_ACFR_4_3 @covers_ACFR_4_5 @unit_test
test('request.signal aborts on timeout', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())
  let capturedSignal

  fastify.get('/', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// @covers_ACFR_5_1 @covers_ACFR_5_2 @covers_ACFR_5_3 @integration_test
test('onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  t.after(() => fastify.close())
  let hookCalled = false

  fastify.addHook('onTimeout', async (request, reply) => {
    hookCalled = true
    t.assert.ok(request)
    t.assert.ok(reply)
  })

  fastify.get('/', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(hookCalled, true)
})

// @covers_ACFR_5_4 @unit_test
test('onTimeout hook does not fire on normal completion', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())
  let hookCalled = false

  fastify.addHook('onTimeout', async () => {
    hookCalled = true
  })

  fastify.get('/', { requestTimeout: 5000 }, async () => {
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(hookCalled, false)
})

// @covers_ACFR_3_4 @integration_test
test('custom errorHandler can override 408', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.setErrorHandler((error, request, reply) => {
    if (error.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT') {
      reply.code(503).send({ custom: 'timeout error' })
    }
  })

  fastify.get('/', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 503)
  t.assert.strictEqual(res.json().custom, 'timeout error')
})

// @covers_ACFR_3_2 @unit_test
test('timeout after streaming started - logs warning, no second 408', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())
  let warningLogged = false

  fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
    reply.raw.write('chunk')
    const originalWarn = request.log.warn.bind(request.log)
    request.log.warn = (...args) => {
      warningLogged = true
      return originalWarn(...args)
    }
    await sleep(500)
    reply.raw.end()
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(warningLogged, true)
})

// @covers_ACFR_6_4 @unit_test
test('timer cleanup on normal completion - server closes cleanly', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/', { requestTimeout: 60000 }, async () => {
    return { success: true }
  })

  await fastify.inject({ method: 'GET', url: '/' })
  await fastify.close()
  t.assert.ok(true, 'server closed cleanly')
})

// @covers_ACAPI_3_1 @unit_test
test('request.signal works on route without requestTimeout', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return { success: true }
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

// @covers_ACFR_5_1 @integration_test
test('route-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())
  let hookCalled = false

  fastify.get('/', {
    requestTimeout: 200,
    onTimeout: async () => { hookCalled = true }
  }, async () => {
    await sleep(500)
    return { success: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(hookCalled, true)
})

// @covers_ACFR_3_3 @unit_test
test('timeout after reply.send() is a no-op - no double send', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
    reply.send({ done: true })
    await sleep(500)
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// @covers_ACFR_7_1 @covers_ACFR_7_2 @covers_ACFR_7_4 @covers_ACDP_4_1 @covers_ACDP_4_2 @unit_test
test('requestTimeout exposed in request.routeOptions', async (t) => {
  t.plan(3)
  const fastify = Fastify({ routeTimeout: 30000 })
  t.after(() => fastify.close())

  fastify.get('/with-timeout', { requestTimeout: 5000 }, async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
    return { success: true }
  })

  fastify.get('/default-timeout', async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
    return { success: true }
  })

  fastify.get('/no-timeout', { requestTimeout: 0 }, async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 0)
    return { success: true }
  })

  await fastify.inject({ method: 'GET', url: '/with-timeout' })
  await fastify.inject({ method: 'GET', url: '/default-timeout' })
  await fastify.inject({ method: 'GET', url: '/no-timeout' })
})

// @covers_ACFR_7_3 @covers_ACDP_4_2 @unit_test
test('requestTimeout in request.routeOptions is undefined when no timeout configured', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/no-timeout', async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
    return { success: true }
  })

  await fastify.inject({ method: 'GET', url: '/no-timeout' })
})

// @covers_ACFR_4_4 @integration_test
test('request.signal aborts on client disconnect', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  let capturedSignal

  fastify.get('/', async (request) => {
    capturedSignal = request.signal
    await sleep(5000)
    return { success: true }
  })

  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())

  const port = fastify.server.address().port
  await new Promise((resolve) => {
    const req = http.request({ port, path: '/' })
    req.on('error', resolve)
    req.end()
    setTimeout(() => req.destroy(), 50)
  })

  await sleep(100)
  t.assert.strictEqual(capturedSignal.aborted, true)
})
