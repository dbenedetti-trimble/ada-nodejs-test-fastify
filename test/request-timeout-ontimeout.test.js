'use strict'

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const Fastify = require('..')

// @covers_ACFR_5_1 - App-level and route-level onTimeout hooks fire on per-route timeout
test('app-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.addHook('onTimeout', (request, reply, done) => {
    t.assert.ok(request, 'hook receives request object')
    t.assert.ok(reply, 'hook receives reply object')
    done()
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)

  await fastify.close()
})

// @covers_ACFR_5_1 - Route-level onTimeout hook fires on per-route timeout
test('route-level onTimeout hook fires on per-route timeout', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', {
    requestTimeout: 100,
    onTimeout: (request, reply, done) => {
      t.assert.ok(request, 'hook receives request object')
      t.assert.ok(reply, 'hook receives reply object')
      done()
    }
  }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)

  await fastify.close()
})

// @covers_ACFR_5_1 - Both app-level and route-level onTimeout hooks fire
test('both app-level and route-level onTimeout hooks fire on timeout', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  const hooksExecuted = []

  fastify.addHook('onTimeout', (request, reply, done) => {
    hooksExecuted.push('app')
    done()
  })

  fastify.get('/', {
    requestTimeout: 100,
    onTimeout: (request, reply, done) => {
      hooksExecuted.push('route')
      done()
    }
  }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)

  await fastify.close()
})

// @covers_ACFR_5_2 - Hook receives request and reply objects
test('onTimeout hook receives request and reply objects with correct properties', async (t) => {
  t.plan(6)

  const fastify = Fastify()

  fastify.addHook('onTimeout', (request, reply, done) => {
    t.assert.ok(request, 'request object is provided')
    t.assert.ok(reply, 'reply object is provided')
    t.assert.strictEqual(request.url, '/', 'request has correct url')
    t.assert.strictEqual(request.method, 'GET', 'request has correct method')
    t.assert.ok(request.log, 'request has logger')
    done()
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)

  await fastify.close()
})

// @covers_ACFR_5_3 - Hook fires before 408 error is sent
test('onTimeout hook fires before 408 error is sent', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.addHook('onTimeout', (request, reply, done) => {
    // Check that response hasn't been sent yet
    t.assert.strictEqual(reply.sent, false, 'reply.sent is false when hook fires')
    done()
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)

  await fastify.close()
})

// @covers_ACFR_5_4 - Hook does NOT fire for normal requests completing before timeout
test('onTimeout hook does not fire when request completes before timeout', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.addHook('onTimeout', (request, reply, done) => {
    t.assert.fail('onTimeout hook should not be called')
    done()
  })

  fastify.get('/', { requestTimeout: 500 }, async (request, reply) => {
    await sleep(50)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 200)

  await fastify.close()
})

// @covers_ACFR_5_4 - Multiple requests, only timed out ones fire the hook
test('onTimeout hook fires only for timed out requests', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  let timeoutCount = 0

  fastify.addHook('onTimeout', (request, reply, done) => {
    timeoutCount++
    done()
  })

  fastify.get('/fast', { requestTimeout: 500 }, async (request, reply) => {
    await sleep(50)
    return { result: 'fast' }
  })

  fastify.get('/slow', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { result: 'slow' }
  })

  await fastify.ready()

  const response1 = await fastify.inject({
    method: 'GET',
    url: '/fast'
  })

  const response2 = await fastify.inject({
    method: 'GET',
    url: '/slow'
  })

  const response3 = await fastify.inject({
    method: 'GET',
    url: '/fast'
  })

  t.assert.strictEqual(response1.statusCode, 200, 'first fast request succeeds')
  t.assert.strictEqual(response2.statusCode, 408, 'slow request times out')
  t.assert.strictEqual(response3.statusCode, 200, 'second fast request succeeds')

  await fastify.close()
})

// @covers_ACFR_5_5 - Existing socket-level onTimeout behavior unchanged
test('socket-level onTimeout hook still works for connection timeout', async (t) => {
  t.plan(2)

  const fastify = Fastify({ connectionTimeout: 500 })
  let socketTimeoutCalled = false

  fastify.addHook('onTimeout', (request, reply, done) => {
    socketTimeoutCalled = true
    done()
  })

  fastify.get('/', async (req, reply) => {
    await reply.send({ hello: 'world' })
  })

  fastify.get('/timeout', (req, reply) => {
    // Don't send response, let socket timeout
  })

  await fastify.ready()
  const address = await fastify.listen({ port: 0 })

  try {
    await fetch(`${address}/timeout`)
    t.assert.fail('Should have thrown an error')
  } catch (err) {
    t.assert.ok(err, 'socket timeout occurred')
  }

  // Give time for hook to execute
  await sleep(100)

  t.assert.ok(socketTimeoutCalled, 'onTimeout hook was called for socket timeout')

  await fastify.close()
})

