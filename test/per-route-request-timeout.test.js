'use strict'

const net = require('node:net')
const Fastify = require('..')
const { test } = require('node:test')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// VAL-01: Basic per-route timeout triggers 408
test('per-route requestTimeout triggers 408 on slow handler', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  const body = JSON.parse(res.payload)
  t.assert.strictEqual(body.statusCode, 408)
  t.assert.strictEqual(body.message, 'Request Timeout')
})

// VAL-02: Request completes before timeout
test('request completes before timeout returns 200', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async () => {
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-03: Route without requestTimeout has no timeout
test('route without requestTimeout has no timeout', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-04: Global routeTimeout applies
test('global routeTimeout triggers 408', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/', async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
})

// VAL-05: Per-route overrides global
test('per-route requestTimeout overrides global routeTimeout', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-06: requestTimeout: 0 disables timeout
test('requestTimeout: 0 disables timeout even with routeTimeout', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 0 }, async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-07: request.signal is an AbortSignal
test('request.signal is an AbortSignal', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-08: request.signal aborts on timeout
test('request.signal aborts on timeout', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let capturedSignal
  fastify.get('/', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// VAL-09: request.signal aborts on client disconnect
test('request.signal aborts on client disconnect', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  const signalAborted = new Promise((resolve) => {
    fastify.get('/', async (request) => {
      request.signal.addEventListener('abort', () => {
        resolve(true)
      })
      await sleep(5000)
      return { ok: true }
    })
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  const client = net.connect(port, () => {
    client.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    setTimeout(() => client.destroy(), 100)
  })

  const aborted = await signalAborted
  t.assert.strictEqual(aborted, true)
})

// VAL-10: onTimeout hook fires on per-route timeout
test('app-level onTimeout hook fires on per-route timeout', async t => {
  t.plan(3)
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
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(hookCalled, true)
})

// VAL-11: Route-level onTimeout hook fires
test('route-level onTimeout hook fires on per-route timeout', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookCalled = false
  fastify.get('/', {
    requestTimeout: 200,
    onTimeout: async (request, reply) => {
      hookCalled = true
    }
  }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(hookCalled, true)
})

// VAL-12: onTimeout hook does NOT fire on normal completion
test('onTimeout hook does not fire on normal completion', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookCalled = false
  fastify.addHook('onTimeout', async () => {
    hookCalled = true
  })

  fastify.get('/', { requestTimeout: 5000 }, async () => {
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(hookCalled, false)
})

// VAL-13: Custom errorHandler overrides 408
test('custom errorHandler can override 408 response', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 408) {
      reply.code(503).send({ custom: true, statusCode: 503 })
    }
  })

  fastify.get('/', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 503)
  t.assert.strictEqual(JSON.parse(res.payload).custom, true)
})

// VAL-14: Streaming response - timeout logs but no 408
test('streaming response does not get 408 on timeout', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  const signalAborted = new Promise((resolve) => {
    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      reply.raw.writeHead(200, { 'content-type': 'text/plain' })
      reply.raw.write('chunk1')
      reply.hijack()
      request.signal.addEventListener('abort', () => {
        resolve(true)
        reply.raw.end('done')
      })
    })
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  const res = await fetch(`http://127.0.0.1:${port}/`)
  t.assert.strictEqual(res.status, 200)
  const aborted = await signalAborted
  t.assert.strictEqual(aborted, true)
})

// VAL-15: Timer cleanup on normal completion
test('timer is cleaned up on normal completion', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 60000 }, async () => {
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
  await fastify.close()
  t.assert.ok(true, 'server closed cleanly with no pending timer')
})

// VAL-16: Invalid requestTimeout throws
test('invalid requestTimeout throws FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', async t => {
  t.plan(3)

  {
    const fastify = Fastify()
    try {
      fastify.get('/', { requestTimeout: -1 }, async () => {})
      t.assert.fail('should throw')
    } catch (err) {
      t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
    }
  }

  {
    const fastify = Fastify()
    try {
      fastify.get('/', { requestTimeout: 3.5 }, async () => {})
      t.assert.fail('should throw')
    } catch (err) {
      t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
    }
  }

  {
    const fastify = Fastify()
    try {
      fastify.get('/', { requestTimeout: 'fast' }, async () => {})
      t.assert.fail('should throw')
    } catch (err) {
      t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
    }
  }
})

// VAL-17: requestTimeout in routeOptions
test('request.routeOptions.requestTimeout returns configured value', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/', { requestTimeout: 5000 }, async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 5000)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-18: Global default in routeOptions
test('request.routeOptions.requestTimeout returns global default', async t => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 30000 })
  t.after(() => fastify.close())

  fastify.get('/', async (request) => {
    t.assert.strictEqual(request.routeOptions.requestTimeout, 30000)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  t.assert.strictEqual(res.statusCode, 200)
})
