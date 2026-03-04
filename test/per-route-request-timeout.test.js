'use strict'

const { test } = require('node:test')
const Fastify = require('..')
const { FST_ERR_ROUTE_REQUEST_TIMEOUT, FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT } = require('../lib/errors')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// VAL-01: Basic per-route timeout triggers 408
test('per-route requestTimeout triggers 408 when handler exceeds timeout', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/slow', { requestTimeout: 50 }, async () => {
    await sleep(200)
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
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/fast' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-03: Route without requestTimeout has no timeout
test('route without requestTimeout has no timeout', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/no-timeout', async () => {
    await sleep(100)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-timeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-04: Global routeTimeout applies
test('global routeTimeout triggers 408 when handler exceeds timeout', async (t) => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 50 })

  fastify.get('/default-timeout', async () => {
    await sleep(200)
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
  const fastify = Fastify({ routeTimeout: 50 })

  fastify.get('/long-route', { requestTimeout: 5000 }, async () => {
    await sleep(100)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/long-route' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-06: requestTimeout: 0 disables timeout
test('requestTimeout: 0 disables timeout even when routeTimeout is set', async (t) => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 50 })

  fastify.get('/no-timeout', { requestTimeout: 0 }, async () => {
    await sleep(100)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-timeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-07: request.signal is an AbortSignal
test('request.signal is an AbortSignal and not aborted before timeout', async (t) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/signal', { requestTimeout: 5000 }, async (request) => {
    t.assert.strictEqual(request.signal instanceof AbortSignal, true)
    t.assert.strictEqual(request.signal.aborted, false)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/signal' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-08: request.signal aborts on timeout
test('request.signal aborts on timeout with FST_ERR_ROUTE_REQUEST_TIMEOUT reason', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  let capturedSignal

  fastify.get('/signal-timeout', { requestTimeout: 50 }, async (request) => {
    capturedSignal = request.signal
    await sleep(200)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/signal-timeout' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// VAL-09: request.signal aborts on client disconnect
test('request.signal exists on every request without timeout', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/signal-no-timeout', async (request) => {
    t.assert.strictEqual(request.signal instanceof AbortSignal, true)
    t.assert.strictEqual(request.signal.aborted, false)
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/signal-no-timeout' })
})

// VAL-10: onTimeout hook fires on per-route timeout
test('app-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  let hookFired = false

  fastify.addHook('onTimeout', async (request, reply) => {
    hookFired = true
    t.assert.strictEqual(typeof request, 'object')
    t.assert.strictEqual(typeof reply, 'object')
  })

  fastify.get('/hook-timeout', { requestTimeout: 50 }, async () => {
    await sleep(200)
    return { ok: true }
  })

  await fastify.inject({ method: 'GET', url: '/hook-timeout' })
  t.assert.strictEqual(hookFired, true)
})

// VAL-11: Route-level onTimeout hook fires
test('route-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  let hookFired = false

  fastify.get('/route-hook-timeout', {
    requestTimeout: 50,
    onTimeout: async () => { hookFired = true }
  }, async () => {
    await sleep(200)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/route-hook-timeout' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(hookFired, true)
})

// VAL-12: onTimeout hook does NOT fire on normal completion
test('onTimeout hook does not fire when request completes before timeout', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  let hookFired = false

  fastify.addHook('onTimeout', async () => { hookFired = true })

  fastify.get('/no-fire', { requestTimeout: 5000 }, async () => {
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-fire' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(hookFired, false)
})

// VAL-13: Custom errorHandler overrides 408
test('custom errorHandler can override 408 response', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/custom-error', {
    requestTimeout: 50,
    errorHandler: (_error, _request, reply) => {
      reply.code(503).send({ custom: 'Service Unavailable' })
    }
  }, async () => {
    await sleep(200)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/custom-error' })
  t.assert.strictEqual(res.statusCode, 503)
  const body = JSON.parse(res.payload)
  t.assert.strictEqual(body.custom, 'Service Unavailable')
})

// VAL-15: Timer cleanup on normal completion
test('timer is cleaned up when request completes before timeout', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/cleanup', { requestTimeout: 60000 }, async () => {
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/cleanup' })
  t.assert.strictEqual(res.statusCode, 200)
  await fastify.close()
})

// VAL-16: Invalid requestTimeout throws
test('invalid requestTimeout values throw FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', (t) => {
  t.plan(3)

  const fastify1 = Fastify()
  try {
    fastify1.get('/bad', { requestTimeout: -1 }, async () => {})
    t.assert.fail('should throw')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
  }

  const fastify2 = Fastify()
  try {
    fastify2.get('/bad', { requestTimeout: 3.5 }, async () => {})
    t.assert.fail('should throw')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
  }

  const fastify3 = Fastify()
  try {
    fastify3.get('/bad', { requestTimeout: 'fast' }, async () => {})
    t.assert.fail('should throw')
  } catch (err) {
    t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
  }
})

// VAL-17: requestTimeout in routeOptions
test('request.routeOptions.requestTimeout returns the route timeout value', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  let capturedTimeout

  fastify.get('/route-opts', { requestTimeout: 5000 }, async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/route-opts' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, 5000)
})

// VAL-18: Global default in routeOptions
test('request.routeOptions.requestTimeout returns global routeTimeout when per-route not set', async (t) => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 30000 })
  let capturedTimeout

  fastify.get('/global-opts', async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/global-opts' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, 30000)
})

// routeOptions.requestTimeout returns undefined when no timeout configured
test('request.routeOptions.requestTimeout returns undefined when no timeout configured', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  let capturedTimeout

  fastify.get('/no-opts', async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-opts' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, undefined)
})

// routeOptions.requestTimeout returns 0 when explicitly disabled
test('request.routeOptions.requestTimeout returns 0 when explicitly disabled', async (t) => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 5000 })
  let capturedTimeout

  fastify.get('/disabled', { requestTimeout: 0 }, async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/disabled' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, 0)
})

// routeTimeout exposed via initialConfig
test('routeTimeout is exposed via fastify.initialConfig.routeTimeout', async (t) => {
  t.plan(2)
  const fastify1 = Fastify({ routeTimeout: 30000 })
  t.assert.strictEqual(fastify1.initialConfig.routeTimeout, 30000)

  const fastify2 = Fastify()
  t.assert.strictEqual(fastify2.initialConfig.routeTimeout, 0)
})

// No timer when neither routeTimeout nor requestTimeout set
test('no timer created when neither routeTimeout nor requestTimeout is set', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/no-timer', async () => {
    await sleep(50)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/no-timer' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-14: Streaming response - timeout logs but no 408
test('streaming response: timeout aborts signal but does not send 408', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  let capturedSignal

  fastify.get('/stream', { requestTimeout: 50 }, async (request, reply) => {
    capturedSignal = request.signal
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' })
    reply.raw.write('partial')
    await sleep(200)
    reply.raw.end('done')
    return reply
  })

  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())
  const res = await fetch(`http://localhost:${fastify.server.address().port}/stream`)
  t.assert.strictEqual(res.status, 200)
  const body = await res.text()
  t.assert.ok(body.includes('partial'), 'response contains streamed data')
  t.assert.strictEqual(capturedSignal.aborted, true, 'signal aborted after timeout')
})

// VAL-09: request.signal aborts on client disconnect
test('request.signal aborts when client disconnects', async (t) => {
  t.plan(1)
  const net = require('node:net')
  const fastify = Fastify()
  let signalAbortedPromiseResolve
  const signalAbortedPromise = new Promise((resolve) => { signalAbortedPromiseResolve = resolve })

  fastify.get('/disconnect', async (request) => {
    request.signal.addEventListener('abort', () => {
      signalAbortedPromiseResolve(true)
    })
    await sleep(5000)
    return { ok: true }
  })

  await fastify.listen({ port: 0 })
  t.after(() => fastify.close())
  const port = fastify.server.address().port

  const client = net.connect(port, '127.0.0.1', () => {
    client.write('GET /disconnect HTTP/1.1\r\nHost: localhost\r\n\r\n')
    setTimeout(() => { client.destroy() }, 50)
  })

  const aborted = await signalAbortedPromise
  t.assert.strictEqual(aborted, true, 'signal aborted on client disconnect')
})

// Error code class check
test('FST_ERR_ROUTE_REQUEST_TIMEOUT has correct properties', (t) => {
  t.plan(3)
  const err = new FST_ERR_ROUTE_REQUEST_TIMEOUT()
  t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
  t.assert.strictEqual(err.statusCode, 408)
  t.assert.strictEqual(err.message, 'Request Timeout')
})

test('FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT has correct properties', (t) => {
  t.plan(2)
  const err = new FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT('foo')
  t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
  t.assert.strictEqual(err.message.includes('foo'), true)
})
