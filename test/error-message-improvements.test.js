'use strict'

const { test } = require('node:test')
const Fastify = require('../fastify')

// IMP-1: Enhanced "already started" error messages

test('FST_ERR_INSTANCE_ALREADY_LISTENING includes guidance for addHook after start', (t, done) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    t.after(() => fastify.close())

    try {
      fastify.addHook('onRequest', async (req, reply) => {})
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('inside a plugin register function'))
    } finally {
      done()
    }
  })
})

test('FST_ERR_INSTANCE_ALREADY_LISTENING includes "addHook" in message', (t, done) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    t.after(() => fastify.close())

    try {
      fastify.addHook('onRequest', async (req, reply) => {})
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('addHook'))
    } finally {
      done()
    }
  })
})

test('FST_ERR_INSTANCE_ALREADY_LISTENING for route shorthand after start includes guidance', (t, done) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    t.after(() => fastify.close())

    try {
      fastify.get('/test', async () => 'test')
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('inside a plugin register function'))
    } finally {
      done()
    }
  })
})

test('FST_ERR_INSTANCE_ALREADY_LISTENING for addSchema after start includes guidance', (t, done) => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', async () => 'ok')

  fastify.listen({ port: 0 }, err => {
    t.assert.ifError(err)
    t.after(() => fastify.close())

    try {
      fastify.addSchema({ $id: 'test', type: 'object' })
      t.assert.fail('should have thrown')
    } catch (e) {
      t.assert.strictEqual(e.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
      t.assert.ok(e.message.includes('inside a plugin register function'))
    } finally {
      done()
    }
  })
})

// IMP-2: Hook name in async arity validation errors

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name "onRequest"', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'))
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name "onSend"', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onSend', async (req, reply, payload, done) => {})
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'))
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level preHandler', async t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get('/', {
      preHandler: [async (req, reply, done) => {}]
    }, async () => 'ok')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'))
  }
})

test('FST_ERR_HOOK_INVALID_ASYNC_HANDLER includes hook name for route-level preSerialization', async t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get('/', {
      preSerialization: [async (req, reply, payload, done) => {}]
    }, async () => 'ok')
    t.assert.fail('should have thrown')
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preSerialization'))
  }
})

// IMP-3: Warn when async route handler resolves without sending a response

test('FSTWRN005 fires when async handler returns undefined without reply.send()', async t => {
  t.plan(3)
  const fastify = Fastify()

  let warningEmitted = null
  const warningListener = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warningEmitted = warning
    }
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.removeListener('warning', warningListener)
    fastify.close()
  })

  fastify.get('/no-response', async (req, reply) => {
    // intentionally does not return or call reply.send()
  })

  await fastify.inject({ method: 'GET', url: '/no-response' })

  t.assert.ok(warningEmitted !== null, 'warning should have been emitted')
  t.assert.ok(warningEmitted.message.includes('GET'), 'warning should include method')
  t.assert.ok(warningEmitted.message.includes('/no-response'), 'warning should include route url')
})

test('FSTWRN005 does not fire when async handler returns a value', async t => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  const warningListener = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warningEmitted = true
    }
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.removeListener('warning', warningListener)
    fastify.close()
  })

  fastify.get('/with-value', async (req, reply) => {
    return { hello: 'world' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/with-value' })

  t.assert.strictEqual(warningEmitted, false, 'no warning should be emitted')
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

test('FSTWRN005 does not fire when async handler calls reply.send() explicitly', async t => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  const warningListener = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warningEmitted = true
    }
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.removeListener('warning', warningListener)
    fastify.close()
  })

  fastify.get('/explicit-send', async (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const res = await fastify.inject({ method: 'GET', url: '/explicit-send' })

  t.assert.strictEqual(warningEmitted, false, 'no warning should be emitted')
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

test('FSTWRN005 does not fire when async handler returns reply object', async t => {
  t.plan(2)
  const fastify = Fastify()

  let warningEmitted = false
  const warningListener = (warning) => {
    if (warning.code === 'FSTWRN005') {
      warningEmitted = true
    }
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.removeListener('warning', warningListener)
    fastify.close()
  })

  fastify.get('/return-reply', async (req, reply) => {
    reply.send({ hello: 'world' })
    return reply
  })

  const res = await fastify.inject({ method: 'GET', url: '/return-reply' })

  t.assert.strictEqual(warningEmitted, false, 'no warning should be emitted')
  t.assert.deepStrictEqual(JSON.parse(res.body), { hello: 'world' })
})

test('FSTWRN005 fires only once per route pattern', async t => {
  t.plan(1)
  const fastify = Fastify()

  let warningCount = 0
  const warningListener = (warning) => {
    if (warning.code === 'FSTWRN005' && warning.message.includes('/dedup-route')) {
      warningCount++
    }
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.removeListener('warning', warningListener)
    fastify.close()
  })

  fastify.get('/dedup-route', async (req, reply) => {
    // intentionally does not return or call reply.send()
  })

  await fastify.inject({ method: 'GET', url: '/dedup-route' })
  await fastify.inject({ method: 'GET', url: '/dedup-route' })

  await new Promise(resolve => setImmediate(resolve))

  t.assert.strictEqual(warningCount, 1, 'warning should fire exactly once')
})