// @covers_ACFR_5_5 - Per-route timeout and socket timeout both work independently
test('per-route timeout and socket timeout work independently', async (t) => {
  t.plan(2)

  const fastify = Fastify({ connectionTimeout: 1000 })

  fastify.get('/route-timeout', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { result: 'done' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/route-timeout'
  })

  t.assert.strictEqual(response.statusCode, 408, 'route timeout fires')
  t.assert.ok(response.json().message.includes('Request Timeout'), 'correct error message')

  await fastify.close()
})

// @unit_test - Hook can log timeout information
test('onTimeout hook can access request timeout configuration', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  let capturedTimeout = null

  fastify.addHook('onTimeout', (request, reply, done) => {
    capturedTimeout = request.routeOptions.requestTimeout
    done()
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)
  t.assert.strictEqual(capturedTimeout, 100, 'hook can access timeout value')

  await fastify.close()
})

// @unit_test - Multiple hooks execute in order
test('multiple onTimeout hooks execute in correct order', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  const executionOrder = []

  fastify.addHook('onTimeout', (request, reply, done) => {
    executionOrder.push('app-hook-1')
    done()
  })

  fastify.addHook('onTimeout', (request, reply, done) => {
    executionOrder.push('app-hook-2')
    done()
  })

  fastify.get('/', {
    requestTimeout: 100,
    onTimeout: [
      (request, reply, done) => {
        executionOrder.push('route-hook-1')
        done()
      },
      (request, reply, done) => {
        executionOrder.push('route-hook-2')
        done()
      }
    ]
  }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)
  t.assert.deepStrictEqual(executionOrder, [
    'app-hook-1',
    'app-hook-2',
    'route-hook-1',
    'route-hook-2'
  ], 'hooks execute in correct order')

  await fastify.close()
})

// @integration_test - onTimeout hook can modify logging behavior
test('onTimeout hook can perform custom logging', async (t) => {
  t.plan(3)

  const logs = []
  const fastify = Fastify({
    logger: {
      level: 'warn',
      stream: {
        write: (msg) => {
          logs.push(JSON.parse(msg))
        }
      }
    }
  })

  fastify.addHook('onTimeout', (request, reply, done) => {
    request.log.warn({
      url: request.url,
      timeout: request.routeOptions.requestTimeout
    }, 'custom timeout warning')
    done()
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  t.assert.strictEqual(response.statusCode, 408)
  
  const timeoutLog = logs.find(log => log.msg === 'custom timeout warning')
  t.assert.ok(timeoutLog, 'custom log message was written')
  t.assert.strictEqual(timeoutLog.timeout, 100, 'timeout value logged correctly')

  await fastify.close()
})

// @integration_test - onTimeout hook error handling
test('onTimeout hook errors are handled gracefully', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.addHook('onTimeout', (request, reply, done) => {
    done(new Error('Hook error'))
  })

  fastify.get('/', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })

  // Should still return 408 even if hook throws
  t.assert.strictEqual(response.statusCode, 408, '408 is still sent despite hook error')

  await fastify.close()
})

// @integration_test - onTimeout hook with encapsulation
test('onTimeout hook respects encapsulation', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  let globalHookCalled = false
  let pluginHookCalled = false

  fastify.addHook('onTimeout', (request, reply, done) => {
    globalHookCalled = true
    done()
  })

  fastify.register(async (instance) => {
    instance.addHook('onTimeout', (request, reply, done) => {
      pluginHookCalled = true
      done()
    })

    instance.get('/plugin', { requestTimeout: 100 }, async (request, reply) => {
      await sleep(200)
      return { hello: 'world' }
    })
  })

  fastify.get('/global', { requestTimeout: 100 }, async (request, reply) => {
    await sleep(200)
    return { hello: 'world' }
  })

  await fastify.ready()

  const response1 = await fastify.inject({
    method: 'GET',
    url: '/plugin'
  })

  t.assert.strictEqual(response1.statusCode, 408)

  const response2 = await fastify.inject({
    method: 'GET',
    url: '/global'
  })

  t.assert.strictEqual(response2.statusCode, 408)

  await fastify.close()
})
