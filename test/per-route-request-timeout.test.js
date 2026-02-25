'use strict'

const { test } = require('node:test')
const Fastify = require('..')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// VAL-01: Basic per-route timeout triggers 408
test('per-route requestTimeout triggers 408 when handler exceeds timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/slow', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/slow' })
  t.assert.strictEqual(res.statusCode, 408)
  const body = JSON.parse(res.payload)
  t.assert.strictEqual(body.statusCode, 408)
  t.assert.strictEqual(body.message, 'Request Timeout')
})

// VAL-02: Request completes before timeout
test('request completes before timeout returns 200', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.get('/fast', { requestTimeout: 5000 }, async () => {
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/fast' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-03: Route without requestTimeout has no timeout
test('route without requestTimeout has no timeout behavior', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.get('/no-timeout', async () => {
    await sleep(300)
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-timeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-04: Global routeTimeout applies
test('global routeTimeout causes 408 when handler exceeds it', async (t) => {
  t.plan(2)

  const fastify = Fastify({ routeTimeout: 200 })

  fastify.get('/default-timeout', async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/default-timeout' })
  t.assert.strictEqual(res.statusCode, 408)
  const body = JSON.parse(res.payload)
  t.assert.strictEqual(body.message, 'Request Timeout')
})

// VAL-05: Per-route overrides global
test('per-route requestTimeout overrides global routeTimeout', async (t) => {
  t.plan(1)

  const fastify = Fastify({ routeTimeout: 200 })

  fastify.get('/override', { requestTimeout: 5000 }, async () => {
    await sleep(300)
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/override' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-06: requestTimeout: 0 disables timeout
test('requestTimeout: 0 disables timeout even with global routeTimeout', async (t) => {
  t.plan(1)

  const fastify = Fastify({ routeTimeout: 200 })

  fastify.get('/no-timeout', { requestTimeout: 0 }, async () => {
    await sleep(300)
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-timeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-07: request.signal is an AbortSignal
test('request.signal is an AbortSignal that is not aborted before timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/signal', { requestTimeout: 5000 }, async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return { hasSignal: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/signal' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-08: request.signal aborts on timeout
test('request.signal aborts on timeout with FST_ERR_ROUTE_REQUEST_TIMEOUT reason', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  let capturedSignal

  fastify.get('/signal-timeout', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/signal-timeout' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// VAL-10: onTimeout hook fires on per-route timeout
test('app-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  let hookFired = false

  fastify.addHook('onTimeout', async (request, reply) => {
    hookFired = true
    t.assert.ok(request)
    t.assert.ok(reply)
  })

  fastify.get('/hook-timeout', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/hook-timeout' })
  t.assert.strictEqual(hookFired, true)
})

// VAL-11: Route-level onTimeout hook fires
test('route-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  let hookFired = false

  fastify.get('/route-hook', {
    requestTimeout: 200,
    onTimeout: async () => {
      hookFired = true
    }
  }, async () => {
    await sleep(500)
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/route-hook' })
  t.assert.strictEqual(hookFired, true)
})

// VAL-12: onTimeout hook does NOT fire on normal completion
test('onTimeout hook does not fire when request completes normally', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  let hookFired = false

  fastify.addHook('onTimeout', async () => {
    hookFired = true
  })

  fastify.get('/no-hook', { requestTimeout: 5000 }, async () => {
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-hook' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(hookFired, false)
})

// VAL-13: Custom errorHandler overrides 408
test('custom errorHandler can override 408 response', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.get('/custom-error', {
    requestTimeout: 200,
    errorHandler: (error, request, reply) => {
      if (error.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT') {
        reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Custom timeout' })
      } else {
        reply.send(error)
      }
    }
  }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/custom-error' })
  t.assert.strictEqual(res.statusCode, 503)
  const body = JSON.parse(res.payload)
  t.assert.strictEqual(body.message, 'Custom timeout')
})

// VAL-15: Timer cleanup on normal completion (server closes cleanly)
test('timer is cleaned up when request completes before timeout', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.get('/cleanup', { requestTimeout: 60000 }, async () => {
    return { status: 'ok' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/cleanup' })
  t.assert.strictEqual(res.statusCode, 200)
  await fastify.close()
})

// VAL-16: Invalid requestTimeout throws
test('invalid requestTimeout values throw FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  t.assert.throws(() => {
    fastify.get('/bad1', { requestTimeout: -1 }, async () => {})
  }, (err) => err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')

  t.assert.throws(() => {
    fastify.get('/bad2', { requestTimeout: 3.5 }, async () => {})
  }, (err) => err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')

  t.assert.throws(() => {
    fastify.get('/bad3', { requestTimeout: 'fast' }, async () => {})
  }, (err) => err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
})

// VAL-16b: Invalid routeTimeout on constructor throws
test('invalid routeTimeout on constructor throws', async (t) => {
  t.plan(2)

  t.assert.throws(() => {
    Fastify({ routeTimeout: -1 })
  }, (err) => err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')

  t.assert.throws(() => {
    Fastify({ routeTimeout: 3.5 })
  }, (err) => err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
})

// VAL-17: requestTimeout in routeOptions
test('request.routeOptions.requestTimeout returns route timeout value', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.get('/opts', { requestTimeout: 5000 }, async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/opts' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-18: Global default in routeOptions
test('request.routeOptions.requestTimeout returns global routeTimeout when no per-route set', async (t) => {
  t.plan(2)

  const fastify = Fastify({ routeTimeout: 30000 })

  fastify.get('/global-opts', async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/global-opts' })
  t.assert.strictEqual(res.statusCode, 200)
})

// routeTimeout in initialConfig
test('routeTimeout is exposed via fastify.initialConfig.routeTimeout', async (t) => {
  t.plan(1)

  const initialConfig = Fastify({ routeTimeout: 30000 }).initialConfig
  t.assert.strictEqual(initialConfig.routeTimeout, 30000)
})

test('routeTimeout defaults to 0 in initialConfig', async (t) => {
  t.plan(1)

  const initialConfig = Fastify().initialConfig
  t.assert.strictEqual(initialConfig.routeTimeout, 0)
})

// request.routeOptions.requestTimeout is undefined when no timeout configured
test('requestTimeout is undefined in routeOptions when no timeout configured', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.get('/no-opts', async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-opts' })
  t.assert.strictEqual(res.statusCode, 200)
})

// Signal exists even without timeout
test('request.signal exists even for routes without timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/signal-no-timeout', async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/signal-no-timeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// requestTimeout: 0 returns 0 in routeOptions
test('requestTimeout 0 explicitly set returns 0 from routeOptions as undefined (disabled)', async (t) => {
  t.plan(2)

  const fastify = Fastify({ routeTimeout: 5000 })

  fastify.get('/zero', { requestTimeout: 0 }, async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, undefined)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/zero' })
  t.assert.strictEqual(res.statusCode, 200)
})
