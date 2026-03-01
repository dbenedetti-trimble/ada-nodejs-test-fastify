'use strict'

const { test } = require('node:test')
const { connect } = require('node:net')
const split = require('split2')
const pino = require('pino')
const fastify = require('..')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// VAL-01: Basic per-route timeout triggers 408
test('VAL-01: per-route timeout triggers 408', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/slow', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/slow' })
  t.assert.strictEqual(res.statusCode, 408)
  const body = res.json()
  t.assert.ok(body.message.includes('Request Timeout') || body.error.includes('Request Timeout'))
})

// VAL-02: Request completes before timeout
test('VAL-02: request completes before timeout returns 200', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/fast', { requestTimeout: 5000 }, async () => {
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/fast' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-03: Route without requestTimeout has no timeout
test('VAL-03: route without requestTimeout has no timeout', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/notimeout', async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/notimeout' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-04: Global routeTimeout applies
test('VAL-04: global routeTimeout triggers 408', async (t) => {
  const app = fastify({ routeTimeout: 200 })
  t.after(() => app.close())

  app.get('/slow', async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/slow' })
  t.assert.strictEqual(res.statusCode, 408)
})

// VAL-05: Per-route overrides global
test('VAL-05: per-route requestTimeout overrides global routeTimeout', async (t) => {
  const app = fastify({ routeTimeout: 200 })
  t.after(() => app.close())

  app.get('/override', { requestTimeout: 5000 }, async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/override' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-06: requestTimeout: 0 disables timeout
test('VAL-06: requestTimeout: 0 disables timeout even with global routeTimeout', async (t) => {
  const app = fastify({ routeTimeout: 200 })
  t.after(() => app.close())

  app.get('/disable', { requestTimeout: 0 }, async () => {
    await sleep(300)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/disable' })
  t.assert.strictEqual(res.statusCode, 200)
})

// VAL-07: request.signal is an AbortSignal
test('VAL-07: request.signal is an AbortSignal with aborted=false', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let capturedSignal

  app.get('/signal', { requestTimeout: 5000 }, async (request) => {
    capturedSignal = request.signal
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/signal' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(capturedSignal instanceof AbortSignal)
  t.assert.strictEqual(capturedSignal.aborted, false)
})

// VAL-08: request.signal aborts on timeout
test('VAL-08: request.signal.aborted is true after timeout', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let capturedSignal
  let capturedReason

  app.get('/signalabort', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/signalabort' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.ok(capturedSignal instanceof AbortSignal)
  t.assert.strictEqual(capturedSignal.aborted, true)
  capturedReason = capturedSignal.reason
  t.assert.ok(capturedReason)
  t.assert.strictEqual(capturedReason.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// VAL-10: onTimeout hook fires on per-route timeout
test('VAL-10: onTimeout hook fires on per-route timeout', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let hookFired = false

  app.addHook('onTimeout', async (request, reply) => {
    hookFired = true
  })

  app.get('/hooktimeout', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/hooktimeout' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(hookFired, true)
})

// VAL-11: Route-level onTimeout hook fires
test('VAL-11: route-level onTimeout hook fires on per-route timeout', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let routeHookFired = false

  app.get('/routehook', {
    requestTimeout: 200,
    onTimeout: async (request, reply) => {
      routeHookFired = true
    }
  }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/routehook' })
  t.assert.strictEqual(res.statusCode, 408)
  t.assert.strictEqual(routeHookFired, true)
})

// VAL-12: onTimeout hook does NOT fire on normal completion
test('VAL-12: onTimeout hook does NOT fire on normal completion', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let hookFired = false

  app.addHook('onTimeout', async () => {
    hookFired = true
  })

  app.get('/normalcompletion', { requestTimeout: 5000 }, async () => {
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/normalcompletion' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(hookFired, false)
})

// VAL-13: Custom errorHandler overrides 408
test('VAL-13: custom errorHandler can override 408 response', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/customerr', {
    requestTimeout: 200,
    errorHandler: (err, request, reply) => {
      reply.status(503).send({ custom: true, code: err.code })
    }
  }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/customerr' })
  t.assert.strictEqual(res.statusCode, 503)
  const body = res.json()
  t.assert.strictEqual(body.custom, true)
  t.assert.strictEqual(body.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

// VAL-15: Timer cleanup on normal completion - server closes cleanly
test('VAL-15: timer is cleared on normal completion, server closes cleanly', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/cleanup', { requestTimeout: 60000 }, async () => {
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/cleanup' })
  t.assert.strictEqual(res.statusCode, 200)
  // If timer was not cleared, server.close() in t.after would hang
})

// VAL-16: Invalid requestTimeout throws
test('VAL-16: invalid requestTimeout throws FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  t.assert.throws(() => {
    app.get('/invalid', { requestTimeout: -1 }, async () => {})
  }, (err) => {
    return err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT'
  })

  t.assert.throws(() => {
    app.get('/invalid2', { requestTimeout: 3.5 }, async () => {})
  }, (err) => {
    return err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT'
  })

  t.assert.throws(() => {
    app.get('/invalid3', { requestTimeout: 'fast' }, async () => {})
  }, (err) => {
    return err.code === 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT'
  })
})

// VAL-17: requestTimeout in routeOptions
test('VAL-17: requestTimeout is available in request.routeOptions', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let capturedTimeout

  app.get('/routeopts', { requestTimeout: 5000 }, async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/routeopts' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, 5000)
})

// VAL-18: Global default in routeOptions
test('VAL-18: global routeTimeout exposed via request.routeOptions.requestTimeout', async (t) => {
  const app = fastify({ routeTimeout: 30000 })
  t.after(() => app.close())

  let capturedTimeout

  app.get('/globalrouteopts', async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/globalrouteopts' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, 30000)
})

// VAL-19: No regressions - route without timeout returns undefined in routeOptions
test('VAL-19: route without timeout has undefined requestTimeout in routeOptions', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let capturedTimeout = 'NOT_SET'

  app.get('/notimeout2', async (request) => {
    capturedTimeout = request.routeOptions.requestTimeout
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/notimeout2' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.strictEqual(capturedTimeout, undefined)
})

// Additional: request.signal is always available (even without timeout)
test('request.signal is always an AbortSignal even without timeout configured', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  let capturedSignal

  app.get('/alwayssignal', async (request) => {
    capturedSignal = request.signal
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/alwayssignal' })
  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(capturedSignal instanceof AbortSignal)
  t.assert.strictEqual(capturedSignal.aborted, false)
})

// Additional: routeTimeout: 0 is not a valid constructor option (non-negative int, 0 is ok)
test('routeTimeout: 0 on constructor is valid and disables global timeout', async (t) => {
  const app = fastify({ routeTimeout: 0 })
  t.after(() => app.close())

  app.get('/zero', async () => {
    await sleep(100)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/zero' })
  t.assert.strictEqual(res.statusCode, 200)
})

// Additional: 408 body has proper structure
test('408 response body has proper Fastify error structure', async (t) => {
  const app = fastify()
  t.after(() => app.close())

  app.get('/body', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  const res = await app.inject({ method: 'GET', url: '/body' })
  t.assert.strictEqual(res.statusCode, 408)
  const body = res.json()
  t.assert.strictEqual(body.statusCode, 408)
  t.assert.ok(body.error)
  t.assert.ok(body.message)
})

// VAL-09: request.signal aborts on client disconnect
test('VAL-09: request.signal aborts on client disconnect', (t, done) => {
  t.plan(2)
  const app = fastify()
  t.after(() => app.close())

  let capturedSignal
  let resolveHandlerReached
  const handlerReached = new Promise(resolve => { resolveHandlerReached = resolve })

  app.get('/disconnect', async (request) => {
    capturedSignal = request.signal
    resolveHandlerReached()
    await sleep(5000)
    return {}
  })

  app.listen({ port: 0 }, (err) => {
    t.assert.ifError(err)
    const port = app.server.address().port
    const socket = connect(port)
    socket.write('GET /disconnect HTTP/1.1\r\nHost: localhost\r\n\r\n')

    handlerReached.then(() => {
      socket.destroy()
      sleep(100).then(() => {
        t.assert.strictEqual(capturedSignal.aborted, true)
        done()
      })
    })
  })
})

// VAL-14: streaming response - timeout fires but no 408 sent, warning logged
test('VAL-14: streaming response - timeout logs warning but no 408', async (t) => {
  t.plan(3)
  const logStream = split(JSON.parse)
  const loggerInstance = pino({ level: 'warn' }, logStream)
  const app = fastify({ loggerInstance })
  t.after(() => app.close())

  let capturedSignal
  const warningMessages = []

  logStream.on('data', (line) => {
    if (line.msg) warningMessages.push(line.msg)
  })

  app.get('/streaming', { requestTimeout: 200 }, async (request, reply) => {
    capturedSignal = request.signal
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' })
    reply.raw.write('chunk1')
    await sleep(500)
    reply.raw.end()
  })

  await app.listen({ port: 0 })
  const res = await fetch(`http://localhost:${app.server.address().port}/streaming`)
  t.assert.strictEqual(res.status, 200)
  t.assert.strictEqual(capturedSignal.aborted, true)
  await sleep(50)
  t.assert.ok(
    warningMessages.some(m => m.includes('per-route timeout fired but response already sent')),
    'warning was logged for streaming timeout'
  )
})
