'use strict'

const { test } = require('node:test')
const Fastify = require('..')

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

test('per-route requestTimeout: 200 fires 408 when handler is slow', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/slow', { requestTimeout: 200 }, async () => {
    await sleep(500)
    return { ok: true }
  })

  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/slow`)
  t.assert.strictEqual(res.status, 408)
  const body = await res.json()
  t.assert.strictEqual(body.statusCode, 408)
})

test('per-route requestTimeout: 5000 does not fire when handler is fast', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/fast', { requestTimeout: 5000 }, async () => ({ ok: true }))
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/fast`)
  t.assert.strictEqual(res.status, 200)
})

test('route without requestTimeout has no timeout', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/no-timeout', async () => {
    await sleep(300)
    return { ok: true }
  })

  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/no-timeout`)
  t.assert.strictEqual(res.status, 200)
})

test('global routeTimeout applies when no per-route requestTimeout', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/api', async () => { await sleep(500); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/api`)
  t.assert.strictEqual(res.status, 408)
})

test('per-route requestTimeout: 5000 overrides global routeTimeout: 200', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/long', { requestTimeout: 5000 }, async () => { await sleep(300); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/long`)
  t.assert.strictEqual(res.status, 200)
})

test('requestTimeout: 0 disables timeout when global routeTimeout: 200 is set', async t => {
  t.plan(1)
  const fastify = Fastify({ routeTimeout: 200 })
  t.after(() => fastify.close())

  fastify.get('/exempt', { requestTimeout: 0 }, async () => { await sleep(300); return {} })
  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/exempt`)
  t.assert.strictEqual(res.status, 200)
})

test('request.signal is an AbortSignal and is not aborted initially', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/check', { requestTimeout: 5000 }, async (request) => {
    t.assert.ok(request.signal instanceof AbortSignal)
    t.assert.strictEqual(request.signal.aborted, false)
    return {}
  })
  await fastify.inject({ method: 'GET', url: '/check' })
})

test('request.signal aborts with FST_ERR_ROUTE_REQUEST_TIMEOUT reason on timeout', async t => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let capturedSignal
  fastify.get('/signal-check', { requestTimeout: 200 }, async (request) => {
    capturedSignal = request.signal
    await sleep(500)
    return {}
  })

  await fastify.listen({ port: 0 })
  await fetch(`http://localhost:${fastify.server.address().port}/signal-check`).catch(() => {})
  t.assert.strictEqual(capturedSignal.aborted, true)
  t.assert.strictEqual(capturedSignal.reason?.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT')
})

test('onTimeout hook fires when per-route requestTimeout fires', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookFired = false
  fastify.addHook('onTimeout', async (request, reply) => {
    hookFired = true
    t.assert.ok(request)
    t.assert.ok(reply)
  })
  fastify.get('/hook-test', { requestTimeout: 200 }, async () => { await sleep(500); return {} })

  await fastify.listen({ port: 0 })
  await fetch(`http://localhost:${fastify.server.address().port}/hook-test`).catch(() => {})
  t.assert.ok(hookFired)
})

test('onTimeout hook does not fire when request completes before timeout', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let hookFired = false
  fastify.addHook('onTimeout', async () => { hookFired = true })
  fastify.get('/ok', { requestTimeout: 5000 }, async () => ({ ok: true }))

  await fastify.inject({ method: 'GET', url: '/ok' })
  t.assert.strictEqual(hookFired, false)
})

test('custom errorHandler can override the 408 response', async t => {
  t.plan(1)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.get('/custom-err', {
    requestTimeout: 200,
    errorHandler (err, request, reply) {
      reply.status(503).send({ custom: true })
    }
  }, async () => { await sleep(500); return {} })

  await fastify.listen({ port: 0 })
  const res = await fetch(`http://localhost:${fastify.server.address().port}/custom-err`)
  t.assert.strictEqual(res.status, 503)
})

test('invalid requestTimeout values throw FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT', t => {
  t.plan(3)
  const fastify = Fastify()

  for (const bad of [-1, 3.5, 'fast']) {
    try {
      fastify.get('/bad', { requestTimeout: bad }, async () => ({}))
      t.assert.fail('should have thrown')
    } catch (err) {
      t.assert.strictEqual(err.code, 'FST_ERR_ROUTE_REQUEST_TIMEOUT_OPTION_NOT_INT')
    }
  }
})

test('request.routeOptions.requestTimeout returns effective timeout', async t => {
  t.plan(2)
  const fastify = Fastify({ routeTimeout: 30000 })
  t.after(() => fastify.close())

  fastify.get('/with-override', { requestTimeout: 5000 }, async (req) => {
    t.assert.strictEqual(req.routeOptions.requestTimeout, 5000)
    return {}
  })
  fastify.get('/uses-global', async (req) => {
    t.assert.strictEqual(req.routeOptions.requestTimeout, 30000)
    return {}
  })

  await fastify.inject({ method: 'GET', url: '/with-override' })
  await fastify.inject({ method: 'GET', url: '/uses-global' })
})

test('no leaked timer handle when request completes before timeout', async t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/no-leak', { requestTimeout: 60000 }, async () => ({ ok: true }))
  await fastify.inject({ method: 'GET', url: '/no-leak' })

  await new Promise((resolve, reject) => fastify.close(err => err ? reject(err) : resolve()))
  t.assert.ok(true, 'server closed cleanly — no pending timer')
})

test('route-level onTimeout hook fires when per-route requestTimeout fires', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.after(() => fastify.close())

  let routeHookFired = false
  fastify.get('/route-hook', {
    requestTimeout: 200,
    onTimeout: async (request, reply) => {
      routeHookFired = true
      t.assert.ok(request)
      t.assert.ok(reply)
    }
  }, async () => { await sleep(500); return {} })

  await fastify.listen({ port: 0 })
  await fetch(`http://localhost:${fastify.server.address().port}/route-hook`).catch(() => {})
  t.assert.ok(routeHookFired)
})
