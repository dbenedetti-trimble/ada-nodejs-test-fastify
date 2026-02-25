'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('..')
const {
  FST_ERR_ROUTE_REQUEST_TIMEOUT
} = require('../lib/errors')

test('Request Signal (AbortSignal)', async t => {
  // @covers_ACFR_4_1 - request.signal is an AbortSignal instance
  await t.test('request.signal is an AbortSignal instance', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.constructor.name, 'AbortSignal')
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_4_2 - request.signal.aborted is false before timeout/disconnect
  await t.test('request.signal.aborted is false initially', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 5000 }, async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @covers_ACFR_4_3 - request.signal.aborted is true after timeout fires
  await t.test('request.signal.aborted is true after timeout fires', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    let signalAbortedAfterTimeout = false

    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)

      // Set up listener to check signal state after timeout
      request.signal.addEventListener('abort', () => {
        signalAbortedAfterTimeout = request.signal.aborted
      })

      // Wait longer than the timeout to let it fire
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)
    t.assert.strictEqual(signalAbortedAfterTimeout, true)

    await fastify.close()
  })

  // @covers_ACFR_4_4 - request.signal.aborted is true after client disconnects
  await t.test('request.signal.aborted is true after client disconnects', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    let signalAborted = false

    fastify.get('/', async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)

      // Wait for client to disconnect
      await new Promise((resolve) => {
        request.signal.addEventListener('abort', () => {
          signalAborted = true
          resolve()
        })
        // If timeout, still resolve
        setTimeout(resolve, 500)
      })
    })

    await fastify.listen({ port: 0 })

    await new Promise((resolve) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, () => {
        // Should not reach here
      })

      // Abort the request after a short delay
      setTimeout(() => {
        req.destroy()
        setTimeout(() => {
          resolve()
        }, 100)
      }, 50)

      req.on('error', () => {
        // Expected error from abort
      })
    })

    t.assert.strictEqual(signalAborted, true)

    await fastify.close()
  })

  // @covers_ACFR_4_5 - request.signal.reason is FST_ERR_ROUTE_REQUEST_TIMEOUT when aborted by timeout
  await t.test('request.signal.reason is FST_ERR_ROUTE_REQUEST_TIMEOUT on timeout', async (t) => {
    t.plan(5)

    const fastify = Fastify()
    let abortReason = null

    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)
      t.assert.strictEqual(request.signal.reason, undefined)

      // Capture abort reason when it fires
      request.signal.addEventListener('abort', () => {
        abortReason = request.signal.reason
      })

      // Wait longer than the timeout to let it fire
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)
    t.assert.ok(abortReason instanceof FST_ERR_ROUTE_REQUEST_TIMEOUT)

    await fastify.close()
  })

  // @covers_ACFR_4_6 - Works with fetch(), events.on(), and other AbortSignal-aware APIs
  await t.test('request.signal works with AbortSignal-aware APIs', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    let operationAborted = false

    fastify.get('/events', { requestTimeout: 200 }, async (request, reply) => {
      t.assert.ok(request.signal)

      // Simulate async operation with AbortSignal
      await new Promise((resolve, reject) => {
        const abortHandler = () => {
          operationAborted = true
          resolve()
        }

        request.signal.addEventListener('abort', abortHandler)

        // Simulate long operation
        setTimeout(() => {
          resolve()
        }, 500)
      })
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/events`, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)
    t.assert.strictEqual(operationAborted, true)

    await fastify.close()
  })

  // @covers_ACFR_4_7 - For routes without timeout and no disconnect, signal never aborts
  await t.test('signal never aborts without timeout or disconnect', async (t) => {
    t.plan(4)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)

      // Wait a bit to ensure no abort happens
      await new Promise((resolve) => setTimeout(resolve, 100))

      t.assert.strictEqual(request.signal.aborted, false)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @unit_test - Signal available even without requestTimeout
  await t.test('signal is available even without requestTimeout', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    fastify.get('/', async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @unit_test - Signal abort listener works
  await t.test('signal abort event listener works', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    let abortFired = false

    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      t.assert.ok(request.signal)

      request.signal.addEventListener('abort', () => {
        abortFired = true
      })

      // Wait longer than the timeout to let it fire
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)
    t.assert.strictEqual(abortFired, true)

    await fastify.close()
  })

  // @integration_test - Signal abort works with global routeTimeout
  await t.test('signal abort works with global routeTimeout', async (t) => {
    t.plan(3)

    const fastify = Fastify({ routeTimeout: 200 })
    let signalAborted = false

    fastify.get('/', async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)

      request.signal.addEventListener('abort', () => {
        signalAborted = true
      })

      // Wait longer than the timeout to let it fire
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)

    await fastify.close()
  })

  // @integration_test - Signal does not abort when requestTimeout is 0
  await t.test('signal does not abort when requestTimeout is 0', async (t) => {
    t.plan(4)

    const fastify = Fastify({ routeTimeout: 5000 })

    fastify.get('/', { requestTimeout: 0 }, async (request, reply) => {
      t.assert.ok(request.signal)
      t.assert.strictEqual(request.signal.aborted, false)

      // Wait to ensure no abort
      await new Promise((resolve) => setTimeout(resolve, 100))

      t.assert.strictEqual(request.signal.aborted, false)
      return { hello: 'world' }
    })

    await fastify.ready()
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    t.assert.strictEqual(response.statusCode, 200)
  })

  // @integration_test - Multiple abort listeners work correctly
  await t.test('multiple abort listeners work correctly', async (t) => {
    t.plan(1)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      request.signal.addEventListener('abort', () => {
        // Listener fired
      })

      request.signal.addEventListener('abort', () => {
        // Listener fired
      })

      // Wait longer than the timeout to let it fire
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)

    await fastify.close()
  })

  // @integration_test - Signal abort prevents further async operations
  await t.test('signal abort can be used to stop async operations', async (t) => {
    t.plan(3)

    const fastify = Fastify()

    fastify.get('/', { requestTimeout: 200 }, async (request, reply) => {
      let operationCompleted = false

      const doAsyncOperation = async () => {
        return new Promise((resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            reject(new Error('Operation aborted'))
          })

          setTimeout(() => {
            operationCompleted = true
            resolve('completed')
          }, 500)
        })
      }

      try {
        await doAsyncOperation()
      } catch (err) {
        t.assert.strictEqual(err.message, 'Operation aborted')
        t.assert.strictEqual(operationCompleted, false)
      }

      return { aborted: true }
    })

    await fastify.listen({ port: 0 })

    const response = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          resolve({ statusCode: res.statusCode })
        })
      })
      req.on('error', reject)
    })

    t.assert.strictEqual(response.statusCode, 408)

    await fastify.close()
  })
})
