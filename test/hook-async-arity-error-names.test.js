'use strict'

const { test } = require('node:test')
const Fastify = require('..')

test('Async hook arity validation error includes hook name for onRequest', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequest'), 'Error message should include hook name "onRequest"')
  }
})

test('Async hook arity validation error includes hook name for preSerialization', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('preSerialization', async (req, reply, payload, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preSerialization'), 'Error message should include hook name "preSerialization"')
  }
})

test('Async hook arity validation error includes hook name for onSend', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onSend', async (req, reply, payload, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'), 'Error message should include hook name "onSend"')
  }
})

test('Async hook arity validation error includes hook name for onError', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onError', async (req, reply, error, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onError'), 'Error message should include hook name "onError"')
  }
})

test('Async hook arity validation error includes hook name for preHandler', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('preHandler', async (req, reply, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'), 'Error message should include hook name "preHandler"')
  }
})

test('Async hook arity validation error includes hook name for onRequestAbort', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onRequestAbort', async (req, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onRequestAbort'), 'Error message should include hook name "onRequestAbort"')
  }
})

test('Async hook arity validation error includes hook name for onReady', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.addHook('onReady', async (done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onReady'), 'Error message should include hook name "onReady"')
  }
})

test('Async hook arity validation error includes hook name for route-level hooks - preHandler', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        preHandler: [
          async (request, reply, done) => {
            t.assert.fail('should not be called')
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preHandler'), 'Error message should include hook name "preHandler"')
  }
})

test('Async hook arity validation error includes hook name for route-level hooks - onSend', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        onSend: [
          async (request, reply, payload, done) => {
            t.assert.fail('should not be called')
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('onSend'), 'Error message should include hook name "onSend"')
  }
})

test('Async hook arity validation error includes hook name for route-level hooks - preSerialization', t => {
  t.plan(2)
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        preSerialization: [
          async (request, reply, payload, done) => {
            t.assert.fail('should not be called')
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
  } catch (e) {
    t.assert.strictEqual(e.code, 'FST_ERR_HOOK_INVALID_ASYNC_HANDLER')
    t.assert.ok(e.message.includes('preSerialization'), 'Error message should include hook name "preSerialization"')
  }
})

test('Async hook arity validation error message format is correct', t => {
  t.plan(1)
  const fastify = Fastify()

  try {
    fastify.addHook('onRequest', async (req, reply, done) => {
      t.assert.fail('should not be called')
    })
  } catch (e) {
    t.assert.strictEqual(
      e.message,
      'Async function for "onRequest" hook has too many arguments. Async hooks should not use the \'done\' argument.',
      'Error message format should match specification'
    )
  }
})
